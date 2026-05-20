// lib/metrics.js — palette discriminability metrics.
//
// Distances are Euclidean ΔE in whatever color-space backend is requested,
// defaulting to OKLab. Pass a different backendKey (e.g. 'cielab') to compute
// distances in that space — useful when you want metrics to match the L axis
// your palette was designed against.

(function (root) {
  function getBackend(key) {
    return root.colorspace.get(key || 'oklab');
  }

  function dE(hexA, hexB, backendKey) {
    const b = getBackend(backendKey);
    const [L1, a1, b1] = b.hexToLab(hexA);
    const [L2, a2, b2] = b.hexToLab(hexB);
    return Math.hypot(L1 - L2, a1 - a2, b1 - b2);
  }

  function minPairwise(hexList, backendKey) {
    let m = Infinity, pair = null;
    for (let i = 0; i < hexList.length; i++) {
      for (let j = i + 1; j < hexList.length; j++) {
        const d = dE(hexList[i], hexList[j], backendKey);
        if (d < m) { m = d; pair = [i, j]; }
      }
    }
    return { min: m, pair: pair };
  }

  function minCross(hexA, hexB, backendKey) {
    let m = Infinity, pair = null;
    for (let i = 0; i < hexA.length; i++) {
      for (let j = 0; j < hexB.length; j++) {
        const d = dE(hexA[i], hexB[j], backendKey);
        if (d < m) { m = d; pair = [i, j]; }
      }
    }
    return { min: m, pair: pair };
  }

  function minOneVsMany(hex, hexList, backendKey) {
    let m = Infinity, idx = -1;
    for (let i = 0; i < hexList.length; i++) {
      const d = dE(hex, hexList[i], backendKey);
      if (d < m) { m = d; idx = i; }
    }
    return { min: m, idx: idx };
  }

  // Build the metric summary for a palette hex map, in the chosen backend.
  // Groups:
  //   std/brt: intra-row mutual distances among c1-c6 and c9-c14.
  //   cross: nearest pair across std and brt rows.
  //   grayMin: mutual distances among the 6 "achromatic" slots (bg/fg/grays).
  //     This is the gray ramp's internal discriminability.
  //   fgMin / bgMin: fg vs chromatic-only and bg vs chromatic-only slots —
  //     "do fg/bg get confused with a colored slot?" The fg-vs-gray case is
  //     covered by grayMin since fg is part of the gray ramp.
  function summary(hex, backendKey) {
    const std = ['c1','c2','c3','c4','c5','c6'].map(k => hex[k]);
    const brt = ['c9','c10','c11','c12','c13','c14'].map(k => hex[k]);
    const chromatic = std.concat(brt);
    const grays = ['bg','fg','c0','c8','c7','c15'].map(k => hex[k]);
    return {
      backend: backendKey || 'oklab',
      stdMin: minPairwise(std, backendKey),
      brtMin: minPairwise(brt, backendKey),
      crossMin: minCross(std, brt, backendKey),
      grayMin: minPairwise(grays, backendKey),
      fgMin: minOneVsMany(hex.fg, chromatic, backendKey),
      bgMin: minOneVsMany(hex.bg, chromatic, backendKey),
    };
  }

  root.metrics = { dE: dE, minPairwise: minPairwise, minCross: minCross, minOneVsMany: minOneVsMany, summary: summary };
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
