// tests/calibrate-optimize.test.js
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

  test('optimize: terminates within maxIters', () => {
    const pal = freshPalette();
    const r = cal.optimize(pal, cal.composeLoss, {
      maxIters: 20,
      step: 0.02,
      minStep: 0.005,
      lossOpts: { seedHex: LUV_RAINBOW_LIGHT },
    });
    if (r.history.length === 0) throw new Error('no history');
    if (r.history.length > 21) throw new Error('exceeded maxIters: ' + r.history.length);
    if (!isFinite(r.finalLoss)) throw new Error('finalLoss not finite');
  });

  test('optimize: loss does not increase across history (monotone non-increasing)', () => {
    const pal = freshPalette();
    const r = cal.optimize(pal, cal.composeLoss, {
      maxIters: 30,
      step: 0.02,
      minStep: 0.005,
      lossOpts: { seedHex: LUV_RAINBOW_LIGHT },
    });
    for (let i = 1; i < r.history.length; i++) {
      if (r.history[i].loss > r.history[i - 1].loss + 1e-6) {
        throw new Error('loss increased at iter ' + i + ': ' + r.history[i - 1].loss + ' -> ' + r.history[i].loss);
      }
    }
  });

  test('optimize: reduces loss on a deliberately perturbed palette', () => {
    const pal = freshPalette();
    // Perturb: shrink the chromatic row's L spread so groups are less separable
    for (const d of pal.state.std.dots) d.L = 0.5;
    for (const d of pal.state.brt.dots) d.L = 0.5;
    const initial = cal.composeLoss(pal, { seedHex: LUV_RAINBOW_LIGHT }).total;
    const r = cal.optimize(pal, cal.composeLoss, {
      maxIters: 30,
      step: 0.02,
      minStep: 0.002,
      lossOpts: { seedHex: LUV_RAINBOW_LIGHT },
    });
    if (!(r.finalLoss < initial - 0.01)) {
      throw new Error('optimizer should reduce loss; initial=' + initial + ', final=' + r.finalLoss);
    }
  });

  test('optimize: returns valid hex palette', () => {
    const pal = freshPalette();
    const r = cal.optimize(pal, cal.composeLoss, {
      maxIters: 10,
      step: 0.02,
      lossOpts: { seedHex: LUV_RAINBOW_LIGHT },
    });
    for (const k of P.ALL_SLOTS) {
      if (!/^#[0-9A-F]{6}$/.test(r.paletteHex[k])) {
        throw new Error('bad hex for ' + k + ': ' + r.paletteHex[k]);
      }
    }
  });

  test('optimize: respects bounds (final palette stays within hue/L/chroma boxes)', () => {
    const pal = freshPalette();
    const seedHex = LUV_RAINBOW_LIGHT;
    const r = cal.optimize(pal, cal.composeLoss, {
      maxIters: 50,
      step: 0.02,
      minStep: 0.001,
      lossOpts: { seedHex: seedHex, hueBounds: Math.PI / 12, lBounds: 0.1, chromaBounds: 0.08 },
    });
    // Verify final palette has zero bounds penalty (didn't drift outside boxes)
    const finalCheck = cal.composeLoss(pal, { seedHex: seedHex });
    if (finalCheck.components.bounds > 0.01) {
      throw new Error('final palette drifted out of bounds: ' + finalCheck.components.bounds);
    }
  });
})();
