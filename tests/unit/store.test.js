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

// ---------- v0.7: first start and language ----------
test('a brand-new phone sees the welcome; existing data never does', () => {
  assert.equal(loadState(memoryStorage()).onboarded, false);
  const old = memoryStorage();
  old.setItem('alone-training:v2', JSON.stringify({ schemaVersion: 2, sessions: [], dogs: [{ id: 'charlie', name: 'Charlie' }] }));
  const s = loadState(old);
  assert.equal(s.onboarded, true);
  assert.equal(s.lang, null); // not chosen yet: shown the small optional choice
  assert.equal(s.dogs[0].name, 'Charlie');
  const v1 = memoryStorage();
  v1.setItem('alone-training:v1', JSON.stringify({ schemaVersion: 1, sessions: [] }));
  assert.equal(loadState(v1).onboarded, true);
});

test('language and dog name are saved; unusable values fall back safely', () => {
  const store = memoryStorage();
  saveState({ ...createInitialState(), onboarded: true, lang: 'sv', dogs: [{ id: 'charlie', name: 'Majken' }] }, store);
  const s = loadState(store);
  assert.equal(s.lang, 'sv');
  assert.equal(s.dogs[0].name, 'Majken');
  store.setItem('alone-training:v2', JSON.stringify({ schemaVersion: 2, sessions: [], lang: 'xx', dogs: [{ id: 'charlie', name: '  ' }] }));
  assert.equal(loadState(store).lang, null);
  assert.equal(loadState(store).dogs[0].name, 'Charlie');
});
