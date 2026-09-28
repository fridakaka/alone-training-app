// Saves and loads app data on the phone (browser localStorage).
// Everything else in the app talks to storage only through this file,
// so swapping in a cloud database later means changing just this module.
//
// v0.2 saves under a NEW key. The v0.1 key is only ever read, never written or
// deleted, so the original data always stays on the phone as a backup.

import { createInitialState, DEFAULT_CONTEXTS, SCHEMA_VERSION } from './training.js';

export const KEY = 'alone-training:v2';
export const V1_KEY = 'alone-training:v1';

export function loadState(storage = globalThis.localStorage) {
  let raw = null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return createInitialState();
  }

  if (raw) {
    const data = parse(raw);
    if (data && data.schemaVersion === SCHEMA_VERSION && Array.isArray(data.sessions)) {
      return normalizeV2(data);
    }
    // Unreadable v2 data: keep a copy aside instead of overwriting it later.
    try {
      storage.setItem(`alone-training:corrupt-${Date.now()}`, raw);
    } catch {}
  }

  return migrateFromV1(storage);
}

export function saveState(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// Reads v0.1 data (if any) and returns it in the v0.2 shape.
// Does not write anything; the caller saves under the new key on the next change.
export function migrateFromV1(storage = globalThis.localStorage) {
  let old = null;
  try {
    old = parse(storage.getItem(V1_KEY));
  } catch {}
  const fresh = createInitialState();
  if (!old || old.schemaVersion !== 1 || !Array.isArray(old.sessions)) return fresh;

  const toV2 = (s) => (s ? { ...s, contextId: s.contextId || 'home', targetSec: s.targetSec ?? null } : null);
  return normalizeV2({
    ...fresh,
    dogs: Array.isArray(old.dogs) && old.dogs.length ? old.dogs : fresh.dogs,
    sessions: old.sessions.map(toV2),
    active: toV2(old.active),
    pending: toV2(old.pending),
  });
}

// Makes sure all three contexts exist and the selected one is valid.
function normalizeV2(data) {
  const fresh = createInitialState();
  const contexts = [...(Array.isArray(data.contexts) ? data.contexts : [])];
  for (const c of DEFAULT_CONTEXTS) {
    if (!contexts.some((x) => x.id === c.id)) contexts.push({ ...c });
  }
  const state = { ...fresh, ...data, schemaVersion: SCHEMA_VERSION, contexts };
  if (!contexts.some((c) => c.id === state.selectedContextId)) state.selectedContextId = 'home';
  return state;
}

function parse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
