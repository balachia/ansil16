// tests/calibrate-triad.test.js
(function () {
  const cal = ansil16.calibrate;

  // ----- Response aggregation -----

  test('makeTriadState: closeness starts at 0 for all pairs', () => {
    const t = cal.makeTriadState(6);
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        assertEq(t.closeness(i, j), 0);
      }
    }
  });

  test('makeTriadState: effectiveDeltaE is identity when no responses recorded', () => {
    const t = cal.makeTriadState(6);
    assertEq(t.effectiveDeltaE(0, 1, 0.2), 0.2);
    assertEq(t.effectiveDeltaE(2, 5, 0.5), 0.5);
  });

  test('recordResponse: bumps closeness for un-picked pair', () => {
    const t = cal.makeTriadState(6);
    t.recordResponse([1, 2, 4], 2);
    assertClose(t.closeness(1, 2), 1.0);
    assertClose(t.closeness(1, 4), 0);
    assertClose(t.closeness(2, 4), 0);
  });

  test('recordResponse: stable closeness across multiple consistent picks', () => {
    const t = cal.makeTriadState(6);
    t.recordResponse([1, 2, 3], 2);
    t.recordResponse([1, 4, 2], 1);
    t.recordResponse([5, 1, 2], 0);
    assertClose(t.closeness(1, 2), 1.0);
  });

  test('recordResponse: mixed signals average correctly', () => {
    const t = cal.makeTriadState(6);
    t.recordResponse([1, 2, 3], 2);
    t.recordResponse([1, 2, 3], 0);
    assertClose(t.closeness(1, 2), 0.5);
    assertClose(t.closeness(2, 3), 0.5);
    assertClose(t.closeness(1, 3), 0);
  });

  test('effectiveDeltaE: high closeness reduces effective distance', () => {
    const t = cal.makeTriadState(6, { alpha: 0.5 });
    t.recordResponse([1, 2, 3], 2);
    assertClose(t.effectiveDeltaE(1, 2, 0.2), 0.1);
  });

  test('effectiveDeltaE: symmetric in (i, j)', () => {
    const t = cal.makeTriadState(6);
    t.recordResponse([1, 2, 3], 2);
    assertEq(t.effectiveDeltaE(1, 2, 0.3), t.effectiveDeltaE(2, 1, 0.3));
  });

  test('recordResponse: rejects invalid pickedIdx', () => {
    const t = cal.makeTriadState(6);
    let threw = false;
    try { t.recordResponse([0, 1, 2], 3); } catch (e) { threw = true; }
    if (!threw) throw new Error('expected throw on invalid pickedIdx');
  });

  test('getState: reports trial count and pair counts', () => {
    const t = cal.makeTriadState(6);
    assertEq(t.getState().totalTrials, 0);
    t.recordResponse([0, 1, 2], 0);
    t.recordResponse([0, 1, 3], 1);
    assertEq(t.getState().totalTrials, 2);
  });

  // ----- Sampling: return shape -----

  test('sampleTriad: returns {triad, type} object', () => {
    const t = cal.makeTriadState(6, { mix: { weighted: 1, crossTier: 0, asymptote: 0, easyControl: 0 } });
    const distFn = (i, j) => Math.abs(i - j) * 0.1;
    const r = t.sampleTriad(distFn);
    if (!Array.isArray(r.triad)) throw new Error('expected r.triad to be array');
    if (r.triad.length !== 3) throw new Error('expected length-3 triad');
    if (typeof r.type !== 'string') throw new Error('expected r.type to be string');
  });

  test('sampleTriad: returns 3 distinct slot indices across mixed types', () => {
    const t = cal.makeTriadState(12, {
      tierLabels: [0,0,0,0,0,0,1,1,1,1,1,1],
      cooldown: 2,
    });
    const distFn = (i, j) => Math.abs(i - j) * 0.1;
    for (let trial = 0; trial < 50; trial++) {
      const r = t.sampleTriad(distFn);
      const uniq = new Set(r.triad);
      assertEq(uniq.size, 3, 'triad ' + JSON.stringify(r.triad) + ' has duplicates');
    }
  });

  // ----- Sampling: weighted -----

  test('sampleTriad weighted: biases heavily toward min-distance pair', () => {
    const t = cal.makeTriadState(6, {
      mix: { weighted: 1, crossTier: 0, asymptote: 0, easyControl: 0 },
      cooldown: 0,
    });
    const distFn = (i, j) => ((i === 0 && j === 1) || (i === 1 && j === 0)) ? 0.01 : 1.0;
    let hits = 0;
    for (let trial = 0; trial < 200; trial++) {
      const r = t.sampleTriad(distFn);
      if (r.triad.includes(0) && r.triad.includes(1)) hits++;
    }
    if (hits < 150) throw new Error('expected min pair in ≥75% of weighted trials, got ' + hits + '/200');
  });

  test('sampleTriad weighted: cooldown prevents same anchor pair in consecutive trials', () => {
    const t = cal.makeTriadState(6, {
      mix: { weighted: 1, crossTier: 0, asymptote: 0, easyControl: 0 },
      cooldown: 1,
    });
    const distFn = (i, j) => ((i === 0 && j === 1) || (i === 1 && j === 0)) ? 0.01 : 1.0;
    // Trial 1: weighted will heavily favor (0,1); anchor → "0,1" pushed to recentPairs.
    t.sampleTriad(distFn);
    const s1 = t.getState();
    if (s1.recentPairs[s1.recentPairs.length - 1] !== '0,1') {
      throw new Error('trial 1 anchor should be (0,1); recentPairs=' + JSON.stringify(s1.recentPairs));
    }
    // Trial 2: (0,1) is in cooldown, so weighted candidates exclude it; the
    // chosen anchor MUST differ. (The triad itself may still incidentally
    // contain both 0 and 1 if the random third slot is 0 or 1 — that's fine;
    // it's the deliberate anchor that's the relevant invariant.)
    t.sampleTriad(distFn);
    const s2 = t.getState();
    const lastAnchor = s2.recentPairs[s2.recentPairs.length - 1];
    if (lastAnchor === '0,1') {
      throw new Error('cooldown should prevent (0,1) from being trial 2 anchor; got ' + lastAnchor);
    }
  });

  // ----- Sampling: cross-tier -----

  test('sampleTriad crossTier: triad contains slots from both tiers', () => {
    const t = cal.makeTriadState(12, {
      tierLabels: [0,0,0,0,0,0,1,1,1,1,1,1],
      mix: { weighted: 0, crossTier: 1, asymptote: 0, easyControl: 0 },
      cooldown: 0,
    });
    const distFn = (i, j) => Math.abs(i - j) * 0.1;
    for (let trial = 0; trial < 30; trial++) {
      const r = t.sampleTriad(distFn);
      const tiers = new Set(r.triad.map(k => k < 6 ? 0 : 1));
      if (tiers.size < 2) {
        throw new Error('cross-tier triad should span both tiers: ' + r.triad);
      }
    }
  });

  test('sampleTriad crossTier: falls back to uniform when tierLabels absent', () => {
    const t = cal.makeTriadState(6, {
      mix: { weighted: 0, crossTier: 1, asymptote: 0, easyControl: 0 },
      cooldown: 0,
    });
    const distFn = (i, j) => Math.abs(i - j) * 0.1;
    // Should still produce valid triads (3 distinct indices) without crashing
    for (let trial = 0; trial < 10; trial++) {
      const r = t.sampleTriad(distFn);
      const uniq = new Set(r.triad);
      assertEq(uniq.size, 3);
    }
  });

  // ----- Sampling: asymptote (equidistant) -----

  test('sampleTriad asymptote: triad has roughly equal pairwise distances', () => {
    const t = cal.makeTriadState(12, {
      mix: { weighted: 0, crossTier: 0, asymptote: 1, easyControl: 0 },
      cooldown: 0,
      probeAttempts: 100,
    });
    // Construct a distFn where some triads are clearly equidistant and others
    // are skewed. asymptote sampler should consistently find the equidistant ones.
    const distFn = (i, j) => 0.3 + 0.5 * Math.abs(Math.sin(i + j));
    let totalCV = 0;
    for (let trial = 0; trial < 20; trial++) {
      const r = t.sampleTriad(distFn);
      const ds = [distFn(r.triad[0], r.triad[1]), distFn(r.triad[0], r.triad[2]), distFn(r.triad[1], r.triad[2])];
      const mean = (ds[0] + ds[1] + ds[2]) / 3;
      const v = ((ds[0] - mean)**2 + (ds[1] - mean)**2 + (ds[2] - mean)**2) / 3;
      totalCV += Math.sqrt(v) / mean;
    }
    const avgCV = totalCV / 20;
    // Equidistant triads have CV near 0; random triads ~0.3+. Should be < 0.2 on average.
    if (avgCV > 0.25) throw new Error('expected low CV for asymptote sampler, got ' + avgCV.toFixed(3));
  });

  // ----- Sampling: easy-control -----

  test('sampleTriad easyControl: triad has high minimum pairwise distance', () => {
    const t = cal.makeTriadState(12, {
      mix: { weighted: 0, crossTier: 0, asymptote: 0, easyControl: 1 },
      cooldown: 0,
      probeAttempts: 100,
    });
    // Slot k at position k/11 on a 1D axis; distFn = |k1 - k2| / 11
    const distFn = (i, j) => Math.abs(i - j) / 11;
    let totalMinD = 0;
    for (let trial = 0; trial < 20; trial++) {
      const r = t.sampleTriad(distFn);
      const ds = [distFn(r.triad[0], r.triad[1]), distFn(r.triad[0], r.triad[2]), distFn(r.triad[1], r.triad[2])];
      totalMinD += Math.min(ds[0], ds[1], ds[2]);
    }
    const avgMinD = totalMinD / 20;
    // Random uniform triads have min ≈ 0.18, easyControl with 100 attempts should hit min ≈ 0.27+
    if (avgMinD < 0.22) throw new Error('expected high min-pair-distance for easyControl, got ' + avgMinD.toFixed(3));
  });

  // ----- Mix dispatch -----

  test('sampleTriad: mix percentages dispatch trial types proportionally', () => {
    const t = cal.makeTriadState(12, {
      tierLabels: [0,0,0,0,0,0,1,1,1,1,1,1],
      mix: { weighted: 0.5, crossTier: 0.5, asymptote: 0, easyControl: 0 },
      cooldown: 0,
    });
    const distFn = (i, j) => Math.abs(i - j) * 0.1;
    const typeCounts = { weighted: 0, crossTier: 0, asymptote: 0, easyControl: 0, uniform: 0 };
    for (let trial = 0; trial < 200; trial++) {
      const r = t.sampleTriad(distFn);
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    }
    // 50/50 → both should be in [60, 140] for 200 trials (allowing variance)
    if (typeCounts.weighted < 60 || typeCounts.weighted > 140) {
      throw new Error('weighted count out of expected range: ' + JSON.stringify(typeCounts));
    }
    if (typeCounts.crossTier < 60 || typeCounts.crossTier > 140) {
      throw new Error('crossTier count out of expected range: ' + JSON.stringify(typeCounts));
    }
  });

  test('getState: includes mix config', () => {
    const t = cal.makeTriadState(6, {
      mix: { weighted: 0.7, crossTier: 0, asymptote: 0.2, easyControl: 0.1 },
    });
    const s = t.getState();
    assertClose(s.mix.weighted, 0.7);
    assertClose(s.mix.asymptote, 0.2);
    assertClose(s.mix.easyControl, 0.1);
  });
})();
