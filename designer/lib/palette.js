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

    // Set a row's anchor L. SHIFTS each dot's L by the same delta so any
    // per-slot residuals (dot.L - old anchor) are preserved. Dragging the
    // row L slider feels like "move everything brighter/darker together".
    // For "harmonize all to anchor" use harmonizeRowL instead.
    function setRowL(rowKey, newL) {
      const row = state[rowKey];
      const delta = newL - row.L;
      row.L = newL;
      row.dots = row.dots.map(d => ({
        L: Math.max(0, Math.min(1, d.L + delta)),
        a: d.a,
        b: d.b,
      }));
    }

    // Explicit "snap all dots in row to anchor L" action. Resets residuals.
    function harmonizeRowL(rowKey) {
      const b = getBackend();
      const row = state[rowKey];
      row.dots = row.dots.map(d => {
        const clipped = root.colorspace.clipToGamut(b, row.L, d.a, d.b);
        return { L: row.L, a: clipped.a, b: clipped.b };
      });
    }

    // Drag a single dot. PRESERVES the dot's current L (any residual stays);
    // only (a, b) move. Gamut clip is at the dot's own L, not the anchor.
    function moveDot(rowKey, idx, a, bb) {
      const b = getBackend();
      const dot = state[rowKey].dots[idx];
      const clipped = root.colorspace.clipToGamut(b, dot.L, a, bb);
      dot.a = clipped.a;
      dot.b = clipped.b;
    }

    // Adjust a single dot's L by `delta`. Optional `bounds` clamps the new L
    // to [bounds.min, bounds.max] (e.g. anchor ± 0.05 for residual cap).
    // (a, b) preserved — not re-clipped to new L's gamut (renderer handles
    // out-of-gamut by clamping the sRGB output).
    function nudgeDotL(rowKey, idx, delta, bounds) {
      const dot = state[rowKey].dots[idx];
      let newL = dot.L + delta;
      if (bounds) {
        newL = Math.max(bounds.min, Math.min(bounds.max, newL));
      }
      newL = Math.max(0, Math.min(1, newL));
      dot.L = newL;
    }

    // Update one of the gray slots' L. We deliberately do NOT re-clip (a, b)
    // to the new L's gamut — that would silently rotate the user's tint when
    // scrolling L (visible as "L and tint move together"). If the tint is
    // out-of-gamut at the new L, labToHex clamps the rendered hex while the
    // stored (a, b) intent is preserved across further L changes. To deliberately
    // tint within the new gamut, use setGrayTint or drag the dot on the canvas.
    function setGrayL(slot, newL) {
      state.grays[slot].L = newL;
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
      harmonizeRowL: harmonizeRowL,
      moveDot: moveDot,
      nudgeDotL: nudgeDotL,
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
