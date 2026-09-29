// Decision rules of the time suggestion. `now` is a fixed reference time, so results never
// depend on today's date. Numbers in comments refer to the regression list in docs/SUGGESTION-MODEL.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestTarget, establishedLevel, anchor, weights, raiseFrom, stableLevelBefore, KINDS,
  SUGGESTION_SETTINGS as S,
} from '../../src/suggestion.js';
import { formatTarget } from '../../src/progression.js';

const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 9, 20, 18, 0).getTime(); // local time, fixed reference
const at = (daysAgo, hour = 10) => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};
let n = 0;
const good = (daysAgo, sec, extra = {}) => ({ id: `g${n++}`, startedAt: at(daysAgo, extra.hour ?? 10), durationSec: sec, result: 'good', ...extra });
const bad = (daysAgo, sec, extra = {}) => ({ id: `b${n++}`, startedAt: at(daysAgo, extra.hour ?? 10), durationSec: sec, result: 'bad', ...extra });
const suggest = (sessions, now = NOW) => suggestTarget(sessions, { now });

const OLD_TWO_HOURS = () => [good(16, 7200), good(15, 7200), good(14, 7200)];

test('settings are named, adjustable and in one place', () => {
  assert.equal(S.WINDOW_DAYS, 7);
  assert.equal(S.MAX_SESSIONS, 5);
  assert.equal(S.RAISE_RATIO, 0.1);
  assert.ok(Object.isFrozen(S));
  assert.equal('RETURN_RATIO' in S, false); // no automatic share of an old level
  assert.equal('MIN_GOOD_SEC' in S, false); // short sessions are not discarded
});

// 1
test('1: old 2-hour sessions and a two-week break → no automatic time, earlier level shown as history', () => {
  const r = suggest(OLD_TWO_HOURS());
  assert.equal(r.kind, KINDS.BREAK);
  assert.equal(r.sec, null);
  assert.equal(r.earlierLevel, 7200);
});

// 2
test('2: same history + a new good 10 s session planned as 10 s → repeat 10 s, not one hour', () => {
  const r = suggest([...OLD_TWO_HOURS(), good(0, 10, { hour: 9, targetSec: 10 })]);
  assert.equal(r.kind, KINDS.LIMITED);
  assert.equal(r.sec, 10);
  assert.equal(r.earlierLevel, 7200); // history only
  assert.equal(r.repeatSec, 10);
  // Without a plan, one session alone sets no target (same rule for every length).
  const unplanned = suggest([...OLD_TWO_HOURS(), good(0, 10, { hour: 9 })]);
  assert.equal(unplanned.kind, KINDS.LIMITED);
  assert.equal(unplanned.sec, null);
  assert.equal(unplanned.repeatSec, null);
});

test('reported: old 2 h history, worry at once, then ONE good 2 h session without a plan → no target, no Repeat', () => {
  const r = suggest([...OLD_TWO_HOURS(), bad(1, 30, { anxietyOnsetSec: 0 }), good(0, 7200)]);
  assert.equal(r.kind, KINDS.WORRIED_AT_ONCE);
  assert.equal(r.sec, null);
  assert.equal(r.repeatSec, null);
  // Also with a plan: a single session after worry-at-once is not enough to lift the limit.
  const planned = suggest([...OLD_TWO_HOURS(), bad(1, 30, { anxietyOnsetSec: 0 }), good(0, 10, { targetSec: 10 })]);
  assert.equal(planned.sec, null);
});

test('reported: break, then ONE good 2 h session without a plan → no target, no Repeat', () => {
  const r = suggest([...OLD_TWO_HOURS(), good(0, 7200)]);
  assert.equal(r.kind, KINDS.LIMITED);
  assert.equal(r.sec, null);
  assert.equal(r.repeatSec, null);
  // A plan protects too: 2 h actual with a 10 s plan → 10 s, never 2 h.
  assert.equal(suggest([...OLD_TWO_HOURS(), good(0, 7200, { targetSec: 10 })]).sec, 10);
});

test('hard session with unknown worry time, then one long good session → the limit stays', () => {
  const r = suggest([good(3, 300), bad(1, 300), good(0, 7200)]);
  assert.equal(r.kind, KINDS.HARD_CHOOSE);
  assert.equal(r.sec, null);
  assert.equal(r.repeatSec, null);
});

test('the single session is kept and counts once another session confirms it', () => {
  const one = [...OLD_TWO_HOURS(), bad(3, 30, { anxietyOnsetSec: 0 }), good(2, 20)];
  assert.equal(suggest(one).sec, null);
  const confirmed = suggest([...one, good(1, 20)]); // 2 good sessions on 2 days after the hard one
  assert.equal(confirmed.level, 20);
  assert.equal(confirmed.sec, 22);
  // A long single session is confirmed only up to what the second session supports.
  // 2 h (day 1) + 1 min (day 2): both support 1 min on two days → level 1:00, small increase.
  const mixed = suggest([...OLD_TWO_HOURS(), good(1, 7200, { hour: 9 }), good(0, 60)]);
  assert.equal(mixed.level, 60);
  assert.equal(mixed.sec, 65);
  assert.equal(mixed.repeatSec, 60);
});

// 3
test('3: same history + worry right at the start → no positive time from the old level', () => {
  for (const onset of [0, 5]) {
    const r = suggest([...OLD_TWO_HOURS(), bad(0, 60, { hour: 9, anxietyOnsetSec: onset })]);
    assert.equal(r.kind, KINDS.WORRIED_AT_ONCE);
    assert.equal(r.sec, null);
    assert.equal(r.repeatSec, null);
  }
});

// 4
test('4: 5 min then 2 h the same day → 2 h is neither the suggestion nor offered as Repeat', () => {
  const r = suggest([good(0, 300, { hour: 8 }), good(0, 7200, { hour: 11 })]);
  assert.equal(r.kind, KINDS.LIMITED);
  assert.equal(r.sec, 300);
  assert.equal(r.repeatSec, null);
  // Same without planned times, and with a 2 h session that was planned as 5 min.
  const planned = suggest([good(0, 300, { hour: 8, targetSec: 300 }), good(0, 7200, { hour: 11, targetSec: 300 })]);
  assert.equal(planned.sec, 300);
});

test('a single session anchors only its planned time; without a plan it sets no target', () => {
  assert.equal(suggest([good(0, 7200, { targetSec: 300 })]).sec, 300);
  assert.equal(suggest([good(0, 60, { targetSec: 300 })]).sec, 60); // shorter than planned: the actual time
  assert.equal(suggest([good(0, 90)]).sec, null);
  assert.equal(suggest([good(0, 90)]).repeatSec, null);
});

// 5
test('5: several 5-min sessions on different days + one 2-hour session → stays near 5 min', () => {
  for (const order of ['late', 'early']) {
    const fives = [good(5, 300), good(4, 300), good(3, 300), good(2, 300)];
    const long = good(order === 'late' ? 1 : 6, 7200);
    const r = suggest(order === 'late' ? [...fives, long] : [long, ...fives]);
    assert.equal(r.level, 300, order);
    assert.equal(r.sec, 330, order); // +10 % from 5 min – not ~28 min (the mean), not 2 h
    assert.equal(r.repeatSec, order === 'late' ? null : 300);
  }
});

// 6
test('6: after a restart, new longer good sessions on different days are confirmed directly', () => {
  const history = [...OLD_TWO_HOURS(), good(2, 10), good(1, 300), good(0, 300)];
  const r = suggest(history);
  assert.equal(r.level, 300); // confirmed by the new sessions – no 10 → 11 → 12 s ladder
  assert.equal(r.sec, 330);
  assert.equal(r.earlierLevel, 7200); // no extra multiplier from the old level
});

// 7
test('7: one long good session after several short ones → no immediate long level', () => {
  const r = suggest([good(3, 60), good(2, 60), good(1, 1200)]);
  assert.equal(r.level, 60);
  assert.equal(r.sec, 65);
  assert.equal(r.repeatSec, null); // 20 min is not offered as Repeat
  // ...but once a second day supports the longer time, it is confirmed.
  assert.equal(suggest([good(3, 60), good(2, 1200), good(1, 1200)]).level, 1200);
});

// 8
test('8: a later hard session is not outweighed by earlier good ones', () => {
  const goods = [good(4, 300), good(3, 300), good(2, 300)];
  assert.equal(suggest([...goods, bad(1, 300)]).kind, KINDS.HARD_CHOOSE);
  const withOnset = suggest([...goods, bad(1, 300, { anxietyOnsetSec: 200 })]);
  assert.equal(withOnset.kind, KINDS.EASIER);
  assert.equal(withOnset.sec, 150); // 80 % of 200 s = 160 s, rounded down to 15 s steps
  // Even with the old 2-hour history in the background.
  assert.equal(suggest([...OLD_TWO_HOURS(), ...goods, bad(1, 300)]).sec, null);
});

// 9
test('9: worry at 30 s during a long session → based on the worry time, not the end time', () => {
  const r = suggest([good(4, 600), good(3, 600), bad(1, 3600, { anxietyOnsetSec: 30 })]);
  assert.equal(r.kind, KINDS.EASIER);
  assert.equal(r.sec, 24);
});

test('unknown worry time: never "end time − 10 %"; a clearly shorter earlier time is used cautiously', () => {
  assert.equal(suggest([good(3, 600), bad(1, 600)]).sec, null);
  const r = suggest([good(4, 300), good(3, 300), bad(1, 600)]);
  assert.equal(r.sec, 240); // 80 % of 5 min
});

// 10
test('10: two very short good sessions after a hard one support the short level only', () => {
  const r = suggest([good(5, 1200), good(4, 1200), bad(3, 1200, { anxietyOnsetSec: 600 }), good(2, 3), good(1, 3)]);
  assert.equal(r.level, 3);
  assert.equal(r.sec, 3);
  assert.notEqual(r.sec, 1200);
  // One short good session after the hard one: still capped below the worry time.
  const one = suggest([good(5, 1200), bad(3, 1200, { anxietyOnsetSec: 60 }), good(2, 300)]);
  assert.equal(one.kind, KINDS.EASIER);
  assert.equal(one.sec, 45); // 80 % of 60 s = 48 s → 45 s
});

// 11
test('11: good sessions of 1 and 2 seconds are kept and count as observations', () => {
  const r = suggest([good(2, 1), good(1, 2)]);
  assert.equal(r.kind, KINDS.REPEAT);
  assert.equal(r.level, 1);
  assert.equal(r.sec, 1);
  assert.equal(suggest([good(0, 2, { targetSec: 2 })]).sec, 2);
  assert.equal(suggest([good(0, 2)]).sec, null); // kept, but alone and unplanned it sets no target
  assert.equal(suggest([good(3, 5), good(2, 5), good(1, 5)]).sec, 6);
});

// 12
test('12: sessions marked "don\'t count" stay in the journal but do not steer the suggestion', () => {
  const ss = [good(3, 300), good(2, 300), good(1, 3600, { uncertain: true })];
  const r = suggest(ss);
  assert.equal(r.level, 300);
  assert.equal(r.sec, 330);
  assert.equal(ss.length, 3);
  assert.equal(suggest([good(2, 600, { uncertain: true }), good(1, 600, { uncertain: true })]).kind, KINDS.TOO_LITTLE);
});

// 9 (weak same-day evidence)
test('many sessions on one day are weaker than sessions on several days', () => {
  const sameDay = [9, 10, 11, 12, 13].map((h) => good(1, 300, { hour: h }));
  assert.equal(suggest(sameDay).kind, KINDS.LIMITED);
  assert.equal(suggest(sameDay).sec, 300);
  assert.equal(suggest([5, 4, 3, 2, 1].map((d) => good(d, 300))).kind, KINDS.RAISE);
  assert.ok(weights(sameDay).reduce((a, b) => a + b, 0) < 1);
});

test('only the 5 most recent sessions from the last 7 days are current basis', () => {
  assert.equal(suggest([good(8, 300), good(1, 300)]).kind, KINDS.LIMITED);
  const r = suggest([bad(6, 300), good(5, 300), good(4, 300), good(3, 300), good(2, 300), good(1, 300)]);
  assert.equal(r.kind, KINDS.RAISE);
});

test('the earlier stable level never becomes a floor or target', () => {
  const r = suggest([...OLD_TWO_HOURS(), good(1, 20), good(0, 20)]);
  assert.equal(r.sec, 22);
  assert.equal(r.earlierLevel, 7200);
  assert.equal(stableLevelBefore([good(16, 7200)], NOW - 7 * DAY), null); // one session: not stable
});

test('none and too little', () => {
  assert.equal(suggest([]).kind, KINDS.NONE);
  assert.equal(suggest([]).sec, null);
});

// 13 (rounding)
test('very short times: raises stay proportional', () => {
  assert.equal(raiseFrom(1), 1);
  assert.equal(raiseFrom(5), 6);
  assert.equal(raiseFrom(10), 11);
  assert.equal(raiseFrom(30), 35);
  assert.equal(raiseFrom(60), 65);
  for (let l = 1; l < 4 * 3600; l += 3) {
    const up = raiseFrom(l);
    assert.ok(up >= l && up <= l * 1.2 + 1e-9, `${l} → ${up}`);
  }
});

test('building blocks', () => {
  assert.equal(anchor([good(1, 300), good(1, 7200)]), 300);
  assert.equal(anchor([good(1, 10), good(1, 7200)]), 10);
  assert.equal(anchor([]), null);
  assert.equal(anchor([good(1, 7200)]), null);
  assert.equal(anchor([good(1, 7200, { targetSec: 30 })]), 30);
  const pairs = [good(3, 300), good(2, 600), good(1, 7200)].map((s, i, a) => [s, weights(a)[i]]);
  assert.equal(establishedLevel(pairs), 600);
});

test('deterministic, and dependent only on the injected time', () => {
  const ss = [good(4, 300), good(3, 300), good(2, 300)];
  assert.deepEqual(suggest(ss), suggest(ss));
  assert.equal(suggest(ss, NOW + 30 * DAY).kind, KINDS.BREAK);
  assert.equal(formatTarget(suggest(ss).sec), '5:30');
});
