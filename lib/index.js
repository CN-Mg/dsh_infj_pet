/**
 * INFJ Sage — Host half.
 *
 * A read-only listener on the session event stream. It keeps only turn
 * boundaries (start / end and the reason) plus a coarse identity flag, never
 * message content, tool arguments, or transcripts. Nothing here calls a model,
 * opens a port, writes to disk, or answers an approval.
 *
 * The companion's visible behaviour is driven by the Web client half, which
 * reads the client stores directly. This half exists so a Host-side consumer
 * can observe the same activity, and so the plugin owns a meaningful Host
 * presence rather than only a browser bundle.
 */

/** Cordis plugin name; also the service key. */
export const name = 'infjPet';

/** The agents registry is optional, so a missing one degrades instead of blocking. */
export const inject = { optional: ['agents'] };

/** Bounded ring of remembered boundaries. */
export const HISTORY_LIMIT = 256;

/** Longest accepted session identifier or reason string. */
const TEXT_LIMIT = 128;

/** Only these two boundary kinds are observed. */
const BOUNDARY_TYPES = new Set(['turn/start', 'turn/end']);

/**
 * @param {unknown} value
 * @returns {string | undefined} a bounded, non-empty string
 */
function text(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > TEXT_LIMIT ? trimmed.slice(0, TEXT_LIMIT) : trimmed;
}

/**
 * True when the session is a child of another session rather than a
 * person-facing one. Identity is reported by the runtime; when it cannot be
 * determined the flag stays `undefined` instead of being guessed.
 *
 * @param {{ get(id: string): unknown, roots(): unknown[] } | undefined} agents
 * @param {string} sessionId
 * @returns {boolean | undefined}
 */
export function runtimeIdentity(agents, sessionId) {
  try {
    const agent = agents?.get?.(sessionId);
    if (!agent || typeof agents?.roots !== 'function') return undefined;
    return !agents.roots().includes(agent);
  } catch {
    return undefined;
  }
}

/**
 * Records turn boundaries in arrival order and projects a small summary.
 *
 * Ordering rules: a session's `seq` is monotonic, so anything not strictly
 * newer than what was already seen for that session is dropped. This keeps a
 * replayed or out-of-order event from moving the projection backwards.
 */
export class BoundaryRecorder {
  /**
   * @param {{ epoch?: string, historyLimit?: number, now?: () => number }} [options]
   */
  constructor({ epoch, historyLimit = HISTORY_LIMIT, now = () => Date.now() } = {}) {
    this.epoch = text(epoch) ?? globalThis.crypto.randomUUID();
    this.now = now;
    this.historyLimit = Math.max(2, Math.min(4096, historyLimit));
    this.seq = 0;
    /** @type {Map<string, number>} */
    this.lastSeq = new Map();
    /** @type {Array<object>} */
    this.history = [];
    this.starts = 0;
    this.ends = 0;
    this.active = new Set();
  }

  /**
   * @param {{ id?: string } | undefined} session
   * @param {object | undefined} event
   * @returns {object | undefined} the recorded boundary, or `undefined` when ignored
   */
  accept(session, event) {
    if (!event || !BOUNDARY_TYPES.has(event.type)) return undefined;
    const sessionId = text(session?.id);
    if (!sessionId) return undefined;
    if (!Number.isSafeInteger(event.seq) || event.seq < 0) return undefined;
    if (event.seq <= (this.lastSeq.get(sessionId) ?? -1)) return undefined;
    this.lastSeq.delete(sessionId);
    this.lastSeq.set(sessionId, event.seq);
    if (this.lastSeq.size > 4096) this.lastSeq.delete(this.lastSeq.keys().next().value);

    const start = event.type === 'turn/start';
    if (start) {
      this.starts += 1;
      this.active.add(sessionId);
    } else {
      this.ends += 1;
      this.active.delete(sessionId);
    }

    const boundary = {
      type: event.type,
      sessionId,
      seq: event.seq,
      time: text(event.time) ?? this.now(),
      epoch: this.epoch,
    };
    if (!start) {
      boundary.reason = text(event.data?.reason?.kind) ?? 'unknown';
    }

    this.history.push(boundary);
    if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
    return boundary;
  }

  /** @returns {{ epoch: string, starts: number, ends: number, active: number, last?: object }} */
  summary() {
    return {
      epoch: this.epoch,
      starts: this.starts,
      ends: this.ends,
      active: this.active.size,
      last: this.history[this.history.length - 1],
    };
  }

  clear() {
    this.lastSeq.clear();
    this.history.length = 0;
    this.active.clear();
    this.starts = 0;
    this.ends = 0;
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const recorder = new BoundaryRecorder();
  const agents = ctx.get('agents');

  const service = {
    /** @returns {object | undefined} the newest recorded boundary */
    last() {
      return recorder.history[recorder.history.length - 1];
    },
    /** @returns {object[]} a copy, oldest first */
    recent(limit = 20) {
      const count = Number.isFinite(limit) ? Math.max(0, Math.min(recorder.historyLimit, Math.trunc(limit))) : 20;
      // `slice(-0)` is `slice(0)`, which would return everything, so zero needs
      // its own answer.
      if (count === 0) return [];
      return recorder.history.slice(-count);
    },
    summary() {
      return recorder.summary();
    },
  };
  ctx.provide(name, service);

  ctx.on('session/event', (session, event) => {
    const boundary = recorder.accept(session, event);
    if (!boundary) return;
    // A boundary the runtime cannot attribute to a child or a root keeps the
    // flag absent rather than defaulting to either.
    const isSubagent = runtimeIdentity(agents, boundary.sessionId);
    if (isSubagent !== undefined) boundary.isSubagent = isSubagent;
    boundary.recorded = recorder.summary();
  }, { global: true });

  ctx.effect(() => () => recorder.clear(), 'infj-pet.recorder');
}
