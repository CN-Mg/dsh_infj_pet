import { ComponentHarness, loadBundle, createFakeCtx, findAll } from './harness.mjs';

function root(tree) {
  return findAll(tree, (n) => n.__el && n.props && n.props.className === 'infj-pet')[0];
}

const harness = new ComponentHarness(() => null);
const bundle = loadBundle({ harness });
const { ctx, recorded } = createFakeCtx({ locale: 'zh' });
bundle.exports.apply(ctx);
harness.mountComponent(recorded.registration.component);

const props = {
  useSessions: (s) => s({ phase: 'ready', byId: {} }),
  useSessionStatus: (s) => s(new Map()),
  connection: { state: { getSnapshot: () => 'connected', subscribe: () => () => {} } }
};

let tree = harness.render(props);
console.log('start        ->', root(tree).props['data-sprite'], '| left:', root(tree).props.style.left);

root(tree).props.onPointerDown({
  button: 0,
  pointerId: 3,
  clientX: 600,
  clientY: 300,
  currentTarget: { setPointerCapture() {} }
});

root(tree).props.onPointerMove({ pointerId: 3, clientX: 900, clientY: 300 });
tree = harness.render(props);
console.log('to 900       ->', root(tree).props['data-sprite'], '| left:', root(tree).props.style.left, '| state:', root(tree).props['data-state']);

root(tree).props.onPointerMove({ pointerId: 3, clientX: 300, clientY: 300 });
tree = harness.render(props);
console.log('to 300       ->', root(tree).props['data-sprite'], '| left:', root(tree).props.style.left, '| state:', root(tree).props['data-state']);

// And a case that must NOT be at a wall: move left but stay mid-screen.
root(tree).props.onPointerMove({ pointerId: 3, clientX: 350, clientY: 300 });
tree = harness.render(props);
console.log('to 350       ->', root(tree).props['data-sprite'], '| left:', root(tree).props.style.left);
