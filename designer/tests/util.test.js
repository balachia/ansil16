// tests/util.test.js
(function () {
  const u = ansil16.util;

  test('hexToRgb: pure white', () => {
    assertDeepClose(u.hexToRgb('#FFFFFF'), [1, 1, 1], 1e-9);
  });
  test('hexToRgb: pure black', () => {
    assertDeepClose(u.hexToRgb('#000000'), [0, 0, 0], 1e-9);
  });
  test('hexToRgb: lowercase hex accepted', () => {
    assertDeepClose(u.hexToRgb('#ff00aa'), [1, 0, 170/255], 1e-9);
  });
  test('hexToRgb: rejects bad input', () => {
    let threw = false;
    try { u.hexToRgb('#zzz'); } catch (_) { threw = true; }
    assertEq(threw, true, 'should throw on bad hex');
  });

  test('rgbToHex: round-trip', () => {
    assertEq(u.rgbToHex(...u.hexToRgb('#A1B2C3')), '#A1B2C3');
    assertEq(u.rgbToHex(...u.hexToRgb('#000000')), '#000000');
    assertEq(u.rgbToHex(...u.hexToRgb('#FFFFFF')), '#FFFFFF');
  });

  test('srgbToLinear / linearToSrgb: round-trip', () => {
    for (const c of [0, 0.04, 0.1, 0.5, 0.9, 1]) {
      assertClose(u.linearToSrgb(u.srgbToLinear(c)), c, 1e-9, `c=${c}`);
    }
  });

  test('srgbToLinear: pure black & white anchors', () => {
    assertClose(u.srgbToLinear(0), 0, 1e-12);
    assertClose(u.srgbToLinear(1), 1, 1e-9);
  });

  test('relativeLuminance: white & black anchors', () => {
    assertClose(u.relativeLuminance('#FFFFFF'), 1, 1e-6);
    assertClose(u.relativeLuminance('#000000'), 0, 1e-9);
  });
  test('relativeLuminance: green > red > blue', () => {
    const r = u.relativeLuminance('#FF0000');
    const g = u.relativeLuminance('#00FF00');
    const b = u.relativeLuminance('#0000FF');
    if (!(g > r && r > b)) throw new Error(`expected g>r>b, got ${g}, ${r}, ${b}`);
  });
})();
