import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState, KEY, V1_KEY } from '../../src/store.js';
import { sessionsFor } from '../../src/training.js';
import { suggestNext } from '../../src/progression.js';

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

// Exactly the shape v0.1 wrote to the phone.
const V1_DATA = {
  schemaVersion: 1,
  dogs: [{ id: 'charlie', name: 'Charlie' }],
  contexts: [{ id: 'home', name: 'Home' }],
  active: null,
  pending: null,
  sessions: [
    { id: 'a', dogId: 'charlie', contextId: 'home', startedAt: 1000, endedAt: 61000, durationSec: 60, result: 'good' },
    { id: 'b', dogId: 'charlie', contextId: 'home', startedAt: 2000, endedAt: 92000, durationSec: 90, result: 'bad' },
    { id: 'c', dogId: 'charlie', contextId: 'home', startedAt: 3000, endedAt: 243000, durationSec: 240, result: 'good' },
  ],
};

test('v0.1 sessions are migrated to Home with all fields intact', () => {
  const store = memoryStorage({ [V1_KEY]: JSON.stringify(V1_DATA) });
  const s = loadState(store);
  assert.equal(s.schemaVersion, 2);
  assert.equal(s.sessions.length, 3);
  for (const [i, old] of V1_DATA.sessions.entries()) {
    assert.deepEqual(s.sessions[i], { ...old, contextId: 'home', targetSec: null });
  }
  assert.deepEqual(s.contexts.map((c) => c.id), ['home', 'car', 'outside-shop']);
  assert.equal(s.selectedContextId, 'home');
  // Old data immediately drives the Home suggestion, other contexts start empty.
  assert.equal(suggestNext(sessionsFor(s, { dogId: 'charlie', contextId: 'home' })), 270);
  assert.equal(suggestNext(sessionsFor(s, { dogId: 'charlie', contextId: 'car' })), null);
});

test('v0.1 sessions without a contextId still land in Home', () => {
  const data = { ...V1_DATA, sessions: V1_DATA.sessions.map(({ contextId, ...rest }) => rest) };
  const s = loadState(memoryStorage({ [V1_KEY]: JSON.stringify(data) }));
  assert.ok(s.sessions.every((x) => x.contextId === 'home'));
});

test('the v0.1 data is never modified or deleted', () => {
  const original = JSON.stringify(V1_DATA);
  const store = memoryStorage({ [V1_KEY]: original });
  const s = loadState(store);
  saveState({ ...s, sessions: [] }, store);
  assert.equal(store.getItem(V1_KEY), original);
});

test('after migration the v2 data is used, not re-migrated', () => {
  const store = memoryStorage({ [V1_KEY]: JSON.stringify(V1_DATA) });
  const s = loadState(store);
  const extra = { ...s.sessions[0], id: 'new', contextId: 'car', targetSec: 30 };
  saveState({ ...s, sessions: [...s.sessions, extra] }, store);
  const again = loadState(store);
  assert.equal(again.sessions.length, 4);
  assert.equal(again.sessions[3].contextId, 'car');
});

test('a session running in v0.1 continues after the update, in Home', () => {
  const store = memoryStorage({
    [V1_KEY]: JSON.stringify({ ...V1_DATA, active: { dogId: 'charlie', contextId: 'home', startedAt: 5000 } }),
  });
  const s = loadState(store);
  assert.deepEqual(s.active, { dogId: 'charlie', contextId: 'home', startedAt: 5000, targetSec: null });
});

test('an unrated v0.1 session can still be rated after the update', () => {
  const pending = { dogId: 'charlie', contextId: 'home', startedAt: 5000, endedAt: 8000, durationSec: 3 };
  const s = loadState(memoryStorage({ [V1_KEY]: JSON.stringify({ ...V1_DATA, pending }) }));
  assert.deepEqual(s.pending, { ...pending, targetSec: null });
});

test('corrupt v2 data is kept aside and v0.1 data is used instead', () => {
  const store = memoryStorage({ [V1_KEY]: JSON.stringify(V1_DATA), [KEY]: '{broken' });
  const s = loadState(store);
  assert.equal(s.sessions.length, 3);
  const backups = [...store.map.keys()].filter((k) => k.startsWith('alone-training:corrupt-'));
  assert.equal(backups.length, 1);
  assert.equal(store.getItem(backups[0]), '{broken');
});

test('no data at all gives a fresh state with three contexts', () => {
  const s = loadState(memoryStorage());
  assert.equal(s.sessions.length, 0);
  assert.equal(s.contexts.length, 3);
});
