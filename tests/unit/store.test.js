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
