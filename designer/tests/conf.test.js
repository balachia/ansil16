// tests/conf.test.js
(function () {
  const { parseConf, formatConf } = ansil16.conf;

  test('parseConf: minimal palette', () => {
    const p = parseConf('bg = #000000\nfg = #FFFFFF\nc0 = #123456\n');
    assertEq(p.bg, '#000000');
    assertEq(p.fg, '#FFFFFF');
    assertEq(p.c0, '#123456');
  });

  test('parseConf: full 18-slot palette', () => {
    const text = `
      bg = #000000
      fg = #FFFFFF
      c0 = #111111
      c1 = #220000
      c2 = #002200
      c3 = #222200
      c4 = #000022
      c5 = #220022
      c6 = #002222
      c7 = #888888
      c8 = #444444
      c9 = #ff0000
      c10 = #00ff00
      c11 = #ffff00
      c12 = #0000ff
      c13 = #ff00ff
      c14 = #00ffff
      c15 = #cccccc
    `;
    const p = parseConf(text);
    assertEq(p.bg, '#000000');
    assertEq(p.c15, '#CCCCCC');
    assertEq(p.c9, '#FF0000');
    assertEq(Object.keys(p).length, 18);
  });

  test('parseConf: # comment lines ignored', () => {
    const p = parseConf('# header comment\nbg = #ABCDEF\n# trailing comment\n');
    assertEq(p.bg, '#ABCDEF');
    assertEq(Object.keys(p).length, 1);
  });

  test('parseConf: trailing comments on value lines', () => {
    const p = parseConf('bg = #ABCDEF  # this is bg\n');
    assertEq(p.bg, '#ABCDEF');
  });

  test('parseConf: case-insensitive keys; uppercased hex', () => {
    const p = parseConf('BG = #abcdef\nFG = #112233\n');
    assertEq(p.bg, '#ABCDEF');
    assertEq(p.fg, '#112233');
  });

  test('parseConf: #RGB shorthand expanded', () => {
    const p = parseConf('bg = #abc\n');
    assertEq(p.bg, '#AABBCC');
  });

  test('parseConf: blank input → empty palette', () => {
    assertEq(Object.keys(parseConf('')).length, 0);
    assertEq(Object.keys(parseConf('   \n\n  ')).length, 0);
    assertEq(Object.keys(parseConf(null)).length, 0);
  });

  test('formatConf: contains all slots and labels them', () => {
    const text = formatConf({
      bg: '#000000', fg: '#FFFFFF',
      c0: '#0A0A0A', c1: '#111111', c2: '#222222', c3: '#333333',
      c4: '#444444', c5: '#555555', c6: '#666666', c7: '#777777',
      c8: '#888888', c9: '#999999', c10: '#AAAAAA', c11: '#BBBBBB',
      c12: '#CCCCCC', c13: '#DDDDDD', c14: '#EEEEEE', c15: '#FFFFFF',
    }, { name: 'test-palette' });
    if (!text.includes('# ansil16 palette: test-palette')) throw new Error('missing name header');
    if (!text.includes('bg = #000000')) throw new Error('missing bg');
    if (!text.includes('c15 = #FFFFFF')) throw new Error('missing c15');
    if (!text.includes('# standard row')) throw new Error('missing section header');
  });

  test('round-trip: format → parse preserves all keys', () => {
    const orig = {
      bg: '#000000', fg: '#FFFFFF',
      c0: '#0A0A0A', c1: '#D5898C', c2: '#69AD6F', c3: '#B19D56',
      c4: '#7F9FD4', c5: '#C988C6', c6: '#07B0AE', c7: '#919191',
      c8: '#5E5E5E', c9: '#FFB0CA', c10: '#AFD18D', c11: '#EABF92',
      c12: '#8ECFF3', c13: '#DEB8F7', c14: '#6DD9C2', c15: '#B9B9B9',
    };
    const parsed = parseConf(formatConf(orig, { name: 'rt' }));
    for (const k of Object.keys(orig)) {
      assertEq(parsed[k], orig[k], `key ${k}`);
    }
  });

  test('formatConf: cursor included if provided', () => {
    const text = formatConf({ bg: '#000000', cursor: '#FF00FF' }, { name: 'c' });
    if (!text.includes('cursor = #FF00FF')) throw new Error('missing cursor');
  });
})();
