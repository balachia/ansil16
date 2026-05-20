// tests/palette.test.js
(function () {
  const LUV_RAINBOW_DARK = {
    bg: '#000000', fg: '#FFFFFF',
    c0: '#3B3B3B', c8: '#5E5E5E', c7: '#919191', c15: '#B9B9B9',
    c1: '#D5898C', c2: '#69AD6F', c3: '#B19D56', c4: '#7F9FD4', c5: '#C988C6', c6: '#07B0AE',
    c9: '#FFB0CA', c10: '#AFD18D', c11: '#EABF92', c12: '#8ECFF3', c13: '#DEB8F7', c14: '#6DD9C2',
  };

  test('palette.make: default backend is oklab', () => {
    const p = ansil16.palette.make();
    assertEq(p.state.backend, 'oklab');
  });

  test('palette.loadHex: anchor L is mean of slot Ls', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    const ok = ansil16.colorspace.get('oklab');
    const stdLs = ['c1','c2','c3','c4','c5','c6'].map(k => ok.hexToLab(LUV_RAINBOW_DARK[k])[0]);
    const expectedStdL = stdLs.reduce((s,x) => s+x, 0) / 6;
    assertClose(p.state.std.L, expectedStdL, 1e-9);
  });

  test('palette.loadHex: each dot retains its individual L', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    const ok = ansil16.colorspace.get('oklab');
    ['c1','c2','c3','c4','c5','c6'].forEach((k, i) => {
      const [L] = ok.hexToLab(LUV_RAINBOW_DARK[k]);
      assertClose(p.state.std.dots[i].L, L, 1e-9, `slot ${k}`);
    });
  });

  test('palette.toHex: produces all 18 slots', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    const hex = p.toHex();
    for (const k of ansil16.palette.ALL_SLOTS) {
      if (!hex[k]) throw new Error('missing slot ' + k);
      if (!/^#[0-9A-F]{6}$/.test(hex[k])) throw new Error('bad hex for ' + k + ': ' + hex[k]);
    }
  });

  test('palette: grays round-trip exactly (full L/a/b preserved)', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    const hex = p.toHex();
    for (const k of ansil16.palette.GRAY_SLOTS) {
      assertEq(hex[k], LUV_RAINBOW_DARK[k], `gray slot ${k}`);
    }
  });

  test('palette: chromatic slots round-trip exactly (no snapping on load)', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    const hex = p.toHex();
    for (const k of ['c1','c2','c3','c4','c5','c6','c9','c10','c11','c12','c13','c14']) {
      assertEq(hex[k], LUV_RAINBOW_DARK[k], `chromatic slot ${k}`);
    }
  });

  test('palette.setBackend: hex output preserved exactly across backend switch', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    const before = p.toHex();
    p.setBackend('cielab');
    const after = p.toHex();
    for (const k of ansil16.palette.ALL_SLOTS) {
      assertEq(after[k], before[k], `slot ${k} on switch oklab→cielab`);
    }
    p.setBackend('oklab');
    const back = p.toHex();
    for (const k of ansil16.palette.ALL_SLOTS) {
      assertEq(back[k], before[k], `slot ${k} on round-trip back to oklab`);
    }
  });

  test('palette.setRowL: shifts all dots by delta; preserves residuals', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    const beforeLs = p.state.std.dots.map(d => d.L);
    const oldAnchor = p.state.std.L;
    p.setRowL('std', 0.4);
    const delta = 0.4 - oldAnchor;
    // each dot should have shifted by exactly the delta
    for (let i = 0; i < 6; i++) {
      assertClose(p.state.std.dots[i].L, beforeLs[i] + delta, 1e-9, `dot ${i} shifted`);
    }
    assertClose(p.state.std.L, 0.4, 1e-9, 'anchor L');
  });

  test('palette.harmonizeRowL: snaps all dots to anchor L', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    // First nudge a dot so its L differs from anchor
    p.nudgeDotL('std', 0, 0.01);
    if (Math.abs(p.state.std.dots[0].L - p.state.std.L) < 1e-9) {
      throw new Error('expected nudge to create L deviation');
    }
    p.harmonizeRowL('std');
    for (let i = 0; i < 6; i++) {
      assertClose(p.state.std.dots[i].L, p.state.std.L, 1e-9, `dot ${i} L`);
    }
  });

  test('palette.moveDot: preserves dot L (no snap to anchor); other dots unchanged', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    const beforeLs = p.state.std.dots.map(d => d.L);
    p.moveDot('std', 1, 0.1, 0.1);
    // dot 1's L should be unchanged
    assertClose(p.state.std.dots[1].L, beforeLs[1], 1e-9, 'dragged dot L preserved');
    // other dots untouched
    [0,2,3,4,5].forEach(i => {
      assertClose(p.state.std.dots[i].L, beforeLs[i], 1e-9, `untouched dot ${i}`);
    });
  });

  test('palette.nudgeDotL: adjusts L; clamps to bounds when given', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    const startL = p.state.std.dots[0].L;
    // Small nudge within bounds
    p.nudgeDotL('std', 0, 0.01, { min: startL - 0.05, max: startL + 0.05 });
    assertClose(p.state.std.dots[0].L, startL + 0.01, 1e-9);
    // Nudge beyond max should clamp
    p.nudgeDotL('std', 0, 0.1, { min: startL - 0.05, max: startL + 0.05 });
    assertClose(p.state.std.dots[0].L, startL + 0.05, 1e-9, 'clamped to max');
    // No bounds — clamps only to [0, 1]
    p.nudgeDotL('std', 0, -2.0);
    assertClose(p.state.std.dots[0].L, 0, 1e-9, 'clamped to 0');
  });

  test('palette.moveDot: result is in gamut', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    // Try to drag a dot way out of gamut
    p.moveDot('std', 0, 0.6, 0.6);
    const ok = ansil16.colorspace.get('oklab');
    const d = p.state.std.dots[0];
    assertEq(ok.inGamut(p.state.std.L, d.a, d.b), true);
  });

  test('palette.setGrayTint: result in gamut', () => {
    const p = ansil16.palette.make('oklab');
    p.loadHex(LUV_RAINBOW_DARK);
    p.setGrayTint('bg', 0.5, 0.5);
    const ok = ansil16.colorspace.get('oklab');
    const g = p.state.grays.bg;
    assertEq(ok.inGamut(g.L, g.a, g.b), true);
  });
})();
