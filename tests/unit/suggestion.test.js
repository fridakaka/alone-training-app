// Decision rules of the time suggestion. `now` is injected, so results never depend on today's date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestTarget, establishedLevel, weights, weightedMedian, raiseFrom, KINDS, SUGGESTION_SETTINGS as S,
} from '../../src/suggestion.js';

const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 9, 20, 18, 0).getTime(); // local time, fixed
const at = (daysAgo, hour = 10) => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};
let n = 0;
const good = (daysAgo, sec, extra = {}) => ({ id: `g${n++}`, startedAt: at(daysAgo, extra.hour ?? 10), durationSec: sec, result: 'good', ...extra });
const bad = (daysAgo, sec, extra = {}) => ({ id: `b${n++}`, startedAt: at(daysAgo, extra.hour ?? 10), durationSec: sec, result: 'bad', ...extra });
const suggest = (sessions, now = NOW) => suggestTarget(sessions, { now });

test('settings are named, preliminary and in one place', () => {
  assert.equal(S.WINDOW_DAYS, 7);
  assert.equal(S.MAX_SESSIONS, 5);
  assert.ok(Object.isFrozen(S));
});

// 1
test('repeated similar good sessions over several days → small increase (+10 %, rounded down)', () => {
  const r = suggest([good(4, 300), good(3, 300), good(2, 310), good(1, 300)]);
  assert.equal(r.kind, KINDS.RAISE);
  assert.equal(r.level, 300);
  assert.equal(r.sec, 330);
});

// 2
test('four good 5-min sessions and one good 2-hour session → level stays 5 min, only a small raise', () => {
  const late = suggest([good(5, 300), good(4, 300), good(3, 300), good(2, 300), good(1, 7200)]);
  assert.equal(late.level, 300);
  assert.equal(late.sec, 330); // not ~28 min (the arithmetic mean), not 2 h
  assert.equal(late.repeatSec, null); // 2 h is not offered as "Repeat"
  const early = suggest([good(5, 7200), good(4, 300), good(3, 300), good(2, 300), good(1, 300)]);
  assert.equal(early.level, 300);
  assert.equal(early.sec, 330);
});

test('one long good session contributes support to the level it exceeds, but cannot establish a level alone', () => {
  // 5 min once + 2 h once on different days: the 2 h session supports 5 min → level 5 min.
  assert.equal(suggest([good(2, 300), good(1, 7200)]).level, 300);
  // Only long sessions on one day: nothing established.
  assert.equal(suggest([good(1, 7200, { hour: 9 }), good(1, 7200, { hour: 12 })]).level, null);
});

// 3
test('a good session longer than planned counts with its actual time, not the target', () => {
  const r = suggest([good(2, 420, { targetSec: 300 }), good(1, 420, { targetSec: 300 })]);
  assert.equal(r.level, 420);
  assert.equal(r.sec, 450);
});

// 4
test('a hard session after several good ones stops the raise', () => {
  const r = suggest([good(4, 300), good(3, 300), good(2, 300), bad(1, 300)]);
  assert.equal(r.kind, KINDS.HARD_CHOOSE); // unknown onset, no clearly shorter level → user chooses
  assert.equal(r.sec, null);
  const withOnset = suggest([good(4, 300), good(3, 300), good(2, 300), bad(1, 300, { anxietyOnsetSec: 200 })]);
  assert.equal(withOnset.kind, KINDS.EASIER);
  assert.equal(withOnset.sec, 150); // 80 % of 200 s = 160 s, rounded down to 15 s steps
});

// 5
test('10-min session where worry began after 30 s → suggestion below 30 s, not 9 min', () => {
  const r = suggest([good(4, 600), good(3, 600), bad(1, 600, { anxietyOnsetSec: 30 })]);
  assert.equal(r.kind, KINDS.EASIER);
  assert.ok(r.sec < 30);
  assert.equal(r.sec, 24);
});

// 6
test('hard session with unknown onset: not "end time − 10 %"', () => {
  // No clearly shorter earlier level → the user picks an easy start.
  const none = suggest([good(3, 600), bad(1, 600)]);
  assert.equal(none.kind, KINDS.HARD_CHOOSE);
  assert.equal(none.sec, null);
  // An earlier, clearly shorter level that went well → used cautiously (80 %).
  const shorter = suggest([good(4, 300), good(3, 300), bad(1, 600)]);
  assert.equal(shorter.kind, KINDS.EASIER);
  assert.equal(shorter.sec, 240);
  assert.notEqual(shorter.sec, 540);
});

// 7
test('worry right at the start → no positive target built from older successes', () => {
  for (const onset of [0, 5]) {
    const r = suggest([good(4, 1200), good(3, 1200), good(2, 1200), bad(1, 600, { anxietyOnsetSec: onset })]);
    assert.equal(r.kind, KINDS.WORRIED_AT_ONCE);
    assert.equal(r.sec, null);
  }
});

// 8
test('a long good session followed by two weeks without logged sessions → no old record as target', () => {
  const r = suggest([good(15, 7200)]);
  assert.equal(r.kind, KINDS.RETURN_CHOOSE);
  assert.equal(r.sec, null);
});

test('after a break with an established earlier level → careful return at half of it', () => {
  const history = [good(18, 300), good(17, 300), good(16, 300), good(15, 7200)];
  const r = suggest(history);
  assert.equal(r.kind, KINDS.RETURN);
  assert.equal(r.sec, 150);
  // One new session after the break is not yet enough: still in return mode.
  assert.equal(suggest([...history, good(1, 150)]).kind, KINDS.RETURN);
  // History is only read, never changed.
  assert.equal(history.length, 4);
});

test('a break ending with a hard session → user chooses the restart', () => {
  assert.equal(suggest([good(16, 300), good(15, 300), bad(14, 300)]).kind, KINDS.RETURN_CHOOSE);
});

// 9
test('many sessions on one day are weaker evidence than sessions over several days', () => {
  const sameDay = [9, 10, 11, 12, 13].map((h) => good(1, 300, { hour: h }));
  const r1 = suggest(sameDay);
  assert.equal(r1.level, null);
  assert.equal(r1.kind, KINDS.REPEAT);
  assert.equal(r1.sec, 300);
  const overDays = [5, 4, 3, 2, 1].map((d) => good(d, 300));
  assert.equal(suggest(overDays).kind, KINDS.RAISE);
  // Same-day sessions share one day's weight.
  const w = weights(sameDay);
  assert.ok(w.reduce((a, b) => a + b, 0) < 1);
});

// 10
test('one recent session → too little history; none → no sessions logged', () => {
  const one = suggest([good(1, 300)]);
  assert.equal(one.kind, KINDS.TOO_LITTLE);
  assert.equal(one.sec, null);
  assert.equal(one.repeatSec, 300); // the user can still repeat it with one tap
  const none = suggest([]);
  assert.equal(none.kind, KINDS.NONE);
  assert.equal(none.sec, null);
});

test('window: only the last 5 relevant sessions from the last 7 days count', () => {
  // A 7-day-old-plus session is outside, so these two can't establish a level together.
  assert.equal(suggest([good(8, 300), good(1, 300)]).kind, KINDS.RETURN_CHOOSE);
  // Only the 5 newest: an old hard session 6 sessions back no longer blocks.
  const r = suggest([bad(6, 300), good(5, 300), good(4, 300), good(3, 300), good(2, 300), good(1, 300)]);
  assert.equal(r.kind, KINDS.RAISE);
});

test('recent hard session stays in force until two good sessions of meaningful length follow', () => {
  const base = [good(5, 600), bad(3, 600, { anxietyOnsetSec: 300 })];
  assert.equal(suggest(base).sec, 240);
  assert.equal(suggest([...base, good(2, 240)]).kind, KINDS.EASIER);
  // Very short good repetitions don't cancel the difficulty.
  assert.equal(suggest([...base, good(2, 10), good(1, 10)]).kind, KINDS.EASIER);
  // Two real recovery sessions on two days: the level is re-established from them only.
  const rec = suggest([...base, good(2, 240), good(1, 240)]);
  assert.equal(rec.level, 240); // not the old 10 min
  assert.equal(rec.sec, 255);
});

test('a session marked "don\'t count" is not used as evidence for a raise', () => {
  const r = suggest([good(3, 300), good(2, 300), good(1, 3600, { uncertain: true })]);
  assert.equal(r.level, 300);
  assert.equal(suggest([good(2, 600, { uncertain: true }), good(1, 600, { uncertain: true })]).kind, KINDS.TOO_LITTLE);
});

test('a very short hard session is never ignored', () => {
  const r = suggest([good(3, 300), good(2, 300), bad(1, 2)]);
  assert.notEqual(r.kind, KINDS.RAISE);
});

// 13
test('very short times: raises stay proportional', () => {
  assert.equal(raiseFrom(5), 6);
  assert.equal(raiseFrom(10), 11);
  assert.equal(raiseFrom(30), 35);
  assert.equal(raiseFrom(60), 65);
  assert.equal(raiseFrom(3), 3); // +1 s would be +33 % → keep the level
  for (let l = 5; l < 4 * 3600; l += 3) {
    const up = raiseFrom(l);
    assert.ok(up >= l && up <= l * 1.2 + 1e-9, `${l} → ${up}`);
  }
  assert.equal(suggest([good(3, 10), good(2, 10), good(1, 10)]).sec, 11);
});

test('robust helpers', () => {
  assert.equal(weightedMedian([[300, 1], [300, 1], [300, 1], [300, 1], [7200, 1]]), 300);
  assert.equal(weightedMedian([[10, 1], [20, 3]]), 20);
  const ss = [good(3, 300), good(2, 600), good(1, 7200)];
  assert.equal(establishedLevel(ss, weights(ss)), 600);
});

test('suggestions are deterministic and depend only on the injected time', () => {
  const ss = [good(4, 300), good(3, 300), good(2, 300)];
  assert.deepEqual(suggest(ss), suggest(ss));
  assert.equal(suggest(ss, NOW + 30 * DAY).kind, KINDS.RETURN);
});
