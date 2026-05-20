// tests/runner.js — tiny test runner shared between node and browser.
// Defines globals: test, assertEq, assertClose, assertDeepClose.
// Collects results into RESULTS for renderResults() (browser).

(function (root) {
  const RESULTS = [];

  root.test = function (name, fn) {
    try { fn(); RESULTS.push({ name: name, ok: true }); }
    catch (e) { RESULTS.push({ name: name, ok: false, err: e && e.message ? e.message : String(e) }); }
  };

  root.assertEq = function (actual, expected, msg) {
    if (actual !== expected) {
      throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
  };

  root.assertClose = function (actual, expected, tol, msg) {
    if (tol === undefined) tol = 1e-6;
    if (typeof actual !== 'number' || !isFinite(actual)) {
      throw new Error((msg ? msg + ': ' : '') + 'expected finite number, got ' + actual);
    }
    if (Math.abs(actual - expected) > tol) {
      throw new Error((msg ? msg + ': ' : '') + 'expected ' + expected + ' ±' + tol + ', got ' + actual);
    }
  };

  root.assertDeepClose = function (actual, expected, tol, msg) {
    if (tol === undefined) tol = 1e-6;
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
      throw new Error((msg ? msg + ': ' : '') + 'length mismatch or non-array');
    }
    for (let i = 0; i < actual.length; i++) {
      if (Math.abs(actual[i] - expected[i]) > tol) {
        throw new Error((msg ? msg + ': ' : '') + '[' + i + '] expected ' + expected[i] + ' ±' + tol + ', got ' + actual[i]);
      }
    }
  };

  root.RESULTS = RESULTS;

  // Browser-only DOM renderer; node entry has its own printer.
  root.renderResults = function () {
    if (typeof document === 'undefined') return;
    const out = document.getElementById('results');
    if (!out) return;
    const total = RESULTS.length;
    const passed = RESULTS.filter(r => r.ok).length;
    const lines = [];
    lines.push('<h2>' + passed + '/' + total + ' passed</h2>');
    for (const r of RESULTS) {
      if (r.ok) lines.push('<div class="ok">✓ ' + r.name + '</div>');
      else lines.push('<div class="fail">✗ ' + r.name + ': <span class="err">' + r.err + '</span></div>');
    }
    out.innerHTML = lines.join('');
  };
})(typeof window !== 'undefined' ? window : globalThis);
