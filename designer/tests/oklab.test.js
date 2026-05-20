// tests/oklab.test.js — verify against Ottosson's reference values.
// Reference: https://bottosson.github.io/posts/oklab/#table-of-example-xyz-and-oklab-pairs
// Note: those values are XYZ→OKLab; we go sRGB→OKLab so values are computed
// with our pipeline. Anchors below are independently verified.

(function () {
  const ok = ansil16.colorspace.get('oklab');
  const cs = ansil16.colorspace;

  test('OKLab: pure white → L≈1, a≈0, b≈0', () => {
    const [L, a, b] = ok.hexToLab('#FFFFFF');
    assertClose(L, 1.0, 1e-3, 'L');
    assertClose(a, 0, 1e-3, 'a');
    assertClose(b, 0, 1e-3, 'b');
  });

  test('OKLab: pure black → L=0, a=0, b=0', () => {
    const [L, a, b] = ok.hexToLab('#000000');
    assertClose(L, 0, 1e-9, 'L');
    assertClose(a, 0, 1e-9, 'a');
    assertClose(b, 0, 1e-9, 'b');
  });

  // Ottosson's reference for sRGB primaries (linear-RGB pipeline):
  // red    (1,0,0): L≈0.6279, a≈ 0.2249, b≈ 0.1258
  // green  (0,1,0): L≈0.8664, a≈-0.2339, b≈ 0.1795
  // blue   (0,0,1): L≈0.4520, a≈-0.0324, b≈-0.3115

  test('OKLab: pure red (#FF0000)', () => {
    const [L, a, b] = ok.hexToLab('#FF0000');
    assertClose(L, 0.6279, 5e-3, 'L');
    assertClose(a, 0.2249, 5e-3, 'a');
    assertClose(b, 0.1258, 5e-3, 'b');
  });

  test('OKLab: pure green (#00FF00)', () => {
    const [L, a, b] = ok.hexToLab('#00FF00');
    assertClose(L, 0.8664, 5e-3, 'L');
    assertClose(a, -0.2339, 5e-3, 'a');
    assertClose(b, 0.1795, 5e-3, 'b');
  });

  test('OKLab: pure blue (#0000FF)', () => {
    const [L, a, b] = ok.hexToLab('#0000FF');
    assertClose(L, 0.4520, 5e-3, 'L');
    assertClose(a, -0.0324, 5e-3, 'a');
    assertClose(b, -0.3115, 5e-3, 'b');
  });

  test('OKLab: hex round-trip preserves color', () => {
    for (const hex of ['#FF0000', '#00FF00', '#0000FF', '#A1B2C3', '#1A2B3C']) {
      const [L, a, b] = ok.hexToLab(hex);
      const back = ok.labToHex(L, a, b);
      assertEq(back, hex, `round-trip ${hex}`);
    }
  });

  test('OKLab: inGamut true for sRGB primaries', () => {
    for (const hex of ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF']) {
      const lab = ok.hexToLab(hex);
      assertEq(ok.inGamut(lab[0], lab[1], lab[2]), true, hex);
    }
  });

  test('OKLab: inGamut false for clearly out-of-gamut (high chroma at L=0.5)', () => {
    // 1.0 chroma at any L is way outside sRGB
    assertEq(ok.inGamut(0.5, 1.0, 0), false);
    assertEq(ok.inGamut(0.5, 0, 1.0), false);
  });

  test('OKLab: clipToGamut returns in-gamut result', () => {
    const clipped = cs.clipToGamut(ok, 0.5, 0.6, 0.6);
    assertEq(ok.inGamut(0.5, clipped.a, clipped.b), true);
    // Should preserve direction (hue-ish)
    assertClose(clipped.b / clipped.a, 1.0, 1e-6, 'preserves hue ray');
  });
})();
