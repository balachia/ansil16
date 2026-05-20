// lib/calibrate-loss.js — composite loss function for #1 (palette calibrator).
//
// Components (positive = bad, lower = better):
//   id       C1: hue drift from seed palette (per-slot quadratic penalty)
//   ord      C2: per-pair contrast-to-bg ordering (emphasis row should have
//                more bg-contrast than its matching standard; hinge penalty)
//   group    C3: standard-vs-emphasis group classifiability (1 - 1-NN LOO accuracy)
//   disc     Discriminability: negated min ΔE over chromatic pairs (so optimizer
//            maximizes min separation). Aggregated as min (not mean) to dodge
//            the Bujack 2022 non-Riemannian large-difference issue.
//   legib    Legibility floor (slot-vs-bg): hinge on |ΔL(slot, bg)| < threshold
//   legibPair Chromatic-pair legibility: hinge on chromatic pairs that are
//             iso-luminant AND not chromatically very far apart. Captures the
//             "c4-on-c6 unreadable" failure mode that the slot-vs-bg floor
//             misses. Per Legge / chromatic-CSF literature, thin-stroke text
//             legibility requires luminance contrast (chromatic doesn't carry
//             at high spatial frequencies). This term structurally precludes
//             iso-luminant chromatic pairs — the loss-function complement to
//             the alternating-L* design rule (chainlink #16).
//   bounds   Hard-ish bounds: stay within hue/L/chroma boxes around seed
//
// Total = Σ_k weights[k] * component_k. Defaults documented inline.
//
// All distances are Euclidean in the palette's active colorspace backend
// (OKLab by default; CAM16-UCS once #11 lands). Substrate-agnostic.

(function (root) {
  const P = root.palette;

  function hue(a, b) { return Math.atan2(b, a); }
  function chroma(a, b) { return Math.hypot(a, b); }

  function hueDelta(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  // 1-NN leave-one-out accuracy for points [{L, a, b, label}].
  function loo1NN(points) {
    let correct = 0;
    for (let i = 0; i < points.length; i++) {
      let bestD = Infinity, bestLabel = -1;
      for (let j = 0; j < points.length; j++) {
        if (i === j) continue;
        const dL = points[i].L - points[j].L;
        const da = points[i].a - points[j].a;
        const db = points[i].b - points[j].b;
        const d = dL * dL + da * da + db * db;
        if (d < bestD) { bestD = d; bestLabel = points[j].label; }
      }
      if (bestLabel === points[i].label) correct++;
    }
    return correct / points.length;
  }

  // Read chromatic slot coords in the palette's active backend.
  // Returns {std, brt, all} where each is an array of {L, a, b, label} points.
  function readChromatic(pal) {
    const std = pal.state.std.dots.map(d => ({ L: d.L, a: d.a, b: d.b, label: 0 }));
    const brt = pal.state.brt.dots.map(d => ({ L: d.L, a: d.a, b: d.b, label: 1 }));
    return { std: std, brt: brt, all: std.concat(brt) };
  }

  // Cache seed Lab coords (the seed palette doesn't change during a session).
  function seedLab(seedHex, backend) {
    const stdLab = P.STD_SLOTS.map(k => backend.hexToLab(seedHex[k]));
    const brtLab = P.BRT_SLOTS.map(k => backend.hexToLab(seedHex[k]));
    return { std: stdLab, brt: brtLab };
  }

  // Default weights tuned so that on luv-rainbow-light, all components contribute
  // at roughly comparable magnitude (within ~10× of each other).
  const DEFAULT_WEIGHTS = {
    id: 1.0, ord: 5.0, group: 2.0, disc: 5.0,
    legib: 10.0, legibPair: 5.0, bounds: 100.0,
  };

  function composeLoss(pal, opts) {
    opts = opts || {};
    if (!opts.seedHex) throw new Error('composeLoss requires opts.seedHex');

    const weights = Object.assign({}, DEFAULT_WEIGHTS, opts.weights || {});
    const epsContrast = opts.epsContrast == null ? 0.05 : opts.epsContrast;
    const legibFloor = opts.legibFloor == null ? 0.15 : opts.legibFloor;
    // Chromatic-pair legibility: ΔL floor that thin-stroke text legibility
    // requires, and a chromatic-distance threshold above which pairs are
    // "obviously different colors" and don't need luminance disambiguation
    // for swatch-distinguishability (text may still suffer, but at-a-glance
    // they read as separate). Defaults are CIELAB-normalized.
    const legibPairLFloor = opts.legibPairLFloor == null ? 0.08 : opts.legibPairLFloor;
    const legibPairCFloor = opts.legibPairCFloor == null ? 0.5 : opts.legibPairCFloor;
    const hueBounds = opts.hueBounds == null ? Math.PI / 12 : opts.hueBounds; // 15°
    const lBounds = opts.lBounds == null ? 0.1 : opts.lBounds;
    const chromaBounds = opts.chromaBounds == null ? 0.08 : opts.chromaBounds;
    const effectiveDE = opts.effectiveDE || null;

    const backend = root.colorspace.get(pal.state.backend);
    const seed = seedLab(opts.seedHex, backend);

    const { std, brt, all } = readChromatic(pal);
    const bgL = pal.state.grays.bg.L;

    // ----- C1: hue drift from seed (radians²) -----
    let cId = 0;
    for (let k = 0; k < 6; k++) {
      const ts = hue(seed.std[k][1], seed.std[k][2]);
      const tc = hue(std[k].a, std[k].b);
      const d = hueDelta(tc, ts);
      cId += d * d;
    }
    for (let k = 0; k < 6; k++) {
      const ts = hue(seed.brt[k][1], seed.brt[k][2]);
      const tc = hue(brt[k].a, brt[k].b);
      const d = hueDelta(tc, ts);
      cId += d * d;
    }

    // ----- C2: per-pair contrast-to-bg ordering -----
    let cOrd = 0;
    for (let k = 0; k < 6; k++) {
      const rStd = Math.abs(std[k].L - bgL);
      const rBrt = Math.abs(brt[k].L - bgL);
      cOrd += Math.max(0, epsContrast - (rBrt - rStd));
    }

    // ----- C3: group classifiability (1 - 1-NN LOO accuracy) -----
    const acc = loo1NN(all);
    const cGroup = 1.0 - acc;

    // ----- Discriminability: min ΔE over chromatic pairs (negated) -----
    let minDist = Infinity;
    let minPair = null;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const dL = all[i].L - all[j].L;
        const da = all[i].a - all[j].a;
        const db = all[i].b - all[j].b;
        let d = Math.sqrt(dL * dL + da * da + db * db);
        if (effectiveDE) d = effectiveDE(i, j, d);
        if (d < minDist) { minDist = d; minPair = [i, j]; }
      }
    }
    const cDisc = -minDist;

    // ----- Legibility floor: |ΔL(slot, bg)| ≥ legibFloor -----
    let cLegib = 0;
    for (const c of all) {
      cLegib += Math.max(0, legibFloor - Math.abs(c.L - bgL));
    }

    // ----- Chromatic-pair legibility: bilinear hinge over pairs -----
    // Penalize chromatic pairs that are simultaneously iso-luminant AND
    // not chromatically far apart. Normalized over the number of pairs so
    // the term magnitude is bounded in [0, 1].
    let cLegibPair = 0;
    const nPairs = all.length * (all.length - 1) / 2;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const dL = Math.abs(all[i].L - all[j].L);
        const da = all[i].a - all[j].a;
        const db = all[i].b - all[j].b;
        const dC = Math.sqrt(da * da + db * db);
        const lShort = Math.max(0, legibPairLFloor - dL) / legibPairLFloor;
        const cShort = Math.max(0, legibPairCFloor - dC) / legibPairCFloor;
        cLegibPair += lShort * cShort;
      }
    }
    cLegibPair /= nPairs;

    // ----- Bounds (constraint boxes from seed) -----
    let cBounds = 0;
    const checkBounds = (row, seedLabRow) => {
      for (let k = 0; k < 6; k++) {
        const ts = hue(seedLabRow[k][1], seedLabRow[k][2]);
        const tc = hue(row[k].a, row[k].b);
        const dT = Math.abs(hueDelta(tc, ts));
        cBounds += Math.max(0, dT - hueBounds);

        cBounds += Math.max(0, Math.abs(row[k].L - seedLabRow[k][0]) - lBounds);

        const cs = chroma(seedLabRow[k][1], seedLabRow[k][2]);
        const cc = chroma(row[k].a, row[k].b);
        cBounds += Math.max(0, Math.abs(cc - cs) - chromaBounds);
      }
    };
    checkBounds(std, seed.std);
    checkBounds(brt, seed.brt);

    const total =
      weights.id * cId +
      weights.ord * cOrd +
      weights.group * cGroup +
      weights.disc * cDisc +
      weights.legib * cLegib +
      weights.legibPair * cLegibPair +
      weights.bounds * cBounds;

    return {
      total: total,
      components: {
        id: cId, ord: cOrd, group: cGroup,
        disc: cDisc, legib: cLegib, legibPair: cLegibPair,
        bounds: cBounds,
      },
      weights: weights,
      meta: { minDist: minDist, minPair: minPair, classifAccuracy: acc },
    };
  }

  root.calibrate = root.calibrate || {};
  root.calibrate.composeLoss = composeLoss;
  root.calibrate.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
  // Exposed for tests / external use:
  root.calibrate._hue = hue;
  root.calibrate._chroma = chroma;
  root.calibrate._hueDelta = hueDelta;
  root.calibrate._loo1NN = loo1NN;
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
