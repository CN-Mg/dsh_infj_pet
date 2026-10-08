/**
 * Region: plugin.
 *
 * One piece of the browser bundle. `tools/build-bundle.mjs` concatenates the
 * regions in order; `lib/client.js` is generated output and must never be
 * edited by hand. `tests/bundle.test.mjs` rebuilds it and fails on drift.
 */

export default "    exports.name = 'infjPetClient';\n    exports.inject = ['slots', 'sessions', 'connection', 'locale'];\n    exports.apply = function apply(ctx) {\n      var disposeStyles = injectStyles();\n      var disposeMount = null;\n      var Companion = createCompanion(ctx);\n\n      function PetRoot(props) {\n        return h(Companion, props);\n      }\n\n      try {\n        if (ctx && ctx.slots && typeof ctx.slots.inject === 'function') {\n          disposeMount = ctx.slots.inject('shell.overlay', function () {\n            return ctx.slots.register({ name: 'shell.overlay', id: 'infj-pet', order: 92 }, PetRoot);\n          });\n        } else {\n          disposeMount = mountDirect(ctx, Companion);\n        }\n      } catch (error) {\n        disposeMount = mountDirect(ctx, Companion);\n      }\n\n      return function () {\n        try {\n          if (typeof disposeMount === 'function') disposeMount();\n        } catch (error) {\n          /* ignore */\n        }\n        disposeStyles();\n      };\n    };\n\n    return exports;\n  }\n});\n";
