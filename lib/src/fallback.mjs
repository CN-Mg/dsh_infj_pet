/**
 * Region: fallback.
 *
 * One piece of the browser bundle. `tools/build-bundle.mjs` concatenates the
 * regions in order; `lib/client.js` is generated output and must never be
 * edited by hand. `tests/bundle.test.mjs` rebuilds it and fails on drift.
 */

export default "    /* ------------------------------------------------------------------ *\n     * Fallback mount, used only when the slot registry is unavailable\n     * ------------------------------------------------------------------ */\n\n    function mountDirect(ctx, Companion) {\n      var container = document.createElement('div');\n      container.setAttribute('data-infj-pet', 'direct');\n      document.body.appendChild(container);\n      var root = null;\n      try {\n        var client = require('react-dom/client');\n        root = client.createRoot(container);\n        root.render(h(Companion, {}));\n      } catch (error) {\n        // Last resort: a plain node so the companion still has a presence\n        // rather than failing the whole plugin silently.\n        container.textContent = 'INFJ';\n        return function () {\n          container.remove();\n        };\n      }\n      return function () {\n        try {\n          root.unmount();\n        } catch (error) {\n          /* ignore */\n        }\n        container.remove();\n      };\n    }\n\n";
