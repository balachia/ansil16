// lib/cielab.js — CIELAB (D65) backend.
//
// All of L, a, b are normalized by 100 so they live on a scale commensurate
// with OKLab and so canonical CIELAB ΔE76 = 100 × Euclidean distance here.
// (Native CIELAB has L* ∈ [0, 100] and a*/b* ∈ ~±128. We divide all by 100,
// putting L on [0, 1] and a/b on ~±1.3.)
//
// D65 reference white: Xn = 0.95047, Yn = 1.0, Zn = 1.08883.

(function (root) {
  const { hexToLinearRgb, linearRgbToHex } = root.util;

  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const DELTA = 6 / 29;
  const DELTA_CUBED = DELTA * DELTA * DELTA; // ≈0.008856
  const THREE_DELTA_SQ = 3 * DELTA * DELTA;  // ≈0.12842

  function f(t) {
    return t > DELTA_CUBED ? Math.cbrt(t) : t / THREE_DELTA_SQ + 4 / 29;
  }
  function fInv(t) {
    return t > DELTA ? t * t * t : THREE_DELTA_SQ * (t - 4 / 29);
  }

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

  function xyzToLab(X, Y, Z) {
    const fx = f(X / Xn), fy = f(Y / Yn), fz = f(Z / Zn);
    return [
      116 * fy - 16,        // L* in [0, 100]
      500 * (fx - fy),
      200 * (fy - fz),
    ];
  }
  function labToXyz(L, a, b) {
    const fy = (L + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;
    return [Xn * fInv(fx), Yn * fInv(fy), Zn * fInv(fz)];
  }

  function labToLinearRgb(L_n, a_n, b_n) {
    const [X, Y, Z] = labToXyz(L_n * 100, a_n * 100, b_n * 100);
    return xyzToLinearRgb(X, Y, Z);
  }

  function inGamut(L_n, a_n, b_n) {
    const [r, g, bl] = labToLinearRgb(L_n, a_n, b_n);
    const eps = 1e-4;
    return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && bl >= -eps && bl <= 1 + eps;
  }

  const backend = {
    name: 'CIELAB (D65)',
    AB_range: 1.3, // ~max |a*|/100 in sRGB gamut

    hexToLab(hex) {
      const [r, g, b] = hexToLinearRgb(hex);
      const [X, Y, Z] = linearRgbToXyz(r, g, b);
      const [L, ai, bi] = xyzToLab(X, Y, Z);
      return [L / 100, ai / 100, bi / 100]; // all normalized
    },

    labToHex(L_n, a_n, b_n) {
      const [r, g, bl] = labToLinearRgb(L_n, a_n, b_n);
      return linearRgbToHex(r, g, bl);
    },

    inGamut: inGamut,
    labToLinearRgb: labToLinearRgb,
  };

  root.colorspace.register('cielab', backend);
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
