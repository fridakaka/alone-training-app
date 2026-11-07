// Pure training logic: no DOM, no storage. Easy to test and to extend.
// Suggested durations live in progression.js.

export const RESULTS = Object.freeze({ GOOD: 'good', BAD: 'bad' });

// "Don't know" how it went (v0.19): judged by how the dog was on your return.
// calm → counted as went well (the next session keeps the same target); unsettled → didn't go well.
export const RETURN_CHECK = Object.freeze({ CALM: 'calm', UNSETTLED: 'unsettled' });
export const resultForReturn = (check) => (check === RETURN_CHECK.CALM ? RESULTS.GOOD : check === RETURN_CHECK.UNSETTLED ? RESULTS.BAD : null);

export const SCHEMA_VERSION = 2;

export const DEFAULT_CONTEXTS = Object.freeze([
  { id: 'home', name: 'Home' },
  { id: 'car', name: 'Car' },
  { id: 'outside-shop', name: 'Outside shop' },
]);

export function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    dogs: [{ id: 'charlie', name: 'Charlie', prepDone: [] }], // up to MAX_DOGS (v0.18)
    selectedDogId: 'charlie', // the dog shown on the main screen
    contexts: DEFAULT_CONTEXTS.map((c) => ({ ...c })),
    selectedContextId: 'home', // last chosen context, remembered between visits
    lang: null, // 'en' | 'sv'; null = not chosen yet (existing users are shown a small choice)
    onboarded: false, // new users see the short welcome once; loaded older data counts as onboarded
    active: null, // session currently running
    pending: null, // session ended but not yet rated
    lastBackupAt: null, // when a backup file was last saved
    sessions: [],
  };
}

// ---------- place (context) names ----------
// Each place has a stable internal id (home / car / outside-shop). Sessions point to the id,
// so renaming only changes the label – sessions are never moved, copied or deleted.

export const MAX_CONTEXT_NAME = 30;

export function cleanContextName(name) {
  return String(name ?? '').normalize('NFC').trim();
}

// Returns an error code ('empty' | 'tooLong' | 'duplicate'), or null when the names can be saved.
// `names` is { [contextId]: name } and must cover every existing context.
export function validateContextNames(state, names) {
  const cleaned = state.contexts.map((c) => cleanContextName(names[c.id]));
  if (cleaned.some((n) => n === '')) return 'empty';
  if (cleaned.some((n) => [...n].length > MAX_CONTEXT_NAME)) return 'tooLong';
  const keys = cleaned.map((n) => n.toLocaleLowerCase('sv'));
  if (new Set(keys).size !== keys.length) return 'duplicate';
  return null;
}

// ---------- dogs ----------
// Up to three dogs (v0.18). Each has a stable id ('charlie' for the first dog of existing data);
// sessions point to it, so renaming never touches them. Each dog has its own history, its own
// suggestions and its own "Start here" ticks; the places are shared.

export const MAX_DOG_NAME = 30;
export const MAX_DOGS = 3;

/** The dog shown on the main screen (a running or unrated session's dog wins). */
export function currentDog(state) {
  const id = state.active?.dogId ?? state.pending?.dogId ?? state.selectedDogId;
  return state.dogs.find((d) => d.id === id) ?? state.dogs[0];
}

export function dogNameTaken(state, name, exceptId = null) {
  const key = cleanContextName(name).toLocaleLowerCase('sv');
  return state.dogs.some((d) => d.id !== exceptId && d.name.toLocaleLowerCase('sv') === key);
}

// Error code ('empty' | 'tooLong' | 'duplicate' | 'full') or null.
export function validateNewDog(state, name) {
  if (state.dogs.length >= MAX_DOGS) return 'full';
  return validateDogName(name) ?? (dogNameTaken(state, name) ? 'duplicate' : null);
}

/** Adds a dog and shows it. Unchanged if the name is invalid, taken, or there are already 3. */
export function addDog(state, name, { id = `dog-${Date.now().toString(36)}` } = {}) {
  if (validateNewDog(state, name) || state.dogs.some((d) => d.id === id)) return state;
  const dog = { id, name: cleanContextName(name), prepDone: [] };
  return selectDog({ ...state, dogs: [...state.dogs, dog] }, id);
}

/** Switching dog is not possible while a session runs or waits for its result. */
export function selectDog(state, dogId) {
  if (state.active || state.pending || !state.dogs.some((d) => d.id === dogId)) return state;
  return { ...state, selectedDogId: dogId };
}

/** Removes a dog AND its sessions. Never the last dog, never one with a running/unrated session. */
export function removeDog(state, dogId) {
  if (state.dogs.length <= 1 || !state.dogs.some((d) => d.id === dogId)) return state;
  if (state.active?.dogId === dogId || state.pending?.dogId === dogId) return state;
  const dogs = state.dogs.filter((d) => d.id !== dogId);
  return {
    ...state,
    dogs,
    sessions: state.sessions.filter((s) => s.dogId !== dogId),
    selectedDogId: state.selectedDogId === dogId ? dogs[0].id : state.selectedDogId,
  };
}

// Error code ('empty' | 'tooLong') or null.
export function validateDogName(name) {
  const n = cleanContextName(name);
  if (!n) return 'empty';
  if ([...n].length > MAX_DOG_NAME) return 'tooLong';
  return null;
}

/** Renames one dog (default: the first). Unchanged if the name is invalid or another dog has it. */
export function renameDog(state, name, dogId = state.dogs[0]?.id) {
  if (validateDogName(name) || dogNameTaken(state, name, dogId)) return state;
  return { ...state, dogs: state.dogs.map((d) => (d.id === dogId ? { ...d, name: cleanContextName(name) } : d)) };
}

/** Renames several dogs at once ({ [dogId]: name }). Error code, or null when they can be saved. */
export function validateDogNames(state, names) {
  const cleaned = state.dogs.map((d) => cleanContextName(names[d.id] ?? d.name));
  for (const n of cleaned) {
    const err = validateDogName(n);
    if (err) return err;
  }
  const keys = cleaned.map((n) => n.toLocaleLowerCase('sv'));
  return new Set(keys).size === keys.length ? null : 'duplicate';
}

export function renameDogs(state, names) {
  if (validateDogNames(state, names)) return state;
  return { ...state, dogs: state.dogs.map((d) => ({ ...d, name: cleanContextName(names[d.id] ?? d.name) })) };
}

// ---------- comments ----------
// Free journal text. Never read by the suggestion model.

export const MAX_COMMENT = 500;

// Trimmed, NFC, line breaks as \n, at most MAX_COMMENT characters; '' → null.
export function cleanComment(text) {
  if (typeof text !== 'string') return null;
  const s = text.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (!s) return null;
  return [...s].slice(0, MAX_COMMENT).join('');
}

// While the result screen is open, the typed comment is kept with the pending session,
// so it survives a reload and is saved together with the result.
export function setPendingComment(state, text) {
  if (!state.pending) return state;
  return { ...state, pending: { ...state.pending, comment: cleanComment(text) } };
}

// ---------- "Start here": ticked practice steps ----------
// Only a checklist: no sessions, no suggestion, no progression.

export const PREP_STEPS = Object.freeze(['prepStep1', 'prepStep2', 'prepStep3', 'prepStep4', 'prepStep5', 'prepStep6', 'prepStep7', 'prepStep8']);

export function cleanPrepDone(list) {
  return Array.isArray(list) ? PREP_STEPS.filter((k) => list.includes(k)) : [];
}

// Per dog (v0.18). Default: the dog on the main screen.
export function setPrepDone(state, key, done, dogId = currentDog(state).id) {
  if (!PREP_STEPS.includes(key)) return state;
  return {
    ...state,
    dogs: state.dogs.map((d) => {
      if (d.id !== dogId) return d;
      const set = new Set(cleanPrepDone(d.prepDone));
      if (done) set.add(key);
      else set.delete(key);
      return { ...d, prepDone: PREP_STEPS.filter((k) => set.has(k)) };
    }),
  };
}

export function clearPrepDone(state, dogId = currentDog(state).id) {
  return { ...state, dogs: state.dogs.map((d) => (d.id === dogId ? { ...d, prepDone: [] } : d)) };
}

// ---------- first start ----------

export function completeOnboarding(state, { lang, dogName, placeNames }) {
  let next = renameDog({ ...state, lang, onboarded: true }, dogName);
  if (placeNames) next = renameContexts(next, placeNames);
  return next;
}

// Only the labels change. Returns the same state unchanged if the names are invalid.
export function renameContexts(state, names) {
  if (validateContextNames(state, names)) return state;
  return {
    ...state,
    contexts: state.contexts.map((c) => ({ ...c, name: cleanContextName(names[c.id]) })),
  };
}

export function selectContext(state, contextId) {
  if (state.active || !state.contexts.some((c) => c.id === contextId)) return state;
  return { ...state, selectedContextId: contextId };
}

// targetSec is only a note of intent (number of seconds or null).
// It never stops or changes the timer.
export function startSession(state, { dogId, contextId, targetSec = null, easy = false, now = Date.now() }) {
  if (state.active) return state;
  const active = { dogId, contextId, targetSec: normalizeTarget(targetSec), startedAt: now };
  // A planned easy session (started with the easy suggestion) – see suggestion.js.
  if (easy === true && active.targetSec) active.easy = true;
  return { ...state, active };
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
  const { dogId, contextId, startedAt, targetSec = null, easy } = state.active;
  const pending = {
    dogId,
    contextId,
    startedAt,
    endedAt: now,
    durationSec: elapsedSeconds(state.active, now), // actual duration
    targetSec,
  };
  if (easy === true) pending.easy = true;
  return { ...state, active: null, pending };
}

export function recordResult(state, result, { returnCheck = null } = {}) {
  if (!state.pending) return state;
  if (!Object.values(RESULTS).includes(result)) {
    throw new Error(`Unknown result: ${result}`);
  }
  const session = { id: makeId(state.pending.startedAt), ...state.pending, result };
  if (returnCheck && resultForReturn(returnCheck) === result) session.returnCheck = returnCheck;
  return { ...state, pending: null, sessions: [...state.sessions, session] };
}

export function discardPending(state) {
  return { ...state, pending: null };
}

// Optional session fields (older sessions simply don't have them):
// - anxietyOnsetSec: roughly when the dog started to get worried, in seconds from the start.
//   Only for "didn't go well". Missing/null = unknown (never treated as 0).
// - uncertain: true = "special circumstance" (e.g. a vacuum outside). For both results; the
//   name is kept from the earlier "don't count as progress" mark so old data still works.

// Edit a saved session. Only these fields can change; invalid values are ignored.
export function updateSession(state, id, changes) {
  const patch = {};
  if (Object.values(RESULTS).includes(changes.result)) patch.result = changes.result;
  if (Number.isFinite(changes.durationSec) && changes.durationSec >= 0) {
    patch.durationSec = Math.round(changes.durationSec);
  }
  if ('targetSec' in changes) patch.targetSec = normalizeTarget(changes.targetSec);
  if (state.contexts.some((c) => c.id === changes.contextId)) patch.contextId = changes.contextId;
  if ('uncertain' in changes) patch.uncertain = changes.uncertain === true;
  if ('comment' in changes) patch.comment = cleanComment(changes.comment);
  return {
    ...state,
    sessions: state.sessions.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, ...patch };
      // The result was changed by hand: "judged on return" no longer describes it.
      if (next.returnCheck && resultForReturn(next.returnCheck) !== next.result) delete next.returnCheck;
      if ('durationSec' in patch) next.endedAt = next.startedAt + next.durationSec * 1000;
      if ('anxietyOnsetSec' in changes) {
        if (changes.anxietyOnsetSec == null) next.anxietyOnsetSec = null;
        else if (isValidOnset(changes.anxietyOnsetSec, next.durationSec)) {
          next.anxietyOnsetSec = Math.round(changes.anxietyOnsetSec);
        }
      }
      // Keep the data consistent after other edits.
      if (next.result === RESULTS.GOOD) {
        if (next.anxietyOnsetSec != null) next.anxietyOnsetSec = null;
      } else {
        if (next.anxietyOnsetSec != null && !isValidOnset(next.anxietyOnsetSec, next.durationSec)) {
          next.anxietyOnsetSec = null;
        }
      }
      return next;
    }),
  };
}

// Worry cannot start before the session or after it ended.
export function isValidOnset(sec, durationSec) {
  return Number.isFinite(sec) && sec >= 0 && sec <= durationSec;
}

export function setAnxietyOnset(state, id, sec) {
  return updateSession(state, id, { anxietyOnsetSec: sec });
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
