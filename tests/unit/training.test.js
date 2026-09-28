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
    { id: undefined, ...where, startedAt: 1_000_000, endedAt: 1_095_400, durationSec: 95, result: 'good' },
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
