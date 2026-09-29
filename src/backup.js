// Backup, restore and Excel export. Pure functions: no DOM, no storage.
// Restoring MERGES: sessions already on the phone are never removed or changed.

import { RESULTS } from './training.js';

export const BACKUP_APP = 'alone-time';

export function buildBackup(state, now = Date.now()) {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      exportedAt: new Date(now).toISOString(),
      schemaVersion: state.schemaVersion,
      dogs: state.dogs,
      contexts: state.contexts,
      sessions: state.sessions,
    },
    null,
    2,
  );
}

// Accepts a v0.2+ backup file or raw v0.1 / v0.2 app data.
// Returns { sessions } with only valid sessions, or throws a readable Error.
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a backup from this app.");
  }
  if (!data || !Array.isArray(data.sessions)) {
    throw new Error("This file isn't a backup from this app.");
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
  }));
  return { sessions };
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

// Adds sessions whose id isn't already present. Unknown contexts go to Home.
export function mergeSessions(state, incoming) {
  const have = new Set(state.sessions.map((s) => s.id));
  const known = new Set(state.contexts.map((c) => c.id));
  const added = incoming
    .filter((s) => !have.has(s.id))
    .map((s) => (known.has(s.contextId) ? s : { ...s, contextId: 'home' }));
  return {
    state: { ...state, sessions: [...state.sessions, ...added] },
    added: added.length,
    skipped: incoming.length - added.length,
  };
}

// Semicolon-separated so it opens in columns in Excel (also with Swedish settings).
export function buildCsv(state) {
  const name = (id) => state.contexts.find((c) => c.id === id)?.name ?? id;
  const pad = (n) => String(n).padStart(2, '0');
  const mmss = (sec) => (sec == null ? '' : `${Math.floor(sec / 60)}:${pad(sec % 60)}`);
  const rows = [...state.sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => {
      const d = new Date(s.startedAt);
      return [
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        name(s.contextId),
        s.durationSec,
        mmss(s.durationSec),
        s.targetSec ?? '',
        mmss(s.targetSec),
        s.result === RESULTS.GOOD ? 'Went well' : "Didn't go well",
      ];
    });
  const header = ['Date', 'Time', 'Place', 'Actual (s)', 'Actual', 'Target (s)', 'Target', 'Result'];
  return ['sep=;', ...[header, ...rows].map((r) => r.map(csvCell).join(';'))].join('\r\n') + '\r\n';
}

function csvCell(v) {
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function backupFileName(ext, now = Date.now()) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `alone-time-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`;
}
