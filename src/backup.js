// Backup, restore and Excel export. Pure functions: no DOM, no storage.
// Restoring MERGES: sessions already on the phone are never removed or changed.

import {
  RESULTS, DEFAULT_CONTEXTS, cleanContextName, validateContextNames, validateDogName, cleanComment, cleanPrepDone,
  MAX_DOGS, dogNameTaken,
} from './training.js';
import { LANGS } from './i18n.js';

export const BACKUP_APP = 'alone-time';

export function buildBackup(state, now = Date.now()) {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      exportedAt: new Date(now).toISOString(),
      schemaVersion: state.schemaVersion,
      dogs: state.dogs, // up to 3 (v0.18), each with its own "Start here" ticks (prepDone)
      lang: state.lang ?? null,
      contexts: state.contexts,
      sessions: state.sessions,
      prepDone: cleanPrepDone(state.dogs[0]?.prepDone), // the first dog's ticks, for older app versions
    },
    null,
    2,
  );
}

// Accepts a v0.2+ backup file or raw v0.1 / v0.2 app data.
// Returns { sessions, contextNames } with only valid sessions, or throws a readable Error.
// contextNames is { [contextId]: name } from the file, or null if it has none (older backups).
// Restoring never applies these names by itself – see nameChanges().
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw notBackup();
  }
  if (!data || !Array.isArray(data.sessions)) {
    throw notBackup();
  }
  const sessions = data.sessions.filter(isValidSession).map((s) => ({
    id: String(s.id),
    dogId: s.dogId || 'charlie',
    contextId: s.contextId || 'home', // v0.1 sessions were all at Home
    startedAt: s.startedAt,
    endedAt: Number.isFinite(s.endedAt) ? s.endedAt : s.startedAt + s.durationSec * 1000,
    durationSec: Math.round(s.durationSec),
    targetSec: Number.isFinite(s.targetSec) && s.targetSec > 0 ? Math.round(s.targetSec) : null,
    result: s.result,
    // Added in v0.4. Missing in older backups = unknown / counted.
    anxietyOnsetSec:
      s.result === RESULTS.BAD && Number.isFinite(s.anxietyOnsetSec) && s.anxietyOnsetSec >= 0 &&
      s.anxietyOnsetSec <= s.durationSec
        ? Math.round(s.anxietyOnsetSec)
        : null,
    uncertain: s.uncertain === true, // special circumstance (both results since v0.15)
    ...(s.easy === true && s.targetSec > 0 ? { easy: true } : {}), // planned easy session (v0.17)
    // "Don't know" → judged on return (v0.19): only when it matches the result.
    ...((s.returnCheck === 'calm' && s.result === RESULTS.GOOD) || (s.returnCheck === 'unsettled' && s.result === RESULTS.BAD) ? { returnCheck: s.returnCheck } : {}),
    // Added in v0.7. Missing = no comment.
    comment: cleanComment(s.comment),
  }));
  const dogs = readDogs(data);
  return {
    sessions,
    contextNames: readContextNames(data.contexts),
    // The dogs in the backup ([] for the oldest backups – then nothing changes).
    dogs,
    // The first dog's name (null when the backup has none).
    dogName: dogs[0]?.name ?? null,
    lang: LANGS.includes(data.lang) ? data.lang : null,
    prepDone: dogs[0]?.prepDone ?? cleanPrepDone(data.prepDone), // the first dog's ticks
  };
}

// [{ id, name, prepDone }] – valid entries only, at most MAX_DOGS. Before v0.18 there was one
// dog with the app-wide ticks in data.prepDone.
function readDogs(data) {
  const out = [];
  for (const [i, d] of (Array.isArray(data.dogs) ? data.dogs : []).entries()) {
    if (out.length >= MAX_DOGS) break;
    const id = d?.id ? String(d.id) : i === 0 ? 'charlie' : null;
    if (!id || out.some((x) => x.id === id)) continue;
    if (typeof d.name !== 'string' || validateDogName(d.name)) continue;
    const prep = Array.isArray(d.prepDone) ? d.prepDone : i === 0 ? data.prepDone : [];
    out.push({ id, name: cleanContextName(d.name), prepDone: cleanPrepDone(prep) });
  }
  return out;
}

function notBackup() {
  const err = new Error("This file isn't a backup from this app.");
  err.code = 'not-backup';
  return err;
}

// Everything in the backup's settings that differs from the phone:
// [{ kind: 'dog' | 'lang' | 'place', id?, current, fromBackup }].
// Missing settings in the backup are never reported and never applied.
export function settingsChanges(state, parsed) {
  const out = [];
  for (const d of parsed?.dogs ?? []) {
    const mine = state.dogs.find((x) => x.id === d.id);
    if (mine && mine.name !== d.name) out.push({ kind: 'dog', id: d.id, current: mine.name, fromBackup: d.name });
  }
  if (parsed?.lang && state.lang && parsed.lang !== state.lang) {
    out.push({ kind: 'lang', current: state.lang, fromBackup: parsed.lang });
  }
  for (const c of nameChanges(state, parsed?.contextNames)) out.push({ kind: 'place', ...c });
  return out;
}

function readContextNames(contexts) {
  if (!Array.isArray(contexts)) return null;
  const names = {};
  for (const c of DEFAULT_CONTEXTS) {
    const raw = contexts.find((x) => x && x.id === c.id)?.name;
    const name = typeof raw === 'string' ? cleanContextName(raw) : '';
    if (!name) return null; // incomplete: treat as "no names in this backup"
    names[c.id] = name;
  }
  return names;
}

// Places whose name in the backup differs from the name on the phone:
// [{ id, current, fromBackup }]. Empty if the backup has no names or the same names.
export function nameChanges(state, contextNames) {
  if (!contextNames || validateContextNames(state, contextNames)) return [];
  return state.contexts
    .filter((c) => contextNames[c.id] !== c.name)
    .map((c) => ({ id: c.id, current: c.name, fromBackup: contextNames[c.id] }));
}

function isValidSession(s) {
  return (
    s &&
    s.id != null &&
    Number.isFinite(s.startedAt) &&
    Number.isFinite(s.durationSec) &&
    s.durationSec >= 0 &&
    Object.values(RESULTS).includes(s.result)
  );
}

// Dogs in the backup that are not on this phone and would be added (room for MAX_DOGS):
// { add: [{ id, name }], noRoom: [{ id, name }] }. A name already used here gets a number.
export function dogsToAdd(state, parsed) {
  const add = [];
  const noRoom = [];
  const used = { ...state, dogs: [...state.dogs] };
  for (const d of parsed?.dogs ?? []) {
    if (used.dogs.some((x) => x.id === d.id)) continue;
    if (!parsed.sessions.some((s) => s.dogId === d.id)) continue; // only dogs that have sessions
    if (used.dogs.length >= MAX_DOGS) {
      noRoom.push({ id: d.id, name: d.name });
      continue;
    }
    let name = d.name;
    for (let n = 2; dogNameTaken(used, name); n++) name = `${d.name} ${n}`;
    const dog = { id: d.id, name, prepDone: d.prepDone ?? [] };
    used.dogs.push(dog);
    add.push(dog);
  }
  return { add, noRoom };
}

// Adds sessions whose id isn't already present. Unknown contexts go to Home. Dogs from the backup
// that aren't on this phone are added (up to 3); sessions of a dog there is no room for are
// skipped. Sessions without a known dog (oldest backups) belong to the first dog.
export function mergeSessions(state, incoming, parsed = null) {
  const have = new Set(state.sessions.map((s) => s.id));
  const known = new Set(state.contexts.map((c) => c.id));
  const { add } = dogsToAdd(state, parsed ?? { dogs: [], sessions: incoming });
  const dogs = [...state.dogs, ...add];
  const dogIds = new Set(dogs.map((d) => d.id));
  const backupDogIds = new Set((parsed?.dogs ?? []).map((d) => d.id));
  const fresh = incoming.filter((s) => !have.has(s.id));
  const added = fresh
    // A dog named in the backup but not added (no room): its sessions are left out.
    .filter((s) => dogIds.has(s.dogId) || !backupDogIds.has(s.dogId))
    .map((s) => ({ ...s, dogId: dogIds.has(s.dogId) ? s.dogId : dogs[0].id }))
    .map((s) => (known.has(s.contextId) ? s : { ...s, contextId: 'home' }));
  return {
    state: { ...state, dogs, sessions: [...state.sessions, ...added] },
    added: added.length,
    skipped: incoming.length - added.length,
    dogsAdded: add.map((d) => d.name),
  };
}

// Semicolon-separated so it opens in columns in Excel (also with Swedish settings).
export function buildCsv(state) {
  const name = (id) => state.contexts.find((c) => c.id === id)?.name ?? id;
  const dogName = (id) => state.dogs.find((d) => d.id === id)?.name ?? id;
  const pad = (n) => String(n).padStart(2, '0');
  const mmss = (sec) => (sec == null ? '' : `${Math.floor(sec / 60)}:${pad(sec % 60)}`);
  const rows = [...state.sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => {
      const d = new Date(s.startedAt);
      return [
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        dogName(s.dogId),
        name(s.contextId),
        s.durationSec,
        mmss(s.durationSec),
        s.targetSec ?? '',
        mmss(s.targetSec),
        s.result === RESULTS.GOOD ? 'Went well' : "Didn't go well",
        s.anxietyOnsetSec ?? '',
        mmss(s.anxietyOnsetSec),
        s.uncertain ? 'Yes' : '',
        s.easy ? 'Yes' : '',
        s.returnCheck === 'calm' ? 'Calm' : s.returnCheck === 'unsettled' ? 'Excited' : '',
        s.contextId, // stable id: stays the same when a place is renamed
        s.comment ?? '',
      ];
    });
  const header = [
    'Date', 'Time', 'Dog', 'Place', 'Actual (s)', 'Actual', 'Target (s)', 'Target', 'Result',
    'Worried after (s)', 'Worried after', 'Special circumstance', 'Easy session', 'On return', 'Place ID', 'Comment',
  ];
  return ['sep=;', ...[header, ...rows].map((r) => r.map(csvCell).join(';'))].join('\r\n') + '\r\n';
}

// Text that starts like a formula (= + - @, or tab / CR) is prefixed with ' so that Excel
// shows it as text instead of running it. Numbers are written as numbers and never start
// with these characters. Cells with ; " or line breaks are quoted, with "" for quotes.
function csvCell(v) {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function backupFileName(ext, now = Date.now()) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `alone-time-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`;
}

// What an import would do, for the review shown BEFORE anything changes.
export function importSummary(state, parsed) {
  const have = new Set(state.sessions.map((s) => s.id));
  const fresh = parsed.sessions.filter((s) => !have.has(s.id));
  const times = fresh.map((s) => s.startedAt).sort((a, b) => a - b);
  return {
    newCount: fresh.length,
    existingCount: parsed.sessions.length - fresh.length,
    firstAt: times[0] ?? null,
    lastAt: times[times.length - 1] ?? null,
    commentCount: fresh.filter((s) => s.comment).length,
    changes: settingsChanges(state, parsed),
    ...(({ add, noRoom }) => ({ newDogs: add.map((d) => d.name), noRoomDogs: noRoom.map((d) => d.name) }))(dogsToAdd(state, parsed)),
  };
}
