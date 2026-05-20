// lib/colorspace.js — strategy registry for switchable color-space backends.
//
// Each backend must expose:
//   name:       string (UI label)
//   AB_range:   number — half-extent of (a, b) canvas axes (e.g. OKLab ≈ 0.33)
//   hexToLab(hex)          -> [L, a, b]   // L normalized to [0, 1]
//   labToHex(L, a, b)      -> string      // closest valid sRGB hex (clamped)
//   inGamut(L, a, b)       -> boolean     // is (L, a, b) inside sRGB?
//   labToLinearRgb(L,a,b)  -> [r, g, b]   // unclamped, for fast canvas tinting

(function (root) {
  const cs = {};
  const _backends = {};

  cs.register = function (key, backend) {
    const required = ['name', 'AB_range', 'hexToLab', 'labToHex', 'inGamut', 'labToLinearRgb'];
    for (const k of required) {
      if (!(k in backend)) throw new Error(`colorspace ${key} missing: ${k}`);
    }
    _backends[key] = backend;
  };

  cs.get = function (key) {
    if (!(key in _backends)) throw new Error('unknown colorspace: ' + key);
    return _backends[key];
  };

  cs.keys = function () {
    return Object.keys(_backends);
  };

  // Binary search the maximum scalar t in [0, 1] such that (L, a*t, b*t)
  // stays inside the sRGB gamut. Used to clip a dragged dot to its current
  // gamut slice. Backend-agnostic — depends only on inGamut.
  cs.clipToGamut = function (backend, L, a, b, iters) {
    if (backend.inGamut(L, a, b)) return { a: a, b: b };
    let lo = 0, hi = 1;
    for (let i = 0; i < (iters || 24); i++) {
      const m = (lo + hi) / 2;
      if (backend.inGamut(L, a * m, b * m)) lo = m;
      else hi = m;
    }
    return { a: a * lo, b: b * lo };
  };

  // (L, C, h°) → (L, a, b). Polar form for seeding initial dot positions.
  cs.lchToLab = function (L, C, hDeg) {
    const rad = (hDeg * Math.PI) / 180;
    return [L, C * Math.cos(rad), C * Math.sin(rad)];
  };

  root.colorspace = cs;
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
