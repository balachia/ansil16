// lib/palette.js — Palette state model.
//
// Source of truth: per-slot (L, a, b) in the active backend's coordinates,
// stored on each dot. toHex() generates 18 sRGB slots by converting each
// slot's full (L, a, b) back to hex — so backend switches preserve hex
// exactly (modulo rounding), since we re-derive per-slot lab from the same
// underlying hex.
//
// State shape:
//   backend:   string (key into colorspace registry)
//   std:       { L: anchor, dots: [{L, a, b}, x6] }   ← c1..c6
//   brt:       { L: anchor, dots: [{L, a, b}, x6] }   ← c9..c14
//   grays:     { [slot]: {L, a, b} }                  ← bg, fg, c0, c7, c8, c15
//
// `row.L` is an *anchor* used for the canvas gamut backdrop and dragging.
// It defaults to the mean of dots' Ls on load. Dragging a single dot snaps
// that dot to the anchor L (you're editing in the displayed slice). Dragging
// the row L slider snaps ALL dots to the new L (full row harmonization).
// Switching backends does NOT touch the anchor — it only re-projects each
// slot's lab from the unchanged hex.

(function (root) {
  const STD_SLOTS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  const BRT_SLOTS = ['c9', 'c10', 'c11', 'c12', 'c13', 'c14'];
  const GRAY_SLOTS = ['bg', 'fg', 'c0', 'c8', 'c7', 'c15'];
  const ALL_SLOTS = ['bg', 'fg',
    'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7',
    'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15'];

  function mean(xs) { return xs.reduce((s, x) => s + x, 0) / xs.length; }

  function makePalette(backendKey) {
    const state = {
      backend: backendKey || 'oklab',
      std: { L: 0.55, dots: STD_SLOTS.map(() => ({ L: 0.55, a: 0, b: 0 })) },
      brt: { L: 0.78, dots: BRT_SLOTS.map(() => ({ L: 0.78, a: 0, b: 0 })) },
      grays: {},
    };
    for (const k of GRAY_SLOTS) state.grays[k] = { L: 0.5, a: 0, b: 0 };

    function getBackend() {
      return root.colorspace.get(state.backend);
    }

    // Load palette from a hex map. Each slot keeps its full (L, a, b) — no
    // snapping. Anchor L defaults to the mean of slot Ls in the active
    // backend, for the canvas gamut slice + drag operations.
    function loadHex(hexMap) {
      const b = getBackend();

      const stdLab = STD_SLOTS.map(k => b.hexToLab(hexMap[k] || '#888888'));
      const brtLab = BRT_SLOTS.map(k => b.hexToLab(hexMap[k] || '#CCCCCC'));

      state.std.dots = stdLab.map(([L, a, bb]) => ({ L: L, a: a, b: bb }));
      state.brt.dots = brtLab.map(([L, a, bb]) => ({ L: L, a: a, b: bb }));
      state.std.L = mean(stdLab.map(x => x[0]));
      state.brt.L = mean(brtLab.map(x => x[0]));

      for (const k of GRAY_SLOTS) {
        const [L, a, bb] = b.hexToLab(hexMap[k] || '#808080');
        state.grays[k] = { L: L, a: a, b: bb };
      }
    }

    // Generate 18 hex slots from current state. Each slot uses its own L.
    function toHex() {
      const b = getBackend();
      const out = {};
      STD_SLOTS.forEach((k, i) => {
        const d = state.std.dots[i];
        out[k] = b.labToHex(d.L, d.a, d.b);
      });
      BRT_SLOTS.forEach((k, i) => {
        const d = state.brt.dots[i];
        out[k] = b.labToHex(d.L, d.a, d.b);
      });
      for (const k of GRAY_SLOTS) {
        const g = state.grays[k];
        out[k] = b.labToHex(g.L, g.a, g.b);
      }
      return out;
    }

    // Switch backends. Snapshot current hex, change backend, re-derive each
    // slot's full (L, a, b) in the new space — hex values are preserved.
    function setBackend(newKey) {
      const snapshot = toHex();
      state.backend = newKey;
      loadHex(snapshot);
    }

    // Set a row's anchor L AND snap all dots in that row to it. This is the
    // explicit "harmonize the row" action — distinct from a single-dot drag.
    function setRowL(rowKey, newL) {
      const b = getBackend();
      const row = state[rowKey];
      row.L = newL;
      row.dots = row.dots.map(d => {
        const clipped = root.colorspace.clipToGamut(b, newL, d.a, d.b);
        return { L: newL, a: clipped.a, b: clipped.b };
      });
    }

    // Drag a single dot to a new (a, b). The dot snaps to the row's current
    // anchor L (you're editing the displayed gamut slice). Other dots
    // untouched. Result is clipped to gamut.
    function moveDot(rowKey, idx, a, bb) {
      const b = getBackend();
      const row = state[rowKey];
      const clipped = root.colorspace.clipToGamut(b, row.L, a, bb);
      row.dots[idx] = { L: row.L, a: clipped.a, b: clipped.b };
    }

    // Update one of the gray slots' L, optionally adjusting (a, b) to stay in gamut.
    function setGrayL(slot, newL) {
      const b = getBackend();
      const g = state.grays[slot];
      g.L = newL;
      const clipped = root.colorspace.clipToGamut(b, g.L, g.a, g.b);
      g.a = clipped.a; g.b = clipped.b;
    }

    function setGrayTint(slot, a, bb) {
      const b = getBackend();
      const g = state.grays[slot];
      const clipped = root.colorspace.clipToGamut(b, g.L, a, bb);
      g.a = clipped.a; g.b = clipped.b;
    }

    return {
      state: state,
      loadHex: loadHex,
      toHex: toHex,
      setBackend: setBackend,
      setRowL: setRowL,
      moveDot: moveDot,
      setGrayL: setGrayL,
      setGrayTint: setGrayTint,
    };
  }

  root.palette = {
    STD_SLOTS: STD_SLOTS,
    BRT_SLOTS: BRT_SLOTS,
    GRAY_SLOTS: GRAY_SLOTS,
    ALL_SLOTS: ALL_SLOTS,
    make: makePalette,
  };
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
