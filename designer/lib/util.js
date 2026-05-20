// lib/util.js — sRGB helpers (hex strings, gamma encoding). Pure, no deps.
// Attaches to global `ansil16.util`; works in browser and node.

(function (root) {
  const util = {};

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(c) {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }

  function hexToRgb(hex) {
    const h = String(hex).replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error('bad hex: ' + hex);
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  }

  function rgbToHex(r, g, b) {
    const h = (x) => {
      const n = Math.max(0, Math.min(255, Math.round(x * 255)));
      return n.toString(16).padStart(2, '0').toUpperCase();
    };
    return '#' + h(r) + h(g) + h(b);
  }

  function hexToLinearRgb(hex) {
    const [r, g, b] = hexToRgb(hex);
    return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  }

  function linearRgbToHex(r, g, b) {
    return rgbToHex(linearToSrgb(clamp01(r)), linearToSrgb(clamp01(g)), linearToSrgb(clamp01(b)));
  }

  // sRGB relative luminance, used for swatch text-color contrast picking
  function relativeLuminance(hex) {
    const [r, g, b] = hexToLinearRgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  util.clamp01 = clamp01;
  util.srgbToLinear = srgbToLinear;
  util.linearToSrgb = linearToSrgb;
  util.hexToRgb = hexToRgb;
  util.rgbToHex = rgbToHex;
  util.hexToLinearRgb = hexToLinearRgb;
  util.linearRgbToHex = linearRgbToHex;
  util.relativeLuminance = relativeLuminance;

  root.util = util;
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
