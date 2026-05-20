// tests/calibrate-loss.test.js
(function () {
  const cal = ansil16.calibrate;
  const P = ansil16.palette;

  const LUV_RAINBOW_LIGHT = {
    bg: '#FFFFFF', fg: '#000000',
    c0: '#B9B9B9', c8: '#919191', c7: '#5E5E5E', c15: '#3B3B3B',
    c1: '#D93668', c2: '#63810B', c3: '#B66027',
    c4: '#3279C5', c5: '#AF4FBE', c6: '#1D857B',
    c9: '#A50445', c10: '#445A09', c11: '#82400F',
    c12: '#035493', c13: '#852693', c14: '#085D56',
  };

  function freshPalette() {
    const pal = P.make('oklab');
    pal.loadHex(LUV_RAINBOW_LIGHT);
    return pal;
  }

  test('composeLoss: returns finite total on luv-rainbow-light seed', () => {
    const pal = freshPalette();
    const r = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    if (!isFinite(r.total)) throw new Error('total not finite: ' + r.total);
    for (const k of ['id', 'ord', 'group', 'disc', 'legib', 'bounds']) {
      if (!isFinite(r.components[k])) throw new Error('component ' + k + ' not finite');
    }
  });

  test('composeLoss: identity — seed-vs-self has zero hue drift and zero bounds', () => {
    const pal = freshPalette();
    const r = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    assertClose(r.components.id, 0, 1e-9, 'id');
    assertClose(r.components.bounds, 0, 1e-9, 'bounds');
  });

  // (legacy 6-component sum test removed — superseded by the 7-component
  // version below that includes the legibPair term.)

  test('composeLoss: hue drift increases when a slot is rotated', () => {
    const pal = freshPalette();
    const r0 = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    // Rotate c1 (std[0]) in (a, b) by 45° at same chroma
    const d = pal.state.std.dots[0];
    const rho = Math.hypot(d.a, d.b);
    const theta = Math.atan2(d.b, d.a) + Math.PI / 4;
    d.a = rho * Math.cos(theta);
    d.b = rho * Math.sin(theta);
    const r1 = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    if (!(r1.components.id > r0.components.id + 0.1)) {
      throw new Error('expected id to grow with rotation; before=' + r0.components.id + ', after=' + r1.components.id);
    }
  });

  test('composeLoss: legibility penalty grows when slot moves toward bg luminance', () => {
    const pal = freshPalette();
    const bgL = pal.state.grays.bg.L;
    const r0 = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    // Move all chromatic slots' L toward bgL
    for (const dot of pal.state.std.dots) dot.L = bgL - 0.02;
    for (const dot of pal.state.brt.dots) dot.L = bgL - 0.02;
    const r1 = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    if (!(r1.components.legib > r0.components.legib + 0.5)) {
      throw new Error('expected legib penalty to grow; before=' + r0.components.legib + ', after=' + r1.components.legib);
    }
  });

  test('composeLoss: group classifiability 0 (perfect) for well-separated rows', () => {
    const pal = freshPalette();
    const r = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    // luv-rainbow-light has std at L~0.6, brt at L~0.45 in OKLab — well-separated
    // group component = 1 - accuracy. perfect = 0.
    if (!(r.components.group < 0.5)) {
      throw new Error('expected near-zero group penalty for well-separated rows, got ' + r.components.group);
    }
  });

  test('composeLoss: discriminability (min ΔE) reported in meta', () => {
    const pal = freshPalette();
    const r = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    if (!(r.meta.minDist > 0)) throw new Error('expected positive minDist, got ' + r.meta.minDist);
    if (!Array.isArray(r.meta.minPair)) throw new Error('expected minPair array');
  });

  test('hueDelta: wraps to (-π, π]', () => {
    assertClose(cal._hueDelta(0, 0), 0);
    assertClose(cal._hueDelta(Math.PI / 4, 0), Math.PI / 4);
    assertClose(cal._hueDelta(-Math.PI / 4, 0), -Math.PI / 4);
    // Wrap-around: angles near opposite ends of (-π, π] should give a small
    // signed delta. (π - 0.1) - (-(π - 0.1)) = 2π - 0.2, wraps to -0.2 (going
    // the short way through the wrap-around).
    assertClose(cal._hueDelta(Math.PI - 0.1, -(Math.PI - 0.1)), -0.2, 1e-9);
    // Magnitude should always be ≤ π
    if (Math.abs(cal._hueDelta(3, -3)) > Math.PI + 1e-9) throw new Error('not wrapped');
  });

  test('loo1NN: perfectly-separable two-cluster data → 1.0', () => {
    const pts = [
      { L: 0, a: 0, b: 0, label: 0 }, { L: 0, a: 0.1, b: 0, label: 0 }, { L: 0, a: 0, b: 0.1, label: 0 },
      { L: 1, a: 0, b: 0, label: 1 }, { L: 1, a: 0.1, b: 0, label: 1 }, { L: 1, a: 0, b: 0.1, label: 1 },
    ];
    assertClose(cal._loo1NN(pts), 1.0);
  });

  test('composeLoss: legibPair component present and finite', () => {
    const pal = freshPalette();
    const r = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    if (!('legibPair' in r.components)) throw new Error('missing legibPair component');
    if (!isFinite(r.components.legibPair)) throw new Error('legibPair not finite');
    if (!('legibPair' in r.weights)) throw new Error('missing legibPair weight');
  });

  test('composeLoss: legibPair on luv-rainbow-light is nonzero (iso-L rows)', () => {
    // Standards row is all at L*≈50 (≈0.5 normalized in CIELAB); emphasis
    // row all at L*≈30. Within-row pairs are iso-luminant → penalty > 0.
    const pal = freshPalette();
    const r = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    if (!(r.components.legibPair > 0)) {
      throw new Error('expected legibPair > 0 on iso-L row design; got ' + r.components.legibPair);
    }
  });

  test('composeLoss: legibPair zero when all chromatic slots have distinct L', () => {
    const pal = freshPalette();
    // Spread all 12 chromatic slots with min ΔL > 0.08 (the legibPair floor).
    // Spacing 0.085, std at 0.05..0.475, brt at 0.56..0.985 — every pair
    // (within and across rows) has |ΔL| ≥ 0.085.
    for (let k = 0; k < 6; k++) pal.state.std.dots[k].L = 0.05 + k * 0.085;
    for (let k = 0; k < 6; k++) pal.state.brt.dots[k].L = 0.56 + k * 0.085;
    const r = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT, weights: { bounds: 0 } });
    assertClose(r.components.legibPair, 0, 1e-9);
  });

  test('composeLoss: legibPair grows as iso-L pair gets chromatically closer', () => {
    const pal = freshPalette();
    // Force iso-L on all chromatic slots
    for (let k = 0; k < 6; k++) pal.state.std.dots[k].L = 0.5;
    for (let k = 0; k < 6; k++) pal.state.brt.dots[k].L = 0.5;
    // Snapshot c1 and c4's a/b, then bring them closer chromatically
    const r0 = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT, weights: { bounds: 0 } });
    // Collapse all std slots to nearly the same (a, b)
    for (let k = 0; k < 6; k++) { pal.state.std.dots[k].a = 0.1; pal.state.std.dots[k].b = 0.1; }
    const r1 = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT, weights: { bounds: 0 } });
    if (!(r1.components.legibPair > r0.components.legibPair)) {
      throw new Error('expected legibPair to grow with chromatic collapse; before=' + r0.components.legibPair + ', after=' + r1.components.legibPair);
    }
  });

  test('composeLoss: weighted-sum still equals total with new legibPair term', () => {
    const pal = freshPalette();
    const r = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT });
    const w = r.weights, c = r.components;
    const recomputed = w.id*c.id + w.ord*c.ord + w.group*c.group + w.disc*c.disc +
      w.legib*c.legib + w.legibPair*c.legibPair + w.bounds*c.bounds;
    assertClose(r.total, recomputed, 1e-9);
  });

  test('loo1NN: interleaved labels → low accuracy', () => {
    const pts = [
      { L: 0.0, a: 0, b: 0, label: 0 },
      { L: 0.1, a: 0, b: 0, label: 1 },
      { L: 0.2, a: 0, b: 0, label: 0 },
      { L: 0.3, a: 0, b: 0, label: 1 },
    ];
    // Each point's NN is the opposite-labeled neighbor → accuracy 0
    if (cal._loo1NN(pts) > 0.5) throw new Error('expected low accuracy on interleaved labels');
  });
})();
