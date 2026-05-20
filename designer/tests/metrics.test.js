// tests/metrics.test.js
(function () {
  const m = ansil16.metrics;

  test('dE: identical colors → 0', () => {
    assertClose(m.dE('#FF0000', '#FF0000'), 0);
  });

  test('dE: backendKey selects color space', () => {
    const dOk = m.dE('#FF0000', '#00FF00', 'oklab');
    const dLab = m.dE('#FF0000', '#00FF00', 'cielab');
    // Both backends are now normalized to a similar scale (~0..1.5). For these
    // saturated primaries the OKLab distance is ~0.5; CIELAB ~1.7. Just confirm
    // they're both finite, nonzero, and differ by a meaningful amount.
    if (!(dOk > 0.1 && dLab > 0.1)) throw new Error(`expected both finite positive; oklab=${dOk}, cielab=${dLab}`);
    if (Math.abs(dOk - dLab) < 0.1) throw new Error(`expected backends to differ; oklab=${dOk}, cielab=${dLab}`);
  });

  test('summary: backendKey is reflected in result', () => {
    const palette = {
      bg: '#000000', fg: '#FFFFFF',
      c0: '#3B3B3B', c8: '#5E5E5E', c7: '#919191', c15: '#B9B9B9',
      c1: '#D5898C', c2: '#69AD6F', c3: '#B19D56', c4: '#7F9FD4', c5: '#C988C6', c6: '#07B0AE',
      c9: '#FFB0CA', c10: '#AFD18D', c11: '#EABF92', c12: '#8ECFF3', c13: '#DEB8F7', c14: '#6DD9C2',
    };
    const sOk = m.summary(palette, 'oklab');
    const sLab = m.summary(palette, 'cielab');
    assertEq(sOk.backend, 'oklab');
    assertEq(sLab.backend, 'cielab');
    // distances should differ between backends; both finite positive
    if (!(sOk.stdMin.min > 0 && sLab.stdMin.min > 0)) throw new Error('expected positive min');
    if (Math.abs(sOk.stdMin.min - sLab.stdMin.min) < 0.01) {
      throw new Error(`expected std min to differ across backends; ok=${sOk.stdMin.min}, lab=${sLab.stdMin.min}`);
    }
  });

  test('dE: symmetric', () => {
    const a = m.dE('#A1B2C3', '#1A2B3C');
    const b = m.dE('#1A2B3C', '#A1B2C3');
    assertClose(a, b, 1e-12);
  });

  test('dE: white→black is the largest L jump', () => {
    const big = m.dE('#FFFFFF', '#000000');
    const small = m.dE('#FFFFFF', '#EEEEEE');
    if (!(big > small)) throw new Error('expected white-black > white-near-white');
  });

  test('minPairwise: detects the closest pair', () => {
    const r = m.minPairwise(['#FF0000', '#00FF00', '#FE0000']); // 0 and 2 nearly identical
    assertEq(r.pair[0], 0);
    assertEq(r.pair[1], 2);
    if (!(r.min < 0.01)) throw new Error('expected very small min, got ' + r.min);
  });

  test('minCross: pairs nearest cross-group', () => {
    const a = ['#FF0000', '#00FF00'];
    const b = ['#0000FF', '#FE0000']; // b[1] near a[0]
    const r = m.minCross(a, b);
    assertEq(r.pair[0], 0);
    assertEq(r.pair[1], 1);
  });

  test('minOneVsMany: finds nearest neighbor', () => {
    const r = m.minOneVsMany('#FFFFFF', ['#000000', '#888888', '#F0F0F0']);
    assertEq(r.idx, 2);
  });

  test('summary: returns all 6 metrics for a full palette', () => {
    const palette = {
      bg: '#000000', fg: '#FFFFFF',
      c0: '#3B3B3B', c8: '#5E5E5E', c7: '#919191', c15: '#B9B9B9',
      c1: '#D5898C', c2: '#69AD6F', c3: '#B19D56', c4: '#7F9FD4', c5: '#C988C6', c6: '#07B0AE',
      c9: '#FFB0CA', c10: '#AFD18D', c11: '#EABF92', c12: '#8ECFF3', c13: '#DEB8F7', c14: '#6DD9C2',
    };
    const s = m.summary(palette);
    for (const k of ['stdMin', 'brtMin', 'crossMin', 'grayMin', 'fgMin', 'bgMin']) {
      if (!(k in s)) throw new Error('missing metric ' + k);
      if (!isFinite(s[k].min)) throw new Error('non-finite ' + k);
    }
  });

  test('summary: fg/bg measured vs chromatic slots only (not grays)', () => {
    // bg = #000000. If we wrongly checked all 16 slots, c0=#010101 would be
    // the nearest (~0). With chromatic-only, the nearest must be some c1-c14.
    const palette = {
      bg: '#000000', fg: '#FFFFFF',
      c0: '#010101', c8: '#444444', c7: '#888888', c15: '#CCCCCC',
      c1: '#D5898C', c2: '#69AD6F', c3: '#B19D56', c4: '#7F9FD4', c5: '#C988C6', c6: '#07B0AE',
      c9: '#FFB0CA', c10: '#AFD18D', c11: '#EABF92', c12: '#8ECFF3', c13: '#DEB8F7', c14: '#6DD9C2',
    };
    const s = m.summary(palette);
    // The distance should be the bg vs darkest chromatic (luv-rainbow has saturated
    // mid-L colors, so all c1-c14 are notably distant from pure black).
    if (s.bgMin.min < 0.3) throw new Error('expected larger distance, got ' + s.bgMin.min);
  });

  test('summary: grayMin captures grayscale ramp internal distances', () => {
    const palette = {
      bg: '#000000', fg: '#FFFFFF',
      // Two grays almost identical → grayMin should be tiny
      c0: '#020202', c8: '#030303', c7: '#919191', c15: '#B9B9B9',
      c1: '#D5898C', c2: '#69AD6F', c3: '#B19D56', c4: '#7F9FD4', c5: '#C988C6', c6: '#07B0AE',
      c9: '#FFB0CA', c10: '#AFD18D', c11: '#EABF92', c12: '#8ECFF3', c13: '#DEB8F7', c14: '#6DD9C2',
    };
    const s = m.summary(palette);
    if (s.grayMin.min > 0.05) throw new Error('expected tiny gray min, got ' + s.grayMin.min);
  });
})();
