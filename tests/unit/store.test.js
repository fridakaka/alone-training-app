import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState } from '../../src/store.js';
import { createInitialState, startSession } from '../../src/training.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('empty storage gives initial state', () => {
  assert.deepEqual(loadState(memoryStorage()), createInitialState());
});

test('save then load round-trips, including a running session', () => {
  const store = memoryStorage();
  const s = startSession(createInitialState(), { dogId: 'charlie', contextId: 'home', now: 42 });
  assert.equal(saveState(s, store), true);
  assert.deepEqual(loadState(store), s);
});

test('corrupt data falls back to initial state instead of crashing', () => {
  const store = memoryStorage();
  store.setItem('alone-training:v1', '{not json');
  assert.deepEqual(loadState(store), createInitialState());
});

test('saving reports failure when storage is full/blocked', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(saveState(createInitialState(), broken), false);
});

// ---------- v0.6: place names are stored ----------
import { renameContexts } from '../../src/training.js';

test('renamed places survive save and load; old data keeps the default names', () => {
  const store = memoryStorage();
  const renamed = renameContexts(createInitialState(), { home: 'Sovrummet', car: 'Bilburen', 'outside-shop': 'Hela lägenheten' });
  saveState(renamed, store);
  assert.deepEqual(loadState(store).contexts, renamed.contexts);
  // Data saved before names could change: defaults.
  const old = memoryStorage();
  old.setItem('alone-training:v2', JSON.stringify({ schemaVersion: 2, sessions: [], contexts: [{ id: 'home', name: 'Home' }] }));
  assert.deepEqual(loadState(old).contexts.map((c) => c.name), ['Home', 'Car', 'Outside shop']);
});

test('unusable stored names fall back to the default name', () => {
  const store = memoryStorage();
  store.setItem('alone-training:v2', JSON.stringify({
    schemaVersion: 2, sessions: [],
    contexts: [{ id: 'home', name: '   ' }, { id: 'car', name: 42 }, { id: 'outside-shop', name: 'x'.repeat(99) }],
  }));
  assert.deepEqual(loadState(store).contexts.map((c) => c.name), ['Home', 'Car', 'Outside shop']);
});
