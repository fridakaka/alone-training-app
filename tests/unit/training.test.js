import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, startSession, endSession, recordResult, discardPending,
  elapsedSeconds, sessionsFor, formatTimer, formatDuration, RESULTS,
} from '../../src/training.js';

const where = { dogId: 'charlie', contextId: 'home' };

test('initial state has Charlie at Home and no sessions', () => {
  const s = createInitialState();
  assert.equal(s.dogs[0].name, 'Charlie');
  assert.equal(s.contexts[0].name, 'Home');
  assert.deepEqual(s.sessions, []);
  assert.equal(s.active, null);
});

test('full loop: start, end, rate saves date, duration and result', () => {
  let s = createInitialState();
  s = startSession(s, { ...where, now: 1_000_000 });
  assert.equal(s.active.startedAt, 1_000_000);
  s = endSession(s, 1_000_000 + 95_400);
  assert.equal(s.active, null);
  assert.equal(s.pending.durationSec, 95);
  s = recordResult(s, RESULTS.GOOD);
  assert.equal(s.pending, null);
  assert.equal(s.sessions.length, 1);
  assert.deepEqual(
    { ...s.sessions[0], id: undefined },
    { id: undefined, ...where, startedAt: 1_000_000, endedAt: 1_095_400, durationSec: 95, targetSec: null, result: 'good' },
  );
});

test('starting twice keeps the original start time', () => {
  let s = startSession(createInitialState(), { ...where, now: 10 });
  s = startSession(s, { ...where, now: 99 });
  assert.equal(s.active.startedAt, 10);
});

test('discarding a pending session saves nothing', () => {
  let s = startSession(createInitialState(), { ...where, now: 0 });
  s = discardPending(endSession(s, 5000));
  assert.equal(s.pending, null);
  assert.equal(s.sessions.length, 0);
});

test('unknown result is rejected', () => {
  let s = endSession(startSession(createInitialState(), { ...where, now: 0 }), 1000);
  assert.throws(() => recordResult(s, 'meh'));
});

test('elapsed time is based on start timestamp and never negative', () => {
  assert.equal(elapsedSeconds({ startedAt: 0 }, 61_999), 61);
  assert.equal(elapsedSeconds({ startedAt: 5000 }, 0), 0);
  assert.equal(elapsedSeconds(null, 1000), 0);
});

test('sessionsFor filters by dog and context and sorts oldest first', () => {
  const s = {
    ...createInitialState(),
    sessions: [
      { id: 'b', ...where, startedAt: 20 },
      { id: 'x', dogId: 'other', contextId: 'home', startedAt: 5 },
      { id: 'a', ...where, startedAt: 10 },
      { id: 'y', dogId: 'charlie', contextId: 'car', startedAt: 15 },
    ],
  };
  assert.deepEqual(sessionsFor(s, where).map((x) => x.id), ['a', 'b']);
});

test('formatting', () => {
  assert.equal(formatTimer(0), '00:00');
  assert.equal(formatTimer(65), '01:05');
  assert.equal(formatTimer(3725), '1:02:05');
  assert.equal(formatDuration(45), '45 s');
  assert.equal(formatDuration(185), '3 min 05 s');
  assert.equal(formatDuration(3720), '1 h 02 min');
});

// ---------- v0.2 ----------
import { selectContext } from '../../src/training.js';
import { suggestNext } from '../../src/progression.js';

function runSession(state, contextId, seconds, result, { targetSec = null, start = 0 } = {}) {
  let s = selectContext(state, contextId);
  s = startSession(s, { dogId: 'charlie', contextId, targetSec, now: start });
  s = endSession(s, start + seconds * 1000);
  return recordResult(s, result);
}

test('three contexts exist and Home is selected by default', () => {
  const s = createInitialState();
  assert.deepEqual(s.contexts.map((c) => c.name), ['Home', 'Car', 'Outside shop']);
  assert.equal(s.selectedContextId, 'home');
});

test('selecting a context is ignored while training or for unknown ids', () => {
  let s = selectContext(createInitialState(), 'car');
  assert.equal(s.selectedContextId, 'car');
  assert.equal(selectContext(s, 'moon').selectedContextId, 'car');
  s = startSession(s, { dogId: 'charlie', contextId: 'car', now: 0 });
  assert.equal(selectContext(s, 'home').selectedContextId, 'car');
});

test('progression is independent per context', () => {
  let s = createInitialState();
  s = runSession(s, 'home', 1200, 'good', { start: 1 });   // 20 min home
  s = runSession(s, 'car', 300, 'good', { start: 2 });     // 5 min car
  s = runSession(s, 'outside-shop', 120, 'bad', { start: 3 }); // 2 min shop
  const next = (ctx) => suggestNext(sessionsFor(s, { dogId: 'charlie', contextId: ctx }));
  assert.equal(next('home'), 1320);
  assert.equal(next('car'), 330);
  assert.equal(next('outside-shop'), 105);

  // Another good Home session changes Home only.
  s = runSession(s, 'home', 1320, 'good', { start: 4 });
  assert.equal(next('home'), 1440);
  assert.equal(next('car'), 330);
  assert.equal(next('outside-shop'), 105);
});

test('target and actual duration are both stored and can differ', () => {
  const s = runSession(createInitialState(), 'car', 283, 'good', { targetSec: 270 });
  const [saved] = s.sessions;
  assert.equal(saved.targetSec, 270);
  assert.equal(saved.durationSec, 283);
  assert.equal(saved.contextId, 'car');
});

test('manual override: whatever target is chosen is what gets stored', () => {
  const s = runSession(createInitialState(), 'home', 100, 'good', { targetSec: 600 });
  assert.equal(s.sessions[0].targetSec, 600);
});

test('no target is stored as null and the timer does not care about the target', () => {
  let s = runSession(createInitialState(), 'home', 90, 'bad');
  assert.equal(s.sessions[0].targetSec, null);
  s = startSession(s, { dogId: 'charlie', contextId: 'home', targetSec: 10, now: 0 });
  assert.equal(elapsedSeconds(s.active, 60_000), 60); // well past the target, still counting
  assert.equal(s.active.targetSec, 10);
});

test('invalid targets are treated as no target', () => {
  for (const t of [0, -5, NaN, 'abc', undefined]) {
    const s = startSession(createInitialState(), { dogId: 'charlie', contextId: 'home', targetSec: t, now: 0 });
    assert.equal(s.active.targetSec, null);
  }
});
