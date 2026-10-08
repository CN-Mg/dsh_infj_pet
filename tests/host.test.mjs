import test from 'node:test';
import assert from 'node:assert/strict';

import { apply, BoundaryRecorder, runtimeIdentity, HISTORY_LIMIT } from '../lib/index.js';

/** A minimal Cordis stand-in that records what apply() registers. */
function createHost() {
  const recorded = { provided: new Map(), listeners: [], effects: [] };
  const ctx = {
    get: () => undefined,
    provide(name, service) {
      recorded.provided.set(name, service);
    },
    on(event, handler, options) {
      recorded.listeners.push({ event, handler, options });
      return () => {};
    },
    effect(factory, label) {
      recorded.effects.push({ label, dispose: factory() });
      return () => {};
    }
  };
  return { ctx, recorded };
}

function turnStart(seq) {
  return { type: 'turn/start', seq };
}

function turnEnd(seq, kind) {
  return { type: 'turn/end', seq, data: { reason: { kind } } };
}

test('the Host half declares an optional dependency and a name', async () => {
  const module = await import('../lib/index.js');
  assert.equal(module.name, 'infjPet');
  assert.equal(typeof module.apply, 'function');
  assert.deepEqual(module.inject, { optional: ['agents'] });
});

test('applying the Host half provides one service and listens globally', () => {
  const { ctx, recorded } = createHost();
  apply(ctx);
  assert.ok(recorded.provided.has('infjPet'));
  const listener = recorded.listeners.find((entry) => entry.event === 'session/event');
  assert.ok(listener, 'it should observe session events');
  assert.deepEqual(listener.options, { global: true });
  assert.equal(recorded.effects.length, 1);
});

test('the recorder keeps only turn boundaries, in order', () => {
  const recorder = new BoundaryRecorder({ epoch: 'e1', now: () => 1000 });
  const session = { id: 's1' };

  assert.equal(recorder.accept(session, turnStart(0)).type, 'turn/start');
  assert.equal(recorder.accept(session, turnEnd(1, 'completed')).reason, 'completed');
  assert.equal(recorder.ends, 1);

  const summary = recorder.summary();
  assert.equal(summary.starts, 1);
  assert.equal(summary.ends, 1);
  assert.equal(summary.active, 0);
  assert.equal(summary.last.type, 'turn/end');
});

test('the recorder ignores replays, other event kinds, and unusable input', () => {
  const recorder = new BoundaryRecorder();
  const session = { id: 's1' };
  recorder.accept(session, turnStart(5));
  assert.equal(recorder.accept(session, turnStart(5)), undefined, 'a repeated seq is dropped');
  assert.equal(recorder.accept(session, turnStart(4)), undefined, 'an older seq is dropped');
  assert.equal(recorder.accept(session, { type: 'message/delta', seq: 9 }), undefined);
  assert.equal(recorder.accept({}, turnStart(9)), undefined, 'an unidentified session is dropped');
  assert.equal(recorder.accept(session, { type: 'turn/start', seq: -1 }), undefined);
  assert.equal(recorder.accept(session, { type: 'turn/start', seq: 1.5 }), undefined);
  assert.equal(recorder.starts, 1);
});

test('the recorder bounds its history and its sequence memory', () => {
  const recorder = new BoundaryRecorder({ historyLimit: 3 });
  for (let i = 0; i < 10; i++) recorder.accept({ id: 's1' }, turnStart(i));
  assert.equal(recorder.history.length, 3, `history should be capped at ${HISTORY_LIMIT} or less`);

  const wide = new BoundaryRecorder();
  for (let i = 0; i < 4100; i++) wide.accept({ id: `s${i}` }, turnStart(0));
  assert.ok(wide.lastSeq.size <= 4096, 'the sequence map must stay bounded');
});

test('the recorder tracks concurrent sessions independently', () => {
  const recorder = new BoundaryRecorder();
  recorder.accept({ id: 'a' }, turnStart(0));
  recorder.accept({ id: 'b' }, turnStart(0));
  assert.equal(recorder.summary().active, 2);
  recorder.accept({ id: 'a' }, turnEnd(1, 'cancelled'));
  const summary = recorder.summary();
  assert.equal(summary.active, 1);
  assert.equal(summary.last.reason, 'cancelled');
});

test('the provided service exposes the recorder projection', () => {
  const { ctx, recorded } = createHost();
  apply(ctx);
  const service = recorded.provided.get('infjPet');
  assert.equal(typeof service.last, 'function');
  assert.equal(typeof service.recent, 'function');
  assert.equal(typeof service.summary, 'function');
  assert.equal(service.summary().starts, 0);
  assert.equal(service.last(), undefined);

  const listener = recorded.listeners.find((entry) => entry.event === 'session/event');
  listener.handler({ id: 's1' }, turnStart(0));
  assert.equal(service.last().type, 'turn/start');
  assert.equal(service.recent(5).length, 1);
  assert.equal(service.recent(0).length, 0);
});

test('a session event that is not a boundary leaves the projection alone', () => {
  const { ctx, recorded } = createHost();
  apply(ctx);
  const service = recorded.provided.get('infjPet');
  const listener = recorded.listeners.find((entry) => entry.event === 'session/event');
  listener.handler({ id: 's1' }, { type: 'assistant/message', seq: 3 });
  assert.equal(service.summary().starts, 0);
  assert.equal(service.summary().ends, 0);
});

test('identity stays unknown when the agents registry cannot answer', () => {
  assert.equal(runtimeIdentity(undefined, 's1'), undefined);
  assert.equal(runtimeIdentity({ get: () => undefined, roots: () => [] }, 's1'), undefined);

  const agent = { id: 's1' };
  const child = { id: 'child' };
  const registry = {
    get: (id) => (id === 's1' ? agent : child),
    roots: () => [agent]
  };
  assert.equal(runtimeIdentity(registry, 's1'), false);
  assert.equal(runtimeIdentity(registry, 'child'), true);

  const hostile = {
    get() {
      throw new Error('registry exploded');
    },
    roots() {
      return [];
    }
  };
  assert.equal(runtimeIdentity(hostile, 's1'), undefined, 'a throwing registry must not escape');
});

test('a boundary event is annotated with identity when it can be determined', () => {
  const { ctx, recorded } = createHost();
  const agent = { id: 's1' };
  ctx.get = () => ({ get: () => agent, roots: () => [agent] });
  apply(ctx);
  const service = recorded.provided.get('infjPet');
  const listener = recorded.listeners.find((entry) => entry.event === 'session/event');
  listener.handler({ id: 's1' }, turnStart(0));
  const last = service.last();
  assert.equal(last.isSubagent, false);
  assert.ok(last.recorded, 'the boundary should carry a summary');
});

test('disposing the effect clears the recorder', () => {
  const { ctx, recorded } = createHost();
  apply(ctx);
  const listener = recorded.listeners.find((entry) => entry.event === 'session/event');
  listener.handler({ id: 's1' }, turnStart(0));
  const service = recorded.provided.get('infjPet');
  assert.equal(service.summary().starts, 1);
  recorded.effects[0].dispose();
  assert.equal(service.summary().starts, 0);
  assert.equal(service.last(), undefined);
});
