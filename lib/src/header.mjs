/**
 * Region: header.
 *
 * One piece of the browser bundle. `tools/build-bundle.mjs` concatenates the
 * regions in order; `lib/client.js` is generated output and must never be
 * edited by hand. `tests/bundle.test.mjs` rebuilds it and fails on drift.
 */

export default "// INFJ Sage — browser half. Self-contained bundle, no build step required.\n//\n// Registers one factory with the DSH client module loader. Every side effect\n// (styles, DOM) is created inside the factory closure, so nothing runs until the\n// plugin is first materialised. The companion reads the client session stores\n// through the props the slot renderer binds, and writes only to its own elements\n// and to one namespaced localStorage key.\n//\n// Contract notes (verified against the installed DSH client):\n//   * A bundle registers `{ id, factory }` with `window.__ModuleLoader__.load`.\n//   * `factory` returns a Cordis plugin: `{ name, inject, apply(ctx) }`.\n//   * Only React and ReactDOM are assumed to exist. The character is one\n//     committed sprite sheet drawn with background-position, so no optional UI\n//     package, icon set, or font can break the pet.\n//   * A slot component receives the injected business shares, which is where\n//     `useSessions` and `useSessionStatus` come from.\n//\n// The artwork is the Sage pet produced with the built-in image generator; see\n// Sage/README.md for provenance and tools/build-sage-index.mjs for the pipeline\n// that turns its sheet into the frame index embedded below.\nwindow.__ModuleLoader__.load({\n  id: 'dsh-plugin-infj-pet',\n  factory: function (require) {\n    'use strict';\n\n    var React = require('react');\n    var h = React.createElement;\n\n    var module = { exports: {} };\n    var exports = module.exports;\n\n\n";
