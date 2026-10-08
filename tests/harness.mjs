import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function sameDeps(a, b) {
  if (!a || !b) return false;
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

/**
 * Renders one Function Component with working hooks, keeping state alive across
 * passes so that a `setState` inside an effect is observable on the next pass.
 * It builds a plain tree instead of touching a DOM.
 */
export class ComponentHarness {
  constructor(Component, initialProps = {}) {
    this.Component = Component;
    this.state = {};
    this.refs = {};
    this.memos = {};
    this.effects = {};
    this.pending = [];
    this.cleanups = [];
    this.warnings = [];
    this.hookIndex = 0;
  }

  get react() {
    const self = this;
    return {
      createElement(type, props, ...children) {
        const flat = [];
        const push = (value) => {
          if (value === null || value === undefined || typeof value === 'boolean') return;
          if (Array.isArray(value)) {
            value.forEach(push);
            return;
          }
          flat.push(value);
        };
        children.forEach(push);
        return { __el: true, type, props: props ?? {}, children: flat };
      },
      Fragment: 'Fragment',
      useState(initial) {
        const index = self.hookIndex++;
        if (!(index in self.state)) self.state[index] = typeof initial === 'function' ? initial() : initial;
        return [
          self.state[index],
          (next) => {
            self.state[index] = typeof next === 'function' ? next(self.state[index]) : next;
          }
        ];
      },
      useRef(initial) {
        const index = self.hookIndex++;
        if (!(index in self.refs)) self.refs[index] = { current: initial };
        return self.refs[index];
      },
      useMemo(factory, deps) {
        const index = self.hookIndex++;
        const previous = self.memos[index];
        if (!previous || !sameDeps(previous.deps, deps)) self.memos[index] = { value: factory(), deps };
        return self.memos[index].value;
      },
      useCallback(fn, deps) {
        return this.useMemo(() => fn, deps);
      },
      useEffect(effect, deps) {
        const index = self.hookIndex++;
        const previous = self.effects[index];
        if (previous && sameDeps(previous.deps, deps)) return;
        self.pending.push({ index, effect, deps });
      },
      createContext(defaultValue) {
        return { __context: true, defaultValue };
      },
      memo(component) {
        return component;
      }
    };
  }

  /**
   * Points this harness at a component that only becomes available after its
   * bundle has loaded.
   *
   * The React object a component closes over is captured when the bundle's
   * factory runs, so the harness that renders the component must be the same one
   * the bundle was loaded with. Building a second harness here would give the
   * component a different React than the test renders through, and hook state
   * would silently land in the wrong object.
   */
  mountComponent(Component) {
    this.Component = Component;
    this.state = {};
    this.refs = {};
    this.memos = {};
    this.effects = {};
    this.pending = [];
    this.hookIndex = 0;
    return this;
  }

  /** One render pass: run the component, then flush this pass's effects. */
  pass(props = {}) {
    this.hookIndex = 0;
    this.pending = [];
    const element = { __el: true, type: this.Component, props, children: [] };
    const tree = this.renderElement(element, {});
    const queued = this.pending;
    this.pending = [];
    queued.forEach((job) => {
      const previous = this.effects[job.index];
      if (previous?.cleanup) previous.cleanup();
      const cleanup = job.effect();
      this.effects[job.index] = { deps: job.deps, effect: job.effect, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
    });
    return tree;
  }

  /** Renders repeatedly until state settles, so effect-driven transitions show. */
  render(props = {}, passes = 6) {
    let tree;
    for (let i = 0; i < passes; i++) tree = this.pass(props);
    return tree;
  }

  unmount() {
    Object.values(this.effects).forEach((entry) => {
      try {
        entry.cleanup?.();
      } catch (error) {
        this.warnings.push(String(error));
      }
    });
    this.effects = {};
  }

  renderElement(node, props) {
    if (node === null || node === undefined || typeof node === 'boolean') return node;
    if (typeof node === 'string' || typeof node === 'number') return node;
    if (Array.isArray(node)) return node.map((child) => this.renderElement(child, props));
    if (typeof node.type === 'function') {
      const merged = Object.assign({}, props, node.props);
      if (node.children.length === 1) merged.children = node.children[0];
      else if (node.children.length > 1) merged.children = node.children;
      return this.renderElement(node.type(merged), props);
    }
    return {
      __el: true,
      type: node.type,
      props: node.props,
      children: node.children.map((child) => this.renderElement(child, props))
    };
  }
}

/** Depth-first walk over a rendered tree. */
export function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  visit(node);
  node.children?.forEach((child) => walk(child, visit));
}

/** Every element in the tree whose type matches. */
export function findAll(tree, predicate) {
  const found = [];
  walk(tree, (node) => {
    if (node.__el && predicate(node)) found.push(node);
  });
  return found;
}

/**
 * Concatenated text content of a rendered tree.
 *
 * Recursive on purpose: text nested inside wrapper elements (a span inside a
 * bubble, say) is still that element's text, and a shallow version silently
 * drops it.
 */
export function textOf(tree) {
  let text = '';
  const visit = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') {
      text += String(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    (node.children ?? []).forEach(visit);
  };
  walk(tree, (node) => {
    if (node && node.children) node.children.forEach(visit);
  });
  return text;
}

/**
 * Loads lib/client.js in a browser-like sandbox and returns its bundle exports.
 * Nothing here talks to DSH: it only proves the bundle is well formed and that
 * its factory runs.
 */
export function loadBundle(options = {}) {
  const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8');
  const registrations = [];

  const makeElement = (tag) => ({
    tagName: String(tag).toUpperCase(),
    children: [],
    attributes: {},
    style: {},
    textContent: '',
    classList: {
      add() {},
      remove() {}
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 40, top: 40, width: 148, height: 148, right: 188, bottom: 188 };
    }
  });

  const document = {
    head: makeElement('head'),
    body: makeElement('body'),
    createElement: makeElement,
    getElementById: () => null,
    querySelector: () => null,
    fonts: { add() {}, delete() {} },
    addEventListener() {},
    removeEventListener() {}
  };

  const sandbox = {
    console,
    document,
    // A sandbox has its own intrinsics, so patching Date on this side would not
    // reach the bundle. The clock is injected here instead, which lets a test
    // advance time without waiting for it.
    Date: options.now ? { now: options.now } : Date,
    setTimeout: (fn) => {
      if (typeof fn === 'function') sandbox.__timeouts.push(fn);
      return sandbox.__timeouts.length;
    },
    clearTimeout: () => {},
    setInterval: (fn, ms) => {
      if (typeof fn === 'function') {
        const id = sandbox.__intervals.length + 1;
        sandbox.__intervals.push({ id, fn, ms });
        return id;
      }
      return 0;
    },
    clearInterval: (id) => {
      const index = sandbox.__intervals.findIndex((entry) => entry.id === id);
      if (index >= 0) sandbox.__intervals.splice(index, 1);
    },
    localStorage: {
      store: new Map(),
      getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
      },
      setItem(key, value) {
        this.store.set(key, String(value));
      }
    },
    matchMedia: () => ({ matches: options.reduceMotion === true }),
    innerWidth: 1280,
    innerHeight: 800,
    navigator: { language: options.navigatorLanguage ?? 'zh-CN' },
    __timeouts: [],
    __intervals: [],
    window: {
      __ModuleLoader__: {
        load(registration) {
          registrations.push(registration);
        }
      }
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window.document = document;

  const context = vm.createContext(sandbox);
  new vm.Script(source, { filename: 'lib/client.js' }).runInContext(context);

  if (registrations.length !== 1) {
    throw new Error(`expected exactly one bundle registration, saw ${registrations.length}`);
  }

  const requested = [];
  // The component must build elements with the harness's React, because that is
  // the object whose hooks are instrumented. A separate `createElement` would
  // produce trees this harness can still walk, but hook state would live
  // somewhere else and transitions would never settle. When the caller does not
  // supply one, an idle harness is created so the module can at least load.
  const harness = options.harness ?? new ComponentHarness(() => null);
  const react = harness.react;
  const requireStub = (specifier) => {
    requested.push(specifier);
    if (specifier === 'react') return react;
    if (specifier === 'react-dom') return { createPortal: () => null };
    if (specifier === 'react-dom/client') return { createRoot: () => ({ render() {}, unmount() {} }) };
    throw new Error(`unexpected module request: ${specifier}`);
  };

  return {
    registration: registrations[0],
    exports: registrations[0].factory(requireStub),
    requested,
    harness,
    sandbox,
    document,
    /**
     * Fires the sandbox's timers, so a test can advance the plugin's own clock
     * without waiting in real time. Only the frame ticker runs on an interval.
     * @param {number} times how many ticks to deliver
     */
    tick(times = 1) {
      for (let i = 0; i < times; i++) {
        for (const entry of [...sandbox.__intervals]) entry.fn();
      }
    },
    intervalCount() {
      return sandbox.__intervals.length;
    }
  };
}

/**
 * Builds a fake Cordis context that records what the plugin registers.
 * Pass `locale: null` to model a host that reports no active language at all.
 */
export function createFakeCtx(options = {}) {
  const recorded = { slots: [], localeListener: null, localeActive: options.locale === undefined ? 'zh' : options.locale };
  const ctx = {
    locale: {
      // A mutable active language so a test can publish a change through the
      // listener the plugin subscribed with.
      getSnapshot: () => ({ active: recorded.localeActive }),
      subscribe: (listener) => {
        recorded.localeListener = listener;
        return () => {
          recorded.localeUnsubscribed = true;
        };
      }
    },
    slots: {
      inject(name, factory) {
        recorded.slots.push(name);
        recorded.disposer = factory();
        // Disposing an injection also disposes what it contributed, which is the
        // lifecycle guarantee the plugin relies on.
        return () => {
          recorded.slotDisposed = true;
          recorded.disposer?.();
        };
      },
      register(spec, component) {
        recorded.registration = { spec, component };
        return () => {
          recorded.registrationDisposed = true;
        };
      }
    }
  };
  return { ctx, recorded };
}

const ART_VIEWBOX = 400;
export { ART_VIEWBOX };
