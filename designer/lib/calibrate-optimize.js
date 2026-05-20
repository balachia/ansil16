// lib/calibrate-optimize.js — bounded coordinate-descent optimizer.
//
// Iterates over all 12 chromatic slots × (L, a, b) parameters. At each
// parameter, tries ±step in that axis; keeps the move if loss decreased.
// When a full sweep produces no improvement, halves the step. Terminates
// when step drops below minStep or maxIters exceeded.
//
// Derivative-free, handles the discontinuous 1-NN classifier penalty in
// the loss without complaint. Per-slot independence makes coordinate
// descent appropriate (not the strongly-coupled global problem that
// would call for Powell or simulated annealing).
//
// Bounds are enforced softly via the loss's `bounds` term (with a large
// weight, default 100×). The optimizer doesn't see the seed palette
// directly; the loss function does.

(function (root) {
  function optimize(pal, lossFn, opts) {
    opts = opts || {};
    const step0 = opts.step == null ? 0.02 : opts.step;
    const minStep = opts.minStep == null ? 0.001 : opts.minStep;
    const maxIters = opts.maxIters == null ? 100 : opts.maxIters;
    const onProgress = opts.onProgress || function () {};
    const lossOpts = opts.lossOpts || {};

    const history = [];
    let step = step0;
    let result = lossFn(pal, lossOpts);
    let currLoss = result.total;
    history.push({ iter: 0, step: step, loss: currLoss, components: result.components });
    onProgress({ iter: 0, step: step, loss: currLoss, components: result.components });

    for (let iter = 1; iter <= maxIters; iter++) {
      let improved = false;

      function tryAxis(rowKey, k, axis) {
        for (const sign of [+1, -1]) {
          const before = pal.state[rowKey].dots[k][axis];
          pal.state[rowKey].dots[k][axis] = before + sign * step;
          const cand = lossFn(pal, lossOpts);
          if (cand.total < currLoss - 1e-9) {
            currLoss = cand.total;
            result = cand;
            improved = true;
            return;
          }
          pal.state[rowKey].dots[k][axis] = before;
        }
      }

      for (let k = 0; k < 6; k++) {
        for (const axis of ['L', 'a', 'b']) tryAxis('std', k, axis);
      }
      for (let k = 0; k < 6; k++) {
        for (const axis of ['L', 'a', 'b']) tryAxis('brt', k, axis);
      }

      history.push({ iter: iter, step: step, loss: currLoss, components: result.components });
      onProgress({ iter: iter, step: step, loss: currLoss, components: result.components });

      if (!improved) {
        step = step / 2;
        if (step < minStep) break;
      }
    }

    return {
      history: history,
      finalLoss: currLoss,
      finalComponents: result.components,
      paletteHex: pal.toHex(),
    };
  }

  root.calibrate = root.calibrate || {};
  root.calibrate.optimize = optimize;
})(typeof window !== 'undefined'
  ? (window.ansil16 = window.ansil16 || {})
  : (globalThis.ansil16 = globalThis.ansil16 || {}));
