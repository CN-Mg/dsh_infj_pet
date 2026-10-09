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
    now: options.now,
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
 * Mounts with a pre-seeded preferences record.
 *
 * The plugin reads its saved position from `localStorage` at construction time, so
 * the store has to be populated before the bundle factory runs.
 * @param {object} saved the record to seed
 */
function mountWithSaved(saved) {
  const primitive = () => null;
  const stores = createStores();
  const props = stores.props();
  const petHarness = new ComponentHarness(primitive, props);
  const bundle = loadBundle({ harness: petHarness });
  bundle.sandbox.localStorage.setItem('dsh-plugin-infj-pet:v1', JSON.stringify(saved));
  const { ctx, recorded } = createFakeCtx({ locale: 'zh' });
  bundle.exports.apply(ctx);
  petHarness.mountComponent(recorded.registration.component);
  return { tree: petHarness.render(props), petHarness, bundle, props };
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

/** The rendered sprite element, which is how the character is drawn now. */
function spriteOf(tree) {
  return findAll(tree, (node) => node.props && String(node.props.className) === 'infj-sprite').at(0);
}

/**
 * The speech bubbles, matched exactly.
 *
 * A substring match would also catch the bubble's own inner spans, which is how
 * a "one bubble" assertion can suddenly see two elements.
 */
function bubbles(tree) {
  return findAll(
    tree,
    (node) => node.props && /^infj-bubble(\s|$)/.test(String(node.props.className ?? ''))
  );
}

/**
 * The spoken text of a bubble, without its attribution.
 *
 * A quoted line carries a source line beneath it; that is a citation, not
 * something the sage said, so tests about dialogue read only the text span.
 */
function bubbleText(bubble) {
  const text = findAll(
    bubble,
    (node) => node.props && String(node.props.className ?? '').includes('infj-bubble-text')
  ).at(0);
  return textOf(text ?? bubble);
}

/** The attribution line of a bubble, if it has one. */
function bubbleSource(bubble) {
  const source = findAll(
    bubble,
    (node) => node.props && String(node.props.className ?? '').includes('infj-bubble-source')
  ).at(0);
  return source ? textOf(source) : null;
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
  const sprite = spriteOf(rendered.tree);
  assert.ok(sprite, 'the sprite element should render');
  assert.match(String(sprite.props.style.backgroundImage), /^url\("data:image\/png;base64,/);
});

test('finishing observed work starts a reading, and an unseen start does not', () => {
  const stores = createStores();
  stores.set({ running: ['a'] });
  const rendered = mount(stores.props());
  assert.equal(stateOf(rendered), 'working');

  // Falling edge: the turn the companion watched is over.
  stores.set({ running: [] });
  rerender(rendered);
  assert.equal(stateOf(rendered), 'reading');

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
  const line = bubbleText(shown[0]);
  assert.ok(line.length > 0 && line.length < 60, `line looks wrong: ${line}`);
});

test('a quoted line carries its attribution', () => {
  const stores = createStores();
  stores.set({ running: ['a'] });
  const rendered = mount(stores.props());

  // Finish the watched turn, which puts the sage into a reading.
  stores.set({ running: [] });
  rerender(rendered);
  assert.equal(stateOf(rendered), 'reading');

  const shown = bubbles(rendered.tree);
  assert.equal(shown.length, 1, 'the reading should raise one bubble');
  const text = bubbleText(shown[0]);
  const source = bubbleSource(shown[0]);
  assert.ok(text.length > 0, 'the quoted line needs text');
  // Borrowed words are never presented as the sage's own: the citation names the
  // book the line comes from.
  assert.ok(source && source.length > 0, `a quoted line must name its source, got: ${source}`);
  assert.match(source, /《.+》/, 'the citation should name a book');
  assert.doesNotMatch(source, /史铁生/, 'the citation carries the book, not the author');
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
  assert.ok(spriteOf(after), 'the sprite should stay mounted through a poke');
});

test('a drag moves the companion instead of opening a bubble', () => {
  const stores = createStores();
  const props = stores.props();
  const rendered = mount(props);
  const root = rootElement(rendered.tree);
  // An un-dragged companion is placed by the stylesheet, so it carries the
  // default inset rather than a recorded pixel position.
  assert.equal(root.props.style.left, '24px', 'an un-dragged pet hangs on the default anchor');
  assert.equal(root.props.style.right, undefined, 'the default anchor is a corner, not a right offset');

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
  // After a real drag the position is explicit, so the stylesheet default is
  // replaced by a recorded pixel position. Where it lands does not matter here —
  // the drag may snap back to a corner — only that it is now recorded.
  assert.match(String(moved.props.style.left), /^\d+px$/);
  assert.match(String(moved.props.style.top), /^\d+px$/);
  assert.equal(moved.props.style.right, undefined, 'a recorded position never uses the right offset');
  assert.equal(moved.props.style.bottom, undefined, 'a recorded position never uses the bottom offset');
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

test('working is a reading, and it stays a reading however long the work lasts', () => {
  const clock = { now: 1_000_000 };
  const stores = createStores();
  stores.set({ running: ['a'] });
  const rendered = mount(stores.props(), { now: () => clock.now });
  assert.equal(stateOf(rendered), 'working');
  assert.equal(rootElement(rendered.tree).props['data-sprite'], 'reading');

  // A long session must not turn into pacing about. Time only moves the clock.
  clock.now += 60_000;
  rendered.bundle.tick(1);
  rerender(rendered);
  assert.equal(stateOf(rendered), 'working');
  assert.equal(rootElement(rendered.tree).props['data-sprite'], 'reading');

  // Once the work stops, the sage is already sitting down and keeps reading.
  stores.set({ running: [] });
  clock.now += 100;
  rendered.bundle.tick(1);
  rerender(rendered);
  assert.equal(stateOf(rendered), 'reading');
  assert.equal(rootElement(rendered.tree).props['data-sprite'], 'reading');
});

test('a position saved under an older layout is discarded once', () => {
  // A remembered position beats the default, which is right while someone is
  // arranging their own desktop. It also means a corrected default would never
  // reach anyone who had ever dragged the sage, so the saved position records the
  // layout it belongs to, and a stale one is ignored.
  const stale = mountWithSaved({ x: 900, y: 500, layoutVersion: 1 });
  const staleRoot = rootElement(stale.tree);
  assert.equal(staleRoot.props.style.left, '24px', 'a stale position falls back to the default anchor');
  assert.equal(staleRoot.props.style.top, '24px');

  const current = mountWithSaved({ x: 900, y: 500, layoutVersion: 2 });
  const currentRoot = rootElement(current.tree);
  assert.equal(currentRoot.props.style.left, '900px', 'a current position is honoured');
  assert.equal(currentRoot.props.style.top, '500px');

  // With no version recorded at all, the position is treated as stale too.
  const unversioned = mountWithSaved({ x: 900, y: 500 });
  assert.equal(rootElement(unversioned.tree).props.style.left, '24px');
});

test('dragging the sage makes it run, facing the way it is carried', () => {
  const stores = createStores();
  const props = stores.props();
  const rendered = mount(props);
  const root = rootElement(rendered.tree);
  assert.equal(root.props['data-sprite'], 'idle', 'a still sage is not running');

  // The companion rests in the top-left corner, so the probe moves right and
  // downward: dragging away from a corner is what gives it somewhere to go.
  const pointerId = 3;
  root.props.onPointerDown({
    button: 0,
    pointerId,
    clientX: 200,
    clientY: 200,
    currentTarget: { setPointerCapture() {} }
  });

  root.props.onPointerMove({ pointerId, clientX: 500, clientY: 400 });
  let moved = rootElement(rerender(rendered));
  assert.equal(moved.props['data-sprite'], 'run-right', 'carried inward means facing right');
  assert.equal(moved.props['data-state'], 'carried');

  // Carried back the other way, still well inside the window, so the facing
  // reverses rather than hitting a wall.
  root.props.onPointerMove({ pointerId, clientX: 300, clientY: 400 });
  moved = rootElement(rerender(rendered));
  assert.equal(moved.props['data-sprite'], 'run-left', 'carried outward means facing left');

  // Letting go stops the running immediately.
  root.props.onPointerUp({
    pointerId,
    clientX: 300,
    clientY: 700,
    currentTarget: { releasePointerCapture() {} }
  });
  moved = rootElement(rerender(rendered));
  assert.equal(moved.props['data-sprite'], 'idle');
  assert.equal(moved.props['data-state'], 'resting');
});

test('running into a screen edge turns the sage around', () => {
  const stores = createStores();
  const props = stores.props();
  const rendered = mount(props);
  const root = rootElement(rendered.tree);

  root.props.onPointerDown({
    button: 0,
    pointerId: 4,
    clientX: 100,
    clientY: 100,
    currentTarget: { setPointerCapture() {} }
  });
  // The harness viewport is 1280 wide and the box is about 274, so this pins the
  // sage to the right edge.
  root.props.onPointerMove({ pointerId: 4, clientX: 5000, clientY: 100 });
  const moved = rootElement(rerender(rendered));
  assert.equal(
    moved.props['data-sprite'],
    'run-left',
    'pinned to the right edge, the sage should face back into the window'
  );
});

test('the frame ticker advances within a state and stops while asleep', () => {
  const stores = createStores();
  const props = stores.props();
  const rendered = mount(props);
  const first = spriteOf(rendered.tree).props.style.backgroundPosition;

  rendered.bundle.tick(1);
  const advanced = spriteOf(rendered.petHarness.render(props)).props.style.backgroundPosition;
  assert.notEqual(advanced, first, 'the idle animation should advance a frame');

  // Reduce-motion must stop the animation outright, not merely slow it.
  const still = mount(createStores().props(), { reduceMotion: true });
  const before = spriteOf(still.tree).props.style.backgroundPosition;
  still.bundle.tick(3);
  const after = spriteOf(still.petHarness.render(still.props)).props.style.backgroundPosition;
  assert.equal(after, before, 'no frames should advance when motion is off');
});

/* ------------------------------------------------------------------ *
 * Artwork integration
 * ------------------------------------------------------------------ */

test('the sprite is positioned inside the sheet with integer pixel offsets', () => {
  const rendered = mount({});
  const style = spriteOf(rendered.tree).props.style;
  // Fractional background offsets are what blur pixel art, so every value the
  // renderer computes must already be a whole number of pixels.
  for (const value of [style.width, style.height]) {
    assert.match(String(value), /^-?\d+px$/, `${value} should be a whole pixel count`);
  }
  const [sizeW, sizeH] = String(style.backgroundSize).split(' ');
  const [posX, posY] = String(style.backgroundPosition).split(' ');
  for (const value of [sizeW, sizeH, posX, posY]) {
    assert.match(value, /^-?\d+px$/, `${value} should be a whole pixel count`);
  }
  // Whatever scale is in use, the sheet must be an exact integer multiple of its
  // source size — that is the invariant that keeps the pixels square.
  const sheet = JSON.parse(readFileSync(join(root, 'assets', 'sage-index.json'), 'utf8'));
  const scaleX = Number.parseInt(sizeW, 10) / sheet.sheetWidth;
  const scaleY = Number.parseInt(sizeH, 10) / sheet.sheetHeight;
  assert.ok(Number.isInteger(scaleX) && scaleX >= 1, `sheet width scale ${scaleX} is not an integer`);
  assert.equal(scaleX, scaleY, 'the sheet must be scaled by the same factor on both axes');
  const boxWidth = Number.parseInt(String(style.width), 10);
  // The box is exactly the artwork: any slop here would sit between the visible
  // pixels and the box edge, and the bubble is anchored to the box, so the
  // character would look offset from its own speech.
  assert.equal(boxWidth, sheet.stage.art.width * scaleX, 'the box should be the artwork, not the artwork plus margin');

  // The sprite and the box must agree, so the visible pixels fill the box the
  // bubble is anchored to.
  const sprite = spriteOf(rendered.tree);
  assert.equal(String(sprite.props.style.width), boxWidth + 'px', 'the sprite fills the box width');
  assert.equal(sprite.props.style.marginBottom, undefined, 'the sprite must not carry its own bottom offset');
  const boxHeight = Number.parseInt(String(style.height), 10);
  const spriteHeight = Number.parseInt(String(sprite.props.style.height), 10);
  assert.ok(boxHeight >= spriteHeight, 'the box cannot be shorter than the sprite');
  const groundGap = (sheet.stage.ground - (sheet.stage.art.y + sheet.stage.art.height)) * scaleX;
  assert.equal(boxHeight - spriteHeight, groundGap, 'the box adds exactly the ground gap below the sprite');
});

test('the drawn frame changes as the session state changes', () => {
  const stores = createStores();
  const idle = mount(stores.props());
  const idlePosition = spriteOf(idle.tree).props.style.backgroundPosition;
  const idleSprite = rootElement(idle.tree).props['data-sprite'];
  assert.equal(idleSprite, 'idle');

  stores.set({ running: ['a'] });
  const busy = mount(stores.props());
  const busyPosition = spriteOf(busy.tree).props.style.backgroundPosition;
  // Work reads; the running rows belong to being carried.
  assert.equal(rootElement(busy.tree).props['data-sprite'], 'reading');
  assert.notEqual(busyPosition, idlePosition, 'a different state should draw a different cell');
});

test('every frame of a state lies on its own row of the sheet', () => {
  // Guards the index generator: a bad row would silently draw another animation.
  const sheet = JSON.parse(readFileSync(join(root, 'assets', 'sage-index.json'), 'utf8'));
  for (const state of sheet.states) {
    const rows = new Set(state.frames.map((frame) => frame.y));
    assert.equal(rows.size, 1, `state ${state.state} spans ${rows.size} rows`);
    assert.equal([...rows][0], state.row * sheet.cellHeight);
    const columns = state.frames.map((frame) => frame.x / sheet.cellWidth);
    assert.deepEqual(
      columns,
      [...Array(state.frames.length).keys()],
      `state ${state.state} frames should be left-aligned columns`
    );
  }
  assert.equal(sheet.directions.length, 16, 'the gaze rows should cover sixteen poses');
  const angles = sheet.directions.map((direction) => direction.degrees);
  assert.deepEqual(angles, [...Array(16).keys()].map((index) => index * 22.5));
});

test('the stylesheet reaches the document exactly once per activation', () => {
  const bundle = loadBundle();
  const first = createFakeCtx({ locale: 'zh' });
  const dispose = bundle.exports.apply(first.ctx);
  const styles = bundle.document.head.children.filter((node) => node.tagName === 'STYLE');
  assert.equal(styles.length, 1, 'one stylesheet should be injected');
  const css = styles[0].textContent;
  assert.ok(css.includes('.infj-pet'), 'the stylesheet should carry the pet rules');
  assert.ok(css.includes('image-rendering:pixelated'), 'the sprite must not be smoothed');
  assert.ok(css.includes('@keyframes infj-anim-run-right'), 'animation keyframes should be generated');
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
