// lib/calibrate-triad.js — MLDS-style triad sampling and response aggregation.
//
// A triad trial shows three chromatic slots and asks the user "which is most
// different from the other two?" The unpicked pair is implicitly judged
// closest. Each response gives 2 ordering constraints (un-picked < each of
// the picked-involving pairs).
//
// Closeness scoring (v1 simplification, not full MLDS-MLE):
//   closeness(i, j) = (times pair was un-picked) / (times pair appeared in trial)
//   effective(i, j) = base(i, j) · (1 - alpha · closeness(i, j))
//
// Trial-type mix (each trial samples ONE type per rng() roll):
//   weighted    — min-pair-weighted (gradient signal for optimizer)
//   crossTier   — 1 slot from each tier + 1 random (validates C2 group ordering)
//   asymptote   — equidistant triad (max info per trial in ambiguous regions)
//   easyControl — 3 maximally-far-apart slots (data-quality check + perception reset)
//   uniform     — pure random (fallback when crossTier omitted)
//
// Default mix when tierLabels provided: 55/20/15/10 (weighted/cross/asymp/easy).
// Without tierLabels: 55/0/15/10 + 20 uniform.
//
// Cooldown: the closest pair within each sampled triad is added to a FIFO
// queue (length ≤ cooldown). Pairs in the queue are excluded from
// weighted-sampling candidate pools — prevents the same anchor pair from
// driving consecutive trials (anti-rut from user-observed habituation bias).

(function (root) {
  function makeTriadState(slotCount, opts) {
    opts = opts || {};
    const alpha = opts.alpha == null ? 0.5 : opts.alpha;
    const rng = opts.rng || Math.random;
    const cooldown = opts.cooldown == null ? 2 : opts.cooldown;
    const tierLabels = opts.tierLabels || null;
    const probeAttempts = opts.probeAttempts == null ? 30 : opts.probeAttempts;

    // Mix percentages. If user supplies a partial mix, defaults backfill.
    const userMix = opts.mix || {};
    const mix = {
      weighted:    userMix.weighted    == null ? 0.55 : userMix.weighted,
      crossTier:   userMix.crossTier   == null ? (tierLabels ? 0.20 : 0.0) : userMix.crossTier,
      asymptote:   userMix.asymptote   == null ? 0.15 : userMix.asymptote,
      easyControl: userMix.easyControl == null ? 0.10 : userMix.easyControl,
    };
    const knownSum = mix.weighted + mix.crossTier + mix.asymptote + mix.easyControl;
    mix.uniform = Math.max(0, 1.0 - knownSum);

    // Per-tier slot indices (if tierLabels provided)
    const tierBuckets = {};
    if (tierLabels) {
      for (let k = 0; k < slotCount; k++) {
        const t = tierLabels[k];
        if (!(t in tierBuckets)) tierBuckets[t] = [];
        tierBuckets[t].push(k);
      }
    }

    // Upper-triangular response storage
    const closeCount = Array.from({ length: slotCount }, () => new Array(slotCount).fill(0));
    const seenCount = Array.from({ length: slotCount }, () => new Array(slotCount).fill(0));
    let totalTrials = 0;
    const recentPairs = []; // FIFO of pair-key strings

    function lowHi(i, j) { return i < j ? [i, j] : [j, i]; }
    function pairKey(i, j) { const [lo, hi] = lowHi(i, j); return lo + ',' + hi; }

    function closeness(i, j) {
      if (i === j) return 0;
      const [lo, hi] = lowHi(i, j);
      const s = seenCount[lo][hi];
      return s === 0 ? 0 : closeCount[lo][hi] / s;
    }

    function effectiveDeltaE(i, j, baseDist) {
      return baseDist * (1 - alpha * closeness(i, j));
    }

    function randInt(n) { return Math.floor(rng() * n); }

    function pickRandomDistinct(n, exclude) {
      const choices = [];
      for (let k = 0; k < slotCount; k++) {
        if (!exclude || exclude.indexOf(k) < 0) choices.push(k);
      }
      // Fisher-Yates partial shuffle for first `n`
      for (let i = 0; i < n && i < choices.length; i++) {
        const j = i + randInt(choices.length - i);
        const tmp = choices[i]; choices[i] = choices[j]; choices[j] = tmp;
      }
      return choices.slice(0, n);
    }

    function sampleUniformTriad() {
      return pickRandomDistinct(3, null);
    }

    function sampleWeightedTriad(distFn) {
      const pairs = [];
      for (let i = 0; i < slotCount; i++) {
        for (let j = i + 1; j < slotCount; j++) {
          const d = distFn(i, j);
          pairs.push({ i: i, j: j, weight: 1 / Math.max(d, 1e-6) });
        }
      }
      let eligible = pairs.filter(p => recentPairs.indexOf(pairKey(p.i, p.j)) < 0);
      if (eligible.length === 0) eligible = pairs;

      const totalW = eligible.reduce((s, p) => s + p.weight, 0);
      let r = rng() * totalW;
      let chosen = eligible[eligible.length - 1];
      for (const p of eligible) {
        r -= p.weight;
        if (r <= 0) { chosen = p; break; }
      }
      const third = pickRandomDistinct(1, [chosen.i, chosen.j])[0];
      return { triad: [chosen.i, chosen.j, third], anchor: [chosen.i, chosen.j] };
    }

    function sampleCrossTierTriad() {
      // Pick 1 slot from each of two distinct tiers, then a third uniformly.
      // Falls back to uniform if tierLabels missing or only one tier present.
      const tiers = Object.keys(tierBuckets || {});
      if (tiers.length < 2) return sampleUniformTriad();
      const t0 = tiers[randInt(tiers.length)];
      let t1 = tiers[randInt(tiers.length)];
      while (t1 === t0) t1 = tiers[randInt(tiers.length)];
      const a = tierBuckets[t0][randInt(tierBuckets[t0].length)];
      const b = tierBuckets[t1][randInt(tierBuckets[t1].length)];
      const c = pickRandomDistinct(1, [a, b])[0];
      return [a, b, c];
    }

    function sampleAsymptoteTriad(distFn) {
      // Sample N random triads, pick the one with most-uniform pairwise distances.
      // (Coefficient of variation as score — lower = more equidistant.)
      let best = null, bestScore = Infinity;
      for (let attempt = 0; attempt < probeAttempts; attempt++) {
        const t = sampleUniformTriad();
        const d01 = distFn(t[0], t[1]);
        const d02 = distFn(t[0], t[2]);
        const d12 = distFn(t[1], t[2]);
        const mean = (d01 + d02 + d12) / 3;
        if (mean < 1e-9) continue;
        const variance = ((d01 - mean) ** 2 + (d02 - mean) ** 2 + (d12 - mean) ** 2) / 3;
        const score = Math.sqrt(variance) / mean;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      return best || sampleUniformTriad();
    }

    function sampleEasyControlTriad(distFn) {
      // Sample N random triads, pick the one with greatest minimum pairwise distance.
      // Visually maximally-separated triad — sanity check + perception reset.
      let best = null, bestMinD = -Infinity;
      for (let attempt = 0; attempt < probeAttempts; attempt++) {
        const t = sampleUniformTriad();
        const d01 = distFn(t[0], t[1]);
        const d02 = distFn(t[0], t[2]);
        const d12 = distFn(t[1], t[2]);
        const minD = Math.min(d01, d02, d12);
        if (minD > bestMinD) { bestMinD = minD; best = t; }
      }
      return best || sampleUniformTriad();
    }

    function pickTrialType() {
      const r = rng();
      let cum = mix.weighted;             if (r < cum) return 'weighted';
      cum += mix.crossTier;               if (r < cum) return 'crossTier';
      cum += mix.asymptote;               if (r < cum) return 'asymptote';
      cum += mix.easyControl;             if (r < cum) return 'easyControl';
      return 'uniform';
    }

    function shuffle3(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    }

    function sampleTriad(distFn) {
      const type = pickTrialType();
      let triad, anchor = null;
      switch (type) {
        case 'weighted': {
          const r = sampleWeightedTriad(distFn);
          triad = r.triad;
          anchor = r.anchor; // weighted has a deliberate anchor → cooldown applies
          break;
        }
        case 'crossTier':   triad = sampleCrossTierTriad(); break;
        case 'asymptote':   triad = sampleAsymptoteTriad(distFn); break;
        case 'easyControl': triad = sampleEasyControlTriad(distFn); break;
        default:            triad = sampleUniformTriad();
      }

      // Cooldown only applies to deliberate anchor choices (weighted). Other
      // trial types are structurally diverse already; tracking their "closest
      // pair" would risk evicting the actual weighted anchor next time.
      if (anchor) {
        recentPairs.push(pairKey(anchor[0], anchor[1]));
        while (recentPairs.length > cooldown) recentPairs.shift();
      }

      return { triad: shuffle3(triad.slice()), type: type };
    }

    function recordResponse(triad, pickedIdx) {
      if (pickedIdx < 0 || pickedIdx > 2) throw new Error('pickedIdx must be 0, 1, or 2');
      totalTrials++;
      const picked = triad[pickedIdx];
      const unPicked = triad.filter((_, idx) => idx !== pickedIdx);
      const [u1, u2] = unPicked;
      const [lo, hi] = lowHi(u1, u2);
      seenCount[lo][hi]++;
      closeCount[lo][hi]++;
      for (const o of unPicked) {
        const [plo, phi] = lowHi(picked, o);
        seenCount[plo][phi]++;
      }
    }

    function getState() {
      return {
        totalTrials: totalTrials,
        seenCount: seenCount,
        closeCount: closeCount,
        recentPairs: recentPairs.slice(),
        mix: mix,
      };
    }

    return {
      sampleTriad: sampleTriad,
      recordResponse: recordResponse,
      closeness: closeness,
      effectiveDeltaE: effectiveDeltaE,
      getState: getState,
    };
  }

  root.calibrate = root.calibrate || {};
  root.calibrate.makeTriadState = makeTriadState;
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
