// lib/conf.js — parse and format ansil16 .conf palette files.
//
// Format: `key = #RRGGBB`. `#` starts a comment until end of line.
// Blank lines and whitespace ignored. Keys are bg, fg, c0..c15, optional cursor.

(function (root) {
  const KEYS = ['bg', 'fg',
    'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7',
    'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15'];

  function parseConf(text) {
    const out = {};
    if (text == null) return out;
    const lines = String(text).split(/\r?\n/);
    for (const raw of lines) {
      // strip comments (everything after a `#` that isn't inside the hex value)
      // simplest: find first `#` that follows an `=` and isn't immediately followed by 6 hex chars
      let line = raw;
      const hashIdx = line.indexOf('#');
      const eqIdx = line.indexOf('=');
      // If `#` comes before `=`, it's a comment-only line.
      if (hashIdx >= 0 && (eqIdx < 0 || hashIdx < eqIdx)) {
        line = line.slice(0, hashIdx);
      } else if (hashIdx >= 0 && eqIdx >= 0 && hashIdx > eqIdx) {
        // `#` after `=` — could be a hex value or a trailing comment.
        // Heuristic: if `#` is followed by 3 or 6 hex digits, treat as value; else strip.
        const after = line.slice(hashIdx + 1);
        const m = after.match(/^[0-9a-fA-F]{6}\b/) || after.match(/^[0-9a-fA-F]{3}\b/);
        if (!m) line = line.slice(0, hashIdx);
        // else: leave alone — the hex value starts at hashIdx
      }

      const trimmed = line.trim();
      if (!trimmed) continue;
      const m = trimmed.match(/^(\w+)\s*=\s*(#?[0-9a-fA-F]{3,6})\s*(?:#.*)?$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      let val = m[2].toUpperCase();
      if (!val.startsWith('#')) val = '#' + val;
      // expand #RGB → #RRGGBB
      if (/^#[0-9A-F]{3}$/.test(val)) {
        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
      }
      if (!/^#[0-9A-F]{6}$/.test(val)) continue;
      out[key] = val;
    }
    return out;
  }

  function formatConf(palette, opts) {
    const name = (opts && opts.name) || 'palette';
    const note = (opts && opts.note) || 'Designed in designer/index.html.';
    const out = [];
    out.push('# ansil16 palette: ' + name);
    out.push('# ' + note);
    out.push('');
    if (palette.bg) out.push('bg = ' + palette.bg);
    if (palette.fg) out.push('fg = ' + palette.fg);
    out.push('');
    out.push('# grayscale ramp');
    for (const k of ['c0', 'c7', 'c8', 'c15']) {
      if (palette[k]) out.push(k.padEnd(3) + ' = ' + palette[k]);
    }
    out.push('');
    out.push('# standard row');
    for (const k of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) {
      if (palette[k]) out.push(k.padEnd(3) + ' = ' + palette[k]);
    }
    out.push('');
    out.push('# bright row');
    for (const k of ['c9', 'c10', 'c11', 'c12', 'c13', 'c14']) {
      if (palette[k]) out.push(k.padEnd(3) + ' = ' + palette[k]);
    }
    if (palette.cursor) {
      out.push('');
      out.push('cursor = ' + palette.cursor);
    }
    return out.join('\n') + '\n';
  }

  root.conf = { KEYS: KEYS, parseConf: parseConf, formatConf: formatConf };
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
