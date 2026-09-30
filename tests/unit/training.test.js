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
import { suggestTarget, KINDS } from '../../src/suggestion.js';

const DAY = 24 * 3600 * 1000;

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

test('suggestions are independent per context (no borrowing between contexts)', () => {
  const T0 = 100 * DAY;
  let s = createInitialState();
  for (const day of [0, 1, 2]) {
    s = runSession(s, 'home', 1200, 'good', { start: T0 + day * DAY });        // 20 min Home
    s = runSession(s, 'car', 300, 'good', { start: T0 + day * DAY + 3600e3 }); // 5 min Car
  }
  s = runSession(s, 'outside-shop', 120, 'bad', { start: T0 + 2 * DAY + 7200e3, });
  const now = T0 + 3 * DAY;
  const next = (st, ctx) => suggestTarget(sessionsFor(st, { dogId: 'charlie', contextId: ctx }), { now });
  assert.equal(next(s, 'home').sec, 1320);
  assert.equal(next(s, 'car').sec, 330);
  assert.equal(next(s, 'outside-shop').kind, KINDS.HARD_CHOOSE); // no data borrowed from Home/Car

  // A hard Car session changes Car only.
  s = runSession(s, 'car', 300, 'bad', { start: T0 + 2 * DAY + 9000e3 });
  assert.equal(next(s, 'home').sec, 1320);
  assert.equal(next(s, 'car').kind, KINDS.HARD_CHOOSE);
  assert.equal(next(s, 'outside-shop').kind, KINDS.HARD_CHOOSE);
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

// ---------- v0.3: edit / delete ----------
import { updateSession, deleteSession } from '../../src/training.js';

function twoSessions() {
  let s = runSession(createInitialState(), 'home', 120, 'good', { targetSec: 120, start: 1000 });
  return runSession(s, 'home', 60, 'bad', { start: 5_000_000 });
}

test('edit a session: result, duration, target and place', () => {
  const s = twoSessions();
  const id = s.sessions[0].id;
  const e = updateSession(s, id, { result: 'bad', durationSec: 150, targetSec: null, contextId: 'car' });
  const edited = e.sessions.find((x) => x.id === id);
  assert.equal(edited.result, 'bad');
  assert.equal(edited.durationSec, 150);
  assert.equal(edited.endedAt, edited.startedAt + 150_000);
  assert.equal(edited.targetSec, null);
  assert.equal(edited.contextId, 'car');
  assert.deepEqual(e.sessions[1], s.sessions[1]); // other session untouched
});

test('edit ignores invalid values and unknown fields', () => {
  const s = twoSessions();
  const id = s.sessions[0].id;
  const e = updateSession(s, id, { result: 'meh', durationSec: -5, contextId: 'moon', startedAt: 0, id: 'x' });
  assert.deepEqual(e.sessions[0], s.sessions[0]);
});

test('edit and delete recalculate the suggestion', () => {
  const s = twoSessions(); // 2 min good, then 1 min didn't go well (same day)
  const home = (st) => suggestTarget(sessionsFor(st, { dogId: 'charlie', contextId: 'home' }), { now: 6_000_000 });
  assert.equal(home(s).kind, KINDS.HARD_CHOOSE);
  const withOnset = setAnxietyOnset(s, s.sessions[1].id, 30);
  assert.equal(home(withOnset).sec, 24);
  const asGood = updateSession(s, s.sessions[1].id, { result: 'good' });
  assert.equal(home(asGood).kind, KINDS.LIMITED); // one day only → no raise
  assert.equal(home(asGood).sec, 60); // 2 min and 1 min: 1 min is supported by both
  const deleted = deleteSession(s, s.sessions[1].id);
  assert.equal(home(deleted).kind, KINDS.LIMITED); // only the 2 min session is left
  assert.equal(home(deleted).sec, 120);
  // Computing a suggestion never rewrites the stored sessions.
  const before = JSON.stringify(s);
  home(s);
  assert.equal(JSON.stringify(s), before);
});

// ---------- v0.4: time until worry, "don't count" ----------
import { setAnxietyOnset, isValidOnset } from '../../src/training.js';

test('time until worry is stored separately from the end time and validated', () => {
  const s = twoSessions();
  const id = s.sessions[1].id; // 60 s, didn't go well
  assert.equal(s.sessions[1].anxietyOnsetSec, undefined); // older sessions: simply missing = unknown
  const set = setAnxietyOnset(s, id, 30);
  assert.equal(set.sessions[1].anxietyOnsetSec, 30);
  assert.equal(set.sessions[1].durationSec, 60);
  assert.equal(set.sessions[1].endedAt, s.sessions[1].endedAt);
  assert.equal(setAnxietyOnset(s, id, 0).sessions[1].anxietyOnsetSec, 0); // right away is valid
  assert.equal(setAnxietyOnset(s, id, 61).sessions[1].anxietyOnsetSec, undefined); // after the end: rejected
  assert.equal(setAnxietyOnset(s, id, -1).sessions[1].anxietyOnsetSec, undefined); // negative: rejected
  assert.equal(setAnxietyOnset(set, id, null).sessions[1].anxietyOnsetSec, null); // back to unknown
  assert.equal(isValidOnset(60, 60), true);
});

test('editing keeps worry time consistent with duration and result', () => {
  const base = twoSessions();
  const s = setAnxietyOnset(base, base.sessions[1].id, 50);
  const id = s.sessions[1].id;
  assert.equal(updateSession(s, id, { durationSec: 40 }).sessions[1].anxietyOnsetSec, null); // now after the end
  assert.equal(updateSession(s, id, { durationSec: 90 }).sessions[1].anxietyOnsetSec, 50);
  assert.equal(updateSession(s, id, { result: 'good' }).sessions[1].anxietyOnsetSec, null);
});

test('"don\'t count" flag only applies to sessions that went well', () => {
  const s = twoSessions();
  const e = updateSession(s, s.sessions[0].id, { uncertain: true });
  assert.equal(e.sessions[0].uncertain, true);
  assert.equal(updateSession(e, s.sessions[0].id, { uncertain: false }).sessions[0].uncertain, false);
  assert.notEqual(updateSession(s, s.sessions[1].id, { uncertain: true }).sessions[1].uncertain, true);
});

test('reaching the target never sets the result by itself', () => {
  let s = startSession(createInitialState(), { dogId: 'charlie', contextId: 'home', targetSec: 60, now: 0 });
  s = endSession(s, 120_000);
  assert.equal(s.pending.result, undefined);
  assert.equal(s.sessions.length, 0);
});

test('delete removes only that session', () => {
  const s = twoSessions();
  const d = deleteSession(s, s.sessions[0].id);
  assert.equal(d.sessions.length, 1);
  assert.equal(d.sessions[0].id, s.sessions[1].id);
  assert.equal(deleteSession(s, 'nope').sessions.length, 2);
});

// ---------- v0.6: renaming places ----------
import { renameContexts, validateContextNames, cleanContextName, MAX_CONTEXT_NAME } from '../../src/training.js';

const names = (home, car, shop) => ({ home, car, 'outside-shop': shop });

test('renaming changes only labels; ids, sessions and suggestions stay the same', () => {
  const T0 = 200 * DAY;
  let s = createInitialState();
  for (const d of [0, 1, 2]) {
    s = runSession(s, 'car', 300, 'good', { start: T0 + d * DAY });
    s = runSession(s, 'home', 60, 'good', { start: T0 + d * DAY + 3600e3 });
  }
  s = runSession(s, 'outside-shop', 40, 'bad', { start: T0 + 2 * DAY + 7200e3 });
  const now = T0 + 3 * DAY;
  const next = (st, ctx) => suggestTarget(sessionsFor(st, { dogId: 'charlie', contextId: ctx }), { now });
  const before = ['home', 'car', 'outside-shop'].map((c) => next(s, c));

  const r = renameContexts(s, names('Sovrummet', 'Bilburen', 'Hela lägenheten'));
  assert.deepEqual(r.contexts.map((c) => c.id), ['home', 'car', 'outside-shop']);
  assert.deepEqual(r.contexts.map((c) => c.name), ['Sovrummet', 'Bilburen', 'Hela lägenheten']);
  assert.equal(r.sessions, s.sessions); // not copied, moved or changed
  assert.deepEqual(['home', 'car', 'outside-shop'].map((c) => next(r, c)), before);
  assert.equal(sessionsFor(r, { dogId: 'charlie', contextId: 'car' }).length, 3);

  // A new session in the renamed place joins the old ones.
  const more = runSession(r, 'car', 330, 'good', { start: now });
  assert.equal(sessionsFor(more, { dogId: 'charlie', contextId: 'car' }).length, 4);
});

test('names are trimmed; empty, duplicate and too long names are rejected with a message', () => {
  const s = createInitialState();
  assert.equal(validateContextNames(s, names('  Sovrummet ', 'Bilburen', 'Butiken')), null);
  assert.equal(renameContexts(s, names('  Sovrummet ', 'Bilburen', 'Butiken')).contexts[0].name, 'Sovrummet');
  assert.equal(validateContextNames(s, names('   ', 'Bilburen', 'Butiken')), 'empty');
  assert.equal(validateContextNames(s, names('Bilen', ' bilen', 'Butiken')), 'duplicate');
  assert.equal(validateContextNames(s, names('Å'.repeat(MAX_CONTEXT_NAME + 1), 'B', 'C')), 'tooLong');
  assert.equal(validateContextNames(s, names('Å'.repeat(MAX_CONTEXT_NAME), 'B', 'C')), null);
  // Invalid names never change the state.
  assert.equal(renameContexts(s, names('', 'B', 'C')), s);
});

test('Swedish characters work, also when typed as decomposed letters', () => {
  const s = renameContexts(createInitialState(), names('Hallen', 'Bilen', 'Utanför affären'));
  assert.equal(s.contexts[2].name, 'Utanför affären');
  assert.equal(cleanContextName('a\u030Ar'), 'år'); // å typed as a + ring → one character
  assert.equal(validateContextNames(s, names('år', 'a\u030Ar', 'x')), 'duplicate');
});

test('renaming during a running session does not touch the timer or the session\'s place', () => {
  let s = selectContext(createInitialState(), 'car');
  s = startSession(s, { dogId: 'charlie', contextId: 'car', targetSec: 60, now: 1000 });
  const r = renameContexts(s, names('Home', 'Bilburen', 'Outside shop'));
  assert.deepEqual(r.active, s.active);
  assert.equal(elapsedSeconds(r.active, 61_000), 60);
  const done = recordResult(endSession(r, 61_000), 'good');
  assert.equal(done.sessions[0].contextId, 'car');
});

// ---------- v0.7: dog name, comments, first start ----------
import {
  renameDog, validateDogName, cleanComment, setPendingComment, completeOnboarding, MAX_COMMENT,
} from '../../src/training.js';

test('dog name: only the label changes; id, sessions and suggestions stay', () => {
  let s = runSession(createInitialState(), 'home', 60, 'good', { start: 5 * DAY });
  s = runSession(s, 'home', 60, 'good', { start: 6 * DAY });
  const before = suggestTarget(sessionsFor(s, { dogId: 'charlie', contextId: 'home' }), { now: 7 * DAY });
  const r = renameDog(s, '  Majken ');
  assert.equal(r.dogs[0].id, 'charlie');
  assert.equal(r.dogs[0].name, 'Majken');
  assert.equal(r.sessions, s.sessions);
  assert.deepEqual(suggestTarget(sessionsFor(r, { dogId: 'charlie', contextId: 'home' }), { now: 7 * DAY }), before);
  assert.equal(validateDogName('   '), 'empty');
  assert.equal(validateDogName('Ö'.repeat(31)), 'tooLong');
  assert.equal(validateDogName('Ö'.repeat(30)), null);
  assert.equal(renameDog(s, ''), s);
});

test('comments: optional, cleaned, saved with the result, editable and removable', () => {
  assert.equal(cleanComment('  '), null);
  assert.equal(cleanComment('a\r\nb\rc'), 'a\nb\nc');
  assert.equal(cleanComment('x'.repeat(MAX_COMMENT + 50)).length, MAX_COMMENT);
  assert.equal(cleanComment(42), null);

  // Without a comment.
  let s = runSession(createInitialState(), 'home', 30, 'good', { start: 0 });
  assert.equal(s.sessions[0].comment, undefined);
  // With a comment, and with comment + worry time.
  s = startSession(s, { dogId: 'charlie', contextId: 'home', now: 100_000 });
  s = setPendingComment(endSession(s, 190_000), '  Grannhunden skällde ');
  s = recordResult(s, 'bad');
  s = setAnxietyOnset(s, s.sessions[1].id, 40);
  assert.equal(s.sessions[1].comment, 'Grannhunden skällde');
  assert.equal(s.sessions[1].anxietyOnsetSec, 40);

  const sug = (st) => suggestTarget(sessionsFor(st, { dogId: 'charlie', contextId: 'home' }), { now: 200_000 });
  const before = sug(s);
  const edited = updateSession(s, s.sessions[1].id, { comment: 'Gick bra egentligen, 10 minuter!' });
  assert.equal(edited.sessions[1].comment, 'Gick bra egentligen, 10 minuter!');
  assert.equal(edited.sessions[1].result, 'bad'); // a comment never changes the result...
  assert.deepEqual(sug(edited), before); // ...or the suggestion
  const removed = updateSession(edited, s.sessions[1].id, { comment: '' });
  assert.equal(removed.sessions[1].comment, null);
  assert.deepEqual(sug(removed), before);
});

test('first start: language, dog name and default place names in that language', () => {
  const s = completeOnboarding(createInitialState(), {
    lang: 'sv', dogName: 'Majken', placeNames: { home: 'Hemma', car: 'Bilen', 'outside-shop': 'Utanför affären' },
  });
  assert.equal(s.onboarded, true);
  assert.equal(s.lang, 'sv');
  assert.equal(s.dogs[0].name, 'Majken');
  assert.deepEqual(s.contexts.map((c) => [c.id, c.name]), [['home', 'Hemma'], ['car', 'Bilen'], ['outside-shop', 'Utanför affären']]);
});
