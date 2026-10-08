/**
 * Region: preferences.
 *
 * One piece of the browser bundle. `tools/build-bundle.mjs` concatenates the
 * regions in order; `lib/client.js` is generated output and must never be
 * edited by hand. `tests/bundle.test.mjs` rebuilds it and fails on drift.
 */

export default "    function readPreferences(store) {\n      var saved = store.read();\n      var size = SIZES.some(function (option) {\n        return option.id === saved.size;\n      })\n        ? saved.size\n        : 'm';\n      var nap = NAP_CHOICES.some(function (choice) {\n        return choice.id === saved.napMs;\n      })\n        ? saved.napMs\n        : 180000;\n      return {\n        scope: saved.scope === 'current' ? 'current' : 'all',\n        size: size,\n        napMs: nap,\n        tips: saved.tips !== false,\n        glance: saved.glance !== false,\n        palette: saved.palette === 'light' || saved.palette === 'dark' ? saved.palette : 'auto',\n        motion: saved.motion === 'on' || saved.motion === 'off' ? saved.motion : 'auto',\n        hidden: saved.hidden === true,\n        theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : null,\n        x: typeof saved.x === 'number' && Number.isFinite(saved.x) ? saved.x : null,\n        y: typeof saved.y === 'number' && Number.isFinite(saved.y) ? saved.y : null,\n        language: normalizeLanguage(saved.language)\n      };\n    }\n\n";
