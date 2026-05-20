// lib/oklab.js — OKLab (Björn Ottosson, 2020) backend.
// Matrices from https://bottosson.github.io/posts/oklab/
//
// L is exposed in [0, 1] (matches OKLab's native scale).
// a, b are exposed in their native scale (roughly ±0.4 covers sRGB gamut).

(function (root) {
  const { hexToLinearRgb, linearRgbToHex } = root.util;

  function linearRgbToOklab(r, g, b) {
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const lp = Math.cbrt(l), mp = Math.cbrt(m), sp = Math.cbrt(s);
    return [
      0.2104542553 * lp + 0.7936177850 * mp - 0.0040720468 * sp,
      1.9779984951 * lp - 2.4285922050 * mp + 0.4505937099 * sp,
      0.0259040371 * lp + 0.7827717662 * mp - 0.8086757660 * sp,
    ];
  }

  function oklabToLinearRgb(L, a, b) {
    const lp = L + 0.3963377774 * a + 0.2158037573 * b;
    const mp = L - 0.1055613458 * a - 0.0638541728 * b;
    const sp = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = lp * lp * lp, m = mp * mp * mp, s = sp * sp * sp;
    return [
      +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
  }

  function inGamut(L, a, b) {
    const [r, g, bl] = oklabToLinearRgb(L, a, b);
    const eps = 1e-4;
    return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && bl >= -eps && bl <= 1 + eps;
  }

  const backend = {
    name: 'OKLab (Ottosson 2020)',
    AB_range: 0.33,

    hexToLab(hex) {
      const [r, g, b] = hexToLinearRgb(hex);
      return linearRgbToOklab(r, g, b);
    },

    labToHex(L, a, b) {
      const [r, g, bl] = oklabToLinearRgb(L, a, b);
      return linearRgbToHex(r, g, bl);
    },

    inGamut: inGamut,
    labToLinearRgb: oklabToLinearRgb,

    // exposed for tests / introspection
    _linearRgbToOklab: linearRgbToOklab,
  };

  root.colorspace.register('oklab', backend);
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
