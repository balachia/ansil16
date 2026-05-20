// lib/jzazbz.js — Jzazbz (Safdar et al. 2017) backend.
//
// Jzazbz is a perceptual colorspace built on a PQ-encoded LMS pipeline. Key
// advantages over OKLab/CIELAB for our purposes:
//   - Blue-purple region is more uniform (PQ behaves better than cube root).
//   - Pure black is structurally unique (Jz=0): `pq_inv` clamps sub-c1 inputs
//     to zero, so chromaticity contributions at the L extremes can't escape
//     into "different blacks" the way OKLab math does.
//
// CONVENTION NOTE: Safdar's paper text gives m2 = 1.7 * 2523/4096 ≈ 1.047,
// but with that exponent the chromaticity values collapse to noise (PQ output
// for SDR inputs is squeezed into [0.83, 1.0] and Az/Bz are tiny). The
// colour-science Python library and other published implementations use
// standard BT.2100 PQ exponent (m2 = 2523*128/4096 ≈ 78.84). That's what
// gives a sensible perceptual space. We follow that convention here.
//
// Native output ranges (no normalization applied):
//   Jz: [0, ~1] for sRGB primaries (peak white ≈ 1).
//   Az, Bz: ±0.15 ish for saturated primaries.

(function (root) {
  const { hexToLinearRgb, linearRgbToHex } = root.util;

  // Constants (Safdar 2017 Table 1)
  const b_coef = 1.15;
  const g_coef = 0.66;
  const c1 = 3424 / 4096;       // 0.8359375
  const c2 = 2413 / 128;        // 18.8515625
  const c3 = 2392 / 128;        // 18.6875
  const m1 = 2610 / 16384;      // 0.15930...
  const m2 = 2523 * 128 / 4096; // 78.84375 (standard PQ, per colour-science)
  const d_coef = -0.56;
  const d_0 = 1.6295499532821566e-11;

  // PQ encoder. v expected in [0, 1] (linear, relative).
  function pq(v) {
    if (v <= 0) return 0;
    const vn = Math.pow(v, m1);
    return Math.pow((c1 + c2 * vn) / (1 + c3 * vn), m2);
  }

  // PQ decoder. Clamps to 0 when input is sub-c1 (below black) — this is the
  // mechanism that makes Jz=0 collapse to pure black for any (Az, Bz).
  function pq_inv(vp) {
    if (vp <= 0) return 0;
    const vpm = Math.pow(vp, 1 / m2);
    const num = vpm - c1;
    if (num <= 0) return 0;
    const den = c2 - c3 * vpm;
    if (den <= 0) return 1;
    return Math.pow(num / den, 1 / m1);
  }

  // sRGB linear → XYZ (D65)
  function linearRgbToXyz(r, g, b) {
    return [
      0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
      0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
      0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
    ];
  }
  function xyzToLinearRgb(X, Y, Z) {
    return [
      3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
      -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z,
      0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
    ];
  }

  function xyzToJzazbz(X, Y, Z) {
    // Asymmetric XYZ preprocessing
    const Xp = b_coef * X - (b_coef - 1) * Z;
    const Yp = g_coef * Y - (g_coef - 1) * X;
    // X'Y'Z' → LMS (Safdar matrix)
    const L = 0.41478972 * Xp + 0.579999 * Yp + 0.0146480 * Z;
    const M = -0.2015100 * Xp + 1.120649 * Yp + 0.0531008 * Z;
    const S = -0.0166008 * Xp + 0.264800 * Yp + 0.6684799 * Z;
    // PQ-encode
    const Lp = pq(L), Mp = pq(M), Sp = pq(S);
    // L'M'S' → IzAzBz (opponent channels)
    const Iz = 0.5 * (Lp + Mp);
    const Az = 3.524000 * Lp - 4.066708 * Mp + 0.542708 * Sp;
    const Bz = 0.199076 * Lp + 1.096799 * Mp - 1.295875 * Sp;
    // Iz → Jz (lightness correction)
    const Jz = ((1 + d_coef) * Iz) / (1 + d_coef * Iz) - d_0;
    return [Jz, Az, Bz];
  }

  function jzazbzToXyz(Jz, Az, Bz) {
    const Iz = (Jz + d_0) / (1 + d_coef - d_coef * (Jz + d_0));
    // IzAzBz → L'M'S' (inverse matrix)
    const Lp = Iz + 0.1386050432715393 * Az + 0.0580473161561453 * Bz;
    const Mp = Iz - 0.1386050432715393 * Az - 0.0580473161561453 * Bz;
    const Sp = Iz - 0.0960192420263191 * Az - 0.8118918960560390 * Bz;
    // PQ-decode
    const L = pq_inv(Lp), M = pq_inv(Mp), S = pq_inv(Sp);
    // LMS → X'Y'Z' (inverse Safdar matrix)
    const Xp = 1.9242264357876067 * L - 1.0047923125953657 * M + 0.037651404030616 * S;
    const Yp = 0.35031676209499907 * L + 0.7264811939316552 * M - 0.06538442294808501 * S;
    const Z  = -0.09098281098284752 * L - 0.31272829052307397 * M + 1.5227665613052603 * S;
    // X'Y'Z' → XYZ (inverse preprocessing; note Y depends on recovered X)
    const X = (Xp + (b_coef - 1) * Z) / b_coef;
    const Y = (Yp + (g_coef - 1) * X) / g_coef;
    return [X, Y, Z];
  }

  function inGamut(L, a, b) {
    const [X, Y, Z] = jzazbzToXyz(L, a, b);
    const [r, g, bl] = xyzToLinearRgb(X, Y, Z);
    const eps = 1e-4;
    return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && bl >= -eps && bl <= 1 + eps;
  }

  function labToLinearRgbFn(L, a, b) {
    const [X, Y, Z] = jzazbzToXyz(L, a, b);
    return xyzToLinearRgb(X, Y, Z);
  }

  const backend = {
    name: 'Jzazbz (Safdar 2017)',
    // Max |Az| or |Bz| for in-gamut sRGB primaries ≈ 0.16. Pad slightly.
    AB_range: 0.18,

    hexToLab(hex) {
      const [r, g, b] = hexToLinearRgb(hex);
      const [X, Y, Z] = linearRgbToXyz(r, g, b);
      return xyzToJzazbz(X, Y, Z);
    },

    labToHex(L, a, b) {
      const [r, g, bl] = labToLinearRgbFn(L, a, b);
      return linearRgbToHex(r, g, bl);
    },

    inGamut: inGamut,
    labToLinearRgb: labToLinearRgbFn,
  };

  root.colorspace.register('jzazbz', backend);
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
