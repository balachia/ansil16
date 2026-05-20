// tests/jzazbz.test.js
(function () {
  const jz = ansil16.colorspace.get('jzazbz');
  const cs = ansil16.colorspace;

  test('Jzazbz: pure black → Jz≈0, Az≈0, Bz≈0', () => {
    const [L, a, b] = jz.hexToLab('#000000');
    assertClose(L, 0, 1e-9, 'L');
    assertClose(a, 0, 1e-9, 'a');
    assertClose(b, 0, 1e-9, 'b');
  });

  test('Jzazbz: pure white → Jz≈1, Az≈0, Bz≈0', () => {
    const [L, a, b] = jz.hexToLab('#FFFFFF');
    assertClose(L, 1.0, 1e-2, 'L');
    assertClose(a, 0, 5e-3, 'a');
    assertClose(b, 0, 5e-3, 'b');
  });

  // The key structural property: at Jz=0 any (Az, Bz) collapses to pure black,
  // because pq_inv clamps sub-c1 arguments to zero — so L'M'S' all become 0,
  // hence LMS=0, hence linear RGB=0. This is what OKLab/CIELAB can't do.
  test('Jzazbz: Jz=0 with any (a, b) → #000000', () => {
    assertEq(jz.labToHex(0, 0, 0), '#000000', '(0, 0, 0)');
    assertEq(jz.labToHex(0, 0.1, 0.1), '#000000', '(0, 0.1, 0.1)');
    assertEq(jz.labToHex(0, -0.1, 0.1), '#000000', '(0, -0.1, 0.1)');
    assertEq(jz.labToHex(0, 0.15, -0.15), '#000000', '(0, 0.15, -0.15)');
  });

  test('Jzazbz: pure red has positive a (red axis) and positive b (yellow axis)', () => {
    const [, a, b] = jz.hexToLab('#FF0000');
    if (a <= 0) throw new Error(`expected a > 0 for red, got ${a}`);
    if (b <= 0) throw new Error(`expected b > 0 for red, got ${b}`);
  });

  test('Jzazbz: pure green has negative a and positive b', () => {
    const [, a, b] = jz.hexToLab('#00FF00');
    if (a >= 0) throw new Error(`expected a < 0 for green, got ${a}`);
    if (b <= 0) throw new Error(`expected b > 0 for green, got ${b}`);
  });

  test('Jzazbz: pure blue has negative b (blue axis)', () => {
    const [, , b] = jz.hexToLab('#0000FF');
    if (b >= 0) throw new Error(`expected b < 0 for blue, got ${b}`);
  });

  test('Jzazbz: hex round-trip preserves color', () => {
    for (const hex of ['#FF0000', '#00FF00', '#0000FF', '#A1B2C3', '#1A2B3C', '#808080']) {
      const [L, a, b] = jz.hexToLab(hex);
      const back = jz.labToHex(L, a, b);
      assertEq(back, hex, `round-trip ${hex}`);
    }
  });

  test('Jzazbz: inGamut true for sRGB primaries', () => {
    for (const hex of ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF']) {
      const lab = jz.hexToLab(hex);
      assertEq(jz.inGamut(lab[0], lab[1], lab[2]), true, hex);
    }
  });

  test('Jzazbz: inGamut false at L=0.5 with massive chroma', () => {
    assertEq(jz.inGamut(0.5, 1.0, 0), false);
    assertEq(jz.inGamut(0.5, 0, 1.0), false);
  });

  test('Jzazbz: clipToGamut returns in-gamut result', () => {
    const clipped = cs.clipToGamut(jz, 0.5, 0.4, 0.4);
    assertEq(jz.inGamut(0.5, clipped.a, clipped.b), true);
  });
})();
