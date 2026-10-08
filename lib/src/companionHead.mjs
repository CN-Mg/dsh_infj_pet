/**
 * Region: companionHead.
 *
 * One piece of the browser bundle. `tools/build-bundle.mjs` concatenates the
 * regions in order; `lib/client.js` is generated output and must never be
 * edited by hand. `tests/bundle.test.mjs` rebuilds it and fails on drift.
 */

export default "    function createCompanion(ctx) {\n      var store = createStore();\n      var initial = readPreferences(store);\n      var systemReducedMotion = prefersReducedMotion();\n";
