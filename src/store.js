// Saves and loads app data on the phone (browser localStorage).
// Everything else in the app talks to storage only through this file,
// so swapping in a cloud database later means changing just this module.

import { createInitialState } from './training.js';

const KEY = 'alone-training:v1';

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return createInitialState();
    const data = JSON.parse(raw);
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.sessions)) {
      return createInitialState();
    }
    // Fill in anything missing from older/partial saves.
    return { ...createInitialState(), ...data };
  } catch {
    return createInitialState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
