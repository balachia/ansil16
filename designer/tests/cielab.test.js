// tests/cielab.test.js — verify against canonical CIELAB D65 values.
// Reference values from standard sRGB primary conversions (Bruce Lindbloom).

(function () {
  const lab = ansil16.colorspace.get('cielab');
  const cs = ansil16.colorspace;

  test('CIELAB: pure white → L≈1, a≈0, b≈0', () => {
    const [L, a, b] = lab.hexToLab('#FFFFFF');
    assertClose(L, 1.0, 1e-3, 'L');
    assertClose(a, 0, 5e-2, 'a');
    assertClose(b, 0, 5e-2, 'b');
  });

  test('CIELAB: pure black → L=0, a=0, b=0', () => {
    const [L, a, b] = lab.hexToLab('#000000');
    assertClose(L, 0, 1e-9, 'L');
    assertClose(a, 0, 1e-9, 'a');
    assertClose(b, 0, 1e-9, 'b');
  });

  // sRGB primaries in CIELAB (D65); all normalized by 100:
  // red    #FF0000 → L≈0.5324, a≈ 0.8009, b≈ 0.6720
  // green  #00FF00 → L≈0.8774, a≈-0.8618, b≈ 0.8318
  // blue   #0000FF → L≈0.3230, a≈ 0.7919, b≈-1.0786

  test('CIELAB: pure red (#FF0000)', () => {
    const [L, a, b] = lab.hexToLab('#FF0000');
    assertClose(L, 0.5324, 5e-3, 'L');
    assertClose(a, 0.8009, 1e-3, 'a');
    assertClose(b, 0.6720, 1e-3, 'b');
  });

  test('CIELAB: pure green (#00FF00)', () => {
    const [L, a, b] = lab.hexToLab('#00FF00');
    assertClose(L, 0.8774, 5e-3, 'L');
    assertClose(a, -0.8618, 1e-3, 'a');
    assertClose(b, 0.8318, 1e-3, 'b');
  });

  test('CIELAB: pure blue (#0000FF)', () => {
    const [L, a, b] = lab.hexToLab('#0000FF');
    assertClose(L, 0.3230, 5e-3, 'L');
    assertClose(a, 0.7919, 1e-3, 'a');
    assertClose(b, -1.0786, 1e-3, 'b');
  });

  test('CIELAB: hex round-trip preserves color', () => {
    for (const hex of ['#FF0000', '#00FF00', '#0000FF', '#A1B2C3', '#1A2B3C', '#808080']) {
      const [L, a, b] = lab.hexToLab(hex);
      const back = lab.labToHex(L, a, b);
      assertEq(back, hex, `round-trip ${hex}`);
    }
  });

  test('CIELAB: inGamut true for sRGB primaries', () => {
    for (const hex of ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF']) {
      const v = lab.hexToLab(hex);
      assertEq(lab.inGamut(v[0], v[1], v[2]), true, hex);
    }
  });

  test('CIELAB: inGamut false at L=0.5 with massive chroma', () => {
    assertEq(lab.inGamut(0.5, 3.0, 0), false);
    assertEq(lab.inGamut(0.5, 0, 3.0), false);
  });

  test('CIELAB: clipToGamut returns in-gamut result', () => {
    const clipped = cs.clipToGamut(lab, 0.5, 2.0, 2.0);
    assertEq(lab.inGamut(0.5, clipped.a, clipped.b), true);
  });
})();
