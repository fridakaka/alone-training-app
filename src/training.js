// Pure training logic: no DOM, no storage. Easy to test and to extend.
// Suggested durations live in progression.js.

export const RESULTS = Object.freeze({ GOOD: 'good', BAD: 'bad' });

export const SCHEMA_VERSION = 2;

export const DEFAULT_CONTEXTS = Object.freeze([
  { id: 'home', name: 'Home' },
  { id: 'car', name: 'Car' },
  { id: 'outside-shop', name: 'Outside shop' },
]);

export function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    dogs: [{ id: 'charlie', name: 'Charlie' }],
    contexts: DEFAULT_CONTEXTS.map((c) => ({ ...c })),
    selectedContextId: 'home', // last chosen context, remembered between visits
    active: null, // session currently running
    pending: null, // session ended but not yet rated
    lastBackupAt: null, // when a backup file was last saved
    sessions: [],
  };
}

export function selectContext(state, contextId) {
  if (state.active || !state.contexts.some((c) => c.id === contextId)) return state;
  return { ...state, selectedContextId: contextId };
}

// targetSec is only a note of intent (number of seconds or null).
// It never stops or changes the timer.
export function startSession(state, { dogId, contextId, targetSec = null, now = Date.now() }) {
  if (state.active) return state;
  return { ...state, active: { dogId, contextId, targetSec: normalizeTarget(targetSec), startedAt: now } };
}

function normalizeTarget(t) {
  return Number.isFinite(t) && t > 0 ? Math.round(t) : null;
}

export function elapsedSeconds(active, now = Date.now()) {
  if (!active) return 0;
  return Math.max(0, Math.floor((now - active.startedAt) / 1000));
}

// Ending creates a "pending" session that still needs a result.
// It is kept in state so it survives the app being closed before rating.
export function endSession(state, now = Date.now()) {
  if (!state.active) return state;
  const { dogId, contextId, startedAt, targetSec = null } = state.active;
  const pending = {
    dogId,
    contextId,
    startedAt,
    endedAt: now,
    durationSec: elapsedSeconds(state.active, now), // actual duration
    targetSec,
  };
  return { ...state, active: null, pending };
}

export function recordResult(state, result) {
  if (!state.pending) return state;
  if (!Object.values(RESULTS).includes(result)) {
    throw new Error(`Unknown result: ${result}`);
  }
  const session = { id: makeId(state.pending.startedAt), ...state.pending, result };
  return { ...state, pending: null, sessions: [...state.sessions, session] };
}

export function discardPending(state) {
  return { ...state, pending: null };
}

// Edit a saved session. Only these fields can change; invalid values are ignored.
export function updateSession(state, id, changes) {
  const patch = {};
  if (Object.values(RESULTS).includes(changes.result)) patch.result = changes.result;
  if (Number.isFinite(changes.durationSec) && changes.durationSec >= 0) {
    patch.durationSec = Math.round(changes.durationSec);
  }
  if ('targetSec' in changes) patch.targetSec = normalizeTarget(changes.targetSec);
  if (state.contexts.some((c) => c.id === changes.contextId)) patch.contextId = changes.contextId;
  return {
    ...state,
    sessions: state.sessions.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, ...patch };
      if ('durationSec' in patch) next.endedAt = next.startedAt + next.durationSec * 1000;
      return next;
    }),
  };
}

export function deleteSession(state, id) {
  return { ...state, sessions: state.sessions.filter((s) => s.id !== id) };
}

export function sessionsFor(state, { dogId, contextId }) {
  return state.sessions
    .filter((s) => s.dogId === dogId && s.contextId === contextId)
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function formatTimer(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Human-friendly short duration: "45 s", "3 min 05 s", "1 h 02 min".
export function formatDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
}

function makeId(seed) {
  return `${seed.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
