import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ComponentHarness, loadBundle, createFakeCtx, findAll, walk, textOf } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ *
 * Bundle and plugin shape
 * ------------------------------------------------------------------ */

test('the bundle registers one factory under the package id', () => {
  const bundle = loadBundle();
  assert.equal(bundle.registration.id, 'dsh-plugin-infj-pet');
  assert.equal(typeof bundle.registration.factory, 'function');
});

test('the plugin declares the services its slot needs', () => {
  const bundle = loadBundle();
  assert.equal(bundle.exports.name, 'infjPetClient');
  // The bundle runs in a VM context, so its arrays come from another realm and
  // are never reference-equal to a literal here; compare the contents instead.
  assert.equal(bundle.exports.inject.join(','), 'slots,sessions,connection,locale');
  assert.equal(typeof bundle.exports.apply, 'function');
});

test('the bundle asks only for modules the platform table provides', () => {
  const bundle = loadBundle();
  assert.equal(bundle.requested.join(','), 'react');
});

test('activating the plugin registers exactly one shell overlay occupant', () => {
  const bundle = loadBundle();
  const { ctx, recorded } = createFakeCtx({ locale: 'zh' });
  const dispose = bundle.exports.apply(ctx);
  assert.equal(recorded.slots.join(','), 'shell.overlay');
  assert.equal(recorded.registration.spec.id, 'infj-pet');
  assert.equal(recorded.registration.spec.name, 'shell.overlay');
  assert.equal(typeof recorded.registration.component, 'function');
  // A Cordis disposer returns nothing; it must simply run without throwing and
  // release both the slot contribution and the stylesheet.
  assert.equal(typeof dispose, 'function');
  dispose();
  assert.equal(recorded.slotDisposed, true);
  assert.equal(recorded.registrationDisposed, true);
});

/* ------------------------------------------------------------------ *
 * Test doubles
 * ------------------------------------------------------------------ */

/**
 * Activates the plugin and renders the companion until state settles.
 *
 * `render()` runs several passes on purpose: the state machine advances inside an
 * effect, so the tree produced by the first pass still carries the initial pose.
 * Real React re-renders after that effect; this harness has to be told to.
 *
 * @param {object} props props the slot renderer would bind
 * @param {{ locale?: string, navigatorLanguage?: string, reduceMotion?: boolean }} [options]
 */
function mount(props = {}, options = {}) {
  // One harness serves both roles on purpose: the bundle captures the harness's
  // React when its factory runs, so the same object has to render the companion.
  const primitive = () => null;
  const petHarness = new ComponentHarness(primitive, props);
  const bundle = loadBundle({
    harness: petHarness,
    navigatorLanguage: options.navigatorLanguage ?? 'zh-CN',
    reduceMotion: options.reduceMotion
  });
  const { ctx, recorded } = createFakeCtx({ locale: options.locale === undefined ? 'zh' : options.locale });
  bundle.exports.apply(ctx);
  petHarness.mountComponent(recorded.registration.component);
  return { tree: petHarness.render(props), petHarness, recorded, bundle, props };
}

/** Re-renders after the caller has changed a store double. */
function rerender(rendered) {
  rendered.tree = rendered.petHarness.render(rendered.props);
  return rendered.tree;
}

/**
 * A mutable session-store double the tests drive between renders.
 *
 * `rebuild()` produces *new* object and Map identities on every change, the way
 * a real store publication does. Mutating one identity in place would leave the
 * companion's memoised projection unchanged and no state transition would fire.
 */
function createStores() {
  const state = { running: [], pending: [], subagent: [], phase: 'ready', connected: true };
  let catalog = { phase: state.phase, byId: {} };
  let statuses = new Map();
  const connection = {
    state: {
      getSnapshot: () => (state.connected ? 'connected' : 'idle'),
      subscribe: () => () => {}
    }
  };

  function rebuild() {
    const byId = {};
    const next = new Map();
    for (const id of state.running) {
      byId[id] = { id, running: true };
      next.set(id, Object.assign(next.get(id) ?? {}, { running: true }));
    }
    for (const id of state.subagent) {
      byId[id] = { id, origin: 'subagent', running: true };
      next.set(id, Object.assign(next.get(id) ?? {}, { running: true }));
    }
    for (const id of state.pending) {
      byId[id] = byId[id] ?? { id };
      next.set(id, Object.assign(next.get(id) ?? {}, { pendingInteraction: { id: 'q' } }));
    }
    catalog = { phase: state.phase, byId };
    statuses = next;
  }
  rebuild();

  return {
    state,
    get catalog() {
      return catalog;
    },
    get statuses() {
      return statuses;
    },
    connection,
    set(patch) {
      Object.assign(state, patch);
      rebuild();
    },
    props() {
      return {
        useSessions: (select) => select(catalog),
        useSessionStatus: (select) => select(statuses),
        connection
      };
    }
  };
}

function rootElement(tree) {
  const found = findAll(tree, (node) => node.props && node.props['data-state'] !== undefined);
  assert.equal(found.length, 1, 'exactly one companion root should render');
  return found[0];
}

function stateOf(rendered) {
  return rootElement(rendered.tree).props['data-state'];
}

function bubbles(tree) {
  return findAll(
    tree,
    (node) => node.props && typeof node.props.className === 'string' && node.props.className.includes('infj-bubble')
  );
}

/** Opens the settings panel the same way a right-click would. */
function openPanel(rendered) {
  rootElement(rendered.tree).props.onContextMenu({ preventDefault() {}, stopPropagation() {} });
  rerender(rendered);
  return findAll(rendered.tree, (node) => node.props && node.props.className === 'infj-panel');
}

/* ------------------------------------------------------------------ *
 * State projection
 * ------------------------------------------------------------------ */

test('an idle, connected client renders the resting pose', () => {
  const stores = createStores();
  const rendered = mount(stores.props());
  assert.equal(stateOf(rendered), 'resting');
  assert.match(rootElement(rendered.tree).props['aria-label'], /INFJ 贤者/);
});

test('a running session renders the working pose and counts sessions', () => {
  const stores = createStores();
  stores.set({ running: ['a', 'b'] });
  const rendered = mount(stores.props());
  assert.equal(stateOf(rendered), 'working');
  const panel = openPanel(rendered)[0];
  assert.match(textOf(panel), /2 个会话/);
});

test('a pending interaction outranks running work and renders the waiting pose', () => {
  const stores = createStores();
  stores.set({ running: ['a'], pending: ['a'] });
  const rendered = mount(stores.props());
  assert.equal(stateOf(rendered), 'waiting');
});

test('a subagent-only run never claims a person-facing session is working', () => {
  const stores = createStores();
  stores.set({ subagent: ['child'] });
  const rendered = mount(stores.props());
  assert.notEqual(stateOf(rendered), 'working');
  assert.equal(stateOf(rendered), 'resting');
  const panel = openPanel(rendered)[0];
  assert.match(textOf(panel), /子任务/);
});

test('an unconnected client says so instead of pretending to be idle', () => {
  const stores = createStores();
  stores.set({ connected: false });
  const rendered = mount(stores.props());
  assert.equal(stateOf(rendered), 'resting');
  const panel = openPanel(rendered)[0];
  assert.match(textOf(panel), /还未连接/);
});

test('the companion still renders when the store hooks are absent', () => {
  const rendered = mount({});
  assert.equal(stateOf(rendered), 'resting');
  assert.ok(findAll(rendered.tree, (node) => node.type === 'svg').length >= 1);
});

test('finishing observed work celebrates, and an unseen start does not', () => {
  const stores = createStores();
  stores.set({ running: ['a'] });
  const rendered = mount(stores.props());
  assert.equal(stateOf(rendered), 'working');

  // Falling edge: the turn the companion watched is over.
  stores.set({ running: [] });
  rerender(rendered);
  assert.equal(stateOf(rendered), 'celebrating');

  // A client that loads into an already-idle host never claims a win.
  const fresh = mount(createStores().props());
  assert.equal(stateOf(fresh), 'resting');
});

/* ------------------------------------------------------------------ *
 * Interaction
 * ------------------------------------------------------------------ */

test('the companion introduces itself with one line on first sight', () => {
  const stores = createStores();
  const rendered = mount(stores.props());
  const shown = bubbles(rendered.tree);
  assert.equal(shown.length, 1, 'exactly one greeting bubble');
  const line = textOf(shown[0]);
  assert.ok(line.length > 0 && line.length < 40, `line looks wrong: ${line}`);
});

test('clicking the companion opens a new line of dialogue', () => {
  const stores = createStores();
  const props = stores.props();
  const rendered = mount(props);
  const root = rootElement(rendered.tree);

  root.props.onPointerDown({
    button: 0,
    pointerId: 1,
    clientX: 50,
    clientY: 50,
    currentTarget: { setPointerCapture() {} }
  });
  root.props.onPointerUp({
    pointerId: 1,
    clientX: 50,
    clientY: 50,
    currentTarget: { releasePointerCapture() {} }
  });

  const after = rerender(rendered);
  assert.equal(bubbles(after).length, 1);
  assert.ok(
    findAll(after, (node) => node.props && String(node.props.className).includes('infj-wrap')).length === 1,
    'the artwork should stay mounted through a poke'
  );
});

test('a drag moves the companion instead of opening a bubble', () => {
  const stores = createStores();
  const props = stores.props();
  const rendered = mount(props);
  const root = rootElement(rendered.tree);
  assert.equal(root.props.style.left, undefined, 'an un-dragged pet hangs on the default anchor');

  root.props.onPointerDown({
    button: 0,
    pointerId: 7,
    clientX: 100,
    clientY: 100,
    currentTarget: { setPointerCapture() {} }
  });
  root.props.onPointerMove({ pointerId: 7, clientX: 260, clientY: 220 });
  root.props.onPointerUp({ pointerId: 7, clientX: 260, clientY: 220, currentTarget: { releasePointerCapture() {} } });

  const moved = rootElement(rerender(rendered));
  assert.match(String(moved.props.style.left), /px$/);
  assert.match(String(moved.props.style.top), /px$/);
});

test('the settings panel exposes every option group and the trait list', () => {
  const stores = createStores();
  const props = stores.props();
  const rendered = mount(props);
  const panels = openPanel(rendered);
  assert.equal(panels.length, 1);
  const text = textOf(panels[0]);
  for (const fragment of ['姿势预览', '观察范围', '大小', '打盹等待', '配色', '动效', '性格特质', '躲起来', '回到角落']) {
    assert.ok(text.includes(fragment), `settings panel is missing "${fragment}"`);
  }

  const traitButton = findAll(
    panels[0],
    (node) => node.__el && node.type === 'button' && textOf(node).includes('INFJ')
  ).at(0);
  assert.ok(traitButton, 'the traits entry point should be a button');
  traitButton.props.onClick({ stopPropagation() {} });

  const traitView = rerender(rendered);
  const traitPanel = findAll(traitView, (node) => node.props && node.props.className === 'infj-panel')[0];
  const traitText = textOf(traitPanel);
  for (const badge of ['I', 'N', 'F', 'J']) {
    assert.ok(traitText.includes(badge), `trait list is missing the ${badge} facet`);
  }
});

test('hiding swaps the pet for a restore control that brings it back', () => {
  const stores = createStores();
  const props = stores.props();
  const rendered = mount(props);
  const panels = openPanel(rendered);
  const hideButton = findAll(
    panels[0],
    (node) => node.__el && node.type === 'button' && textOf(node).includes('躲起来')
  ).at(0);
  assert.ok(hideButton, 'the hide option should be a button');
  hideButton.props.onClick({ stopPropagation() {} });

  const hidden = rerender(rendered);
  assert.equal(
    findAll(hidden, (node) => node.props && node.props['data-state'] !== undefined).length,
    0,
    'the pet itself should be gone'
  );
  const restore = findAll(
    hidden,
    (node) => node.__el && node.type === 'button' && String(node.props.className).includes('infj-restore')
  ).at(0);
  assert.ok(restore, 'a restore control should be offered');
  restore.props.onClick({ stopPropagation() {} });

  rerender(rendered);
  assert.equal(stateOf(rendered), 'resting');
});

test('reduce-motion turns the animation attribute off', () => {
  const stores = createStores();
  const forced = mount(stores.props(), { reduceMotion: true });
  assert.equal(rootElement(forced.tree).props['data-motion'], 'off');
  const normal = mount(createStores().props(), { reduceMotion: false });
  assert.equal(rootElement(normal.tree).props['data-motion'], 'on');
});

test('the host locale wins, and the browser language is the fallback', () => {
  const english = mount(createStores().props(), { locale: 'en', navigatorLanguage: 'zh-CN' });
  assert.match(rootElement(english.tree).props['aria-label'], /INFJ Sage/);

  const chinese = mount(createStores().props(), { locale: 'zh-CN', navigatorLanguage: 'en-US' });
  assert.match(rootElement(chinese.tree).props['aria-label'], /INFJ 贤者/);

  // No host locale at all: the companion guesses from the browser.
  const guessed = mount(createStores().props(), { locale: null, navigatorLanguage: 'en-US' });
  assert.match(rootElement(guessed.tree).props['aria-label'], /INFJ Sage/);
  const guessedZh = mount(createStores().props(), { locale: null, navigatorLanguage: 'zh-CN' });
  assert.match(rootElement(guessedZh.tree).props['aria-label'], /INFJ 贤者/);
});

test('a host language change relabels a companion that never picked one', () => {
  const stores = createStores();
  const rendered = mount(stores.props(), { locale: 'en' });
  assert.match(rootElement(rendered.tree).props['aria-label'], /INFJ Sage/);
  assert.equal(typeof rendered.recorded.localeListener, 'function', 'the companion should subscribe to the locale service');

  rendered.recorded.localeActive = 'zh';
  rendered.recorded.localeListener({ active: 'zh' });
  rerender(rendered);
  assert.match(rootElement(rendered.tree).props['aria-label'], /INFJ 贤者/);
});

/* ------------------------------------------------------------------ *
 * Artwork integration
 * ------------------------------------------------------------------ */

test('the rendered character carries every animatable group', () => {
  const rendered = mount({});
  const ids = new Set();
  walk(rendered.tree, (node) => {
    if (node.__el && node.type === 'g' && node.props.id) ids.add(node.props.id);
  });
  for (const id of ['head', 'body', 'beard', 'arm-staff', 'staff', 'arm-left', 'brows', 'eyes', 'sparkles', 'zs']) {
    assert.ok(ids.has(id), `missing group #${id}`);
  }
});

test('the stylesheet reaches the document exactly once per activation', () => {
  const bundle = loadBundle();
  const first = createFakeCtx({ locale: 'zh' });
  const dispose = bundle.exports.apply(first.ctx);
  const styles = bundle.document.head.children.filter((node) => node.tagName === 'STYLE');
  assert.equal(styles.length, 1, 'one stylesheet should be injected');
  assert.ok(styles[0].textContent.includes('.infj-pet'), 'the stylesheet should carry the pet rules');
  assert.ok(styles[0].textContent.includes('@keyframes infj-blink'), 'animations should be present');
  dispose();
});

/* ------------------------------------------------------------------ *
 * Package contents
 * ------------------------------------------------------------------ */

test('the manifest declares the runtime deps the bundle shares', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const inject = manifest.dsh.client.inject;
  // `dsh.client.inject` is the load-order contract for shared modules; the
  // bundle's own `inject` is the Cordis service list. They are different things
  // and both must stay populated.
  assert.equal(manifest.dsh.client.platform, 'web');
  for (const required of ['@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-renderer']) {
    assert.ok(inject.includes(required), `dsh.client.inject should name ${required}`);
  }
});

test('the packaged assets referenced by the manifest exist', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const relative of Object.values(manifest.exports)) {
    assert.ok(existsSync(join(root, relative.replace(/^\.\//, ''))), `missing ${relative}`);
  }
  assert.ok(existsSync(join(root, manifest.icon.replace(/^\.\//, ''))), 'missing the declared icon');
});

test('every locale file exposes the plugin metadata DSH reads', () => {
  for (const code of ['en', 'zh']) {
    const data = JSON.parse(readFileSync(join(root, 'locale', `${code}.json`), 'utf8'));
    assert.ok(data.meta.title.length > 0, `${code} needs a title`);
    assert.ok(data.meta.description.length > 0, `${code} needs a description`);
  }
});
