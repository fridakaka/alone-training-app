// Decision rules of the time suggestion. `now` is a fixed reference time, so results never
// depend on today's date. Numbers in comments refer to the regression list in docs/SUGGESTION-MODEL.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestTarget, anchor, raiseFrom, stableLevelBefore, KINDS, HARD, NOTES,
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
  assert.equal(S.RAISE_RATIO, 0.1);
  assert.equal(S.CONFIRMS_TO_RAISE, 2);
  assert.equal(S.RECOVERY_STEPS, 3);
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
  assert.equal(r.level, 300); // both support 5 min – the 2 h session alone supports nothing more
  assert.equal(r.sec, 330); // two good sessions at 5 min → small increase
  assert.equal(r.repeatSec, null);
  // Same with a 2 h session that was planned as 5 min.
  const planned = suggest([good(0, 300, { hour: 8, targetSec: 300 }), good(0, 7200, { hour: 11, targetSec: 300 })]);
  assert.equal(planned.sec, 330);
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
    assert.equal(r.sec, 330, order); // +10 % from 5 min – not ~28 min (the mean), not 2 h
    // Late: the 2 h session also confirms the increase to 5:30 – but supports nothing more.
    assert.equal(r.level, order === 'late' ? 330 : 300, order);
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
  assert.equal(r.sec, 65); // 20 min confirms the small increase – nothing more
  assert.equal(r.note, NOTES.ONCE);
  assert.equal(r.repeatSec, null); // 20 min is not offered as Repeat
  // ...but once a second session supports the longer time, it is confirmed.
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
test('10: very short good sessions after a hard one neither lower nor lift the limit', () => {
  const r = suggest([good(5, 1200), good(4, 1200), bad(3, 1200, { anxietyOnsetSec: 600 }), good(2, 3), good(1, 3)]);
  assert.equal(r.kind, KINDS.EASIER);
  assert.equal(r.sec, 480); // still 80 % of the worry time (10 min) – never back to 20 min by itself
  assert.equal(r.hard, HARD.RECENT);
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

test('sessions on the same day count too: two good ones raise, staying at the same time does not ratchet', () => {
  const sameDay = [9, 10, 11, 12, 13].map((h) => good(1, 300, { hour: h }));
  assert.equal(suggest(sameDay).kind, KINDS.RAISE);
  assert.equal(suggest(sameDay).sec, 330); // never above what was actually reached + 10 %
});

test('a break of 7 days starts over; the old level only shows as history', () => {
  const r = suggest([good(20, 600), good(19, 600), good(1, 300, { targetSec: 300 })]);
  assert.equal(r.kind, KINDS.LIMITED);
  assert.equal(r.sec, 300);
  assert.equal(r.earlierLevel, 600);
  const later = suggest([bad(6, 300), good(5, 300), good(4, 300), good(3, 300), good(2, 300), good(1, 300)]);
  assert.equal(later.kind, KINDS.RAISE);
});

// ---------- v0.11: the current level is carried forward ----------
const g = (day, hour, sec, targetSec = null) => good(day, sec, { hour, targetSec });
const b = (day, hour, sec, targetSec = null, anxietyOnsetSec = null) => bad(day, sec, { hour, targetSec, anxietyOnsetSec });

test('reported: a good session that ends early (other reasons) never lowers the suggestion', () => {
  // Built up during one day, as in the report.
  const day = [g(1, 8, 20, 20), g(1, 9, 25, 22), g(1, 10, 30, 25), g(1, 11, 60, 30), g(1, 12, 70, 60), g(1, 13, 88, 75), g(1, 14, 90, 90), g(1, 15, 92, 90)];
  const morning = suggest(day);
  // Next day: ended after 1:05 for other reasons, marked "went well".
  const after = suggest([...day, g(0, 8, 65, morning.sec)]);
  assert.equal(after.sec, morning.sec);
  assert.equal(after.note, NOTES.SHORTER);
  assert.ok(morning.sec >= 90);
});

test('reported: after a hard session, good sessions lead back to the earlier level in at most 3 steps', () => {
  const before = [g(4, 9, 58, 20), g(4, 10, 60, 20), g(4, 11, 59, 60), g(4, 12, 59, 60)];
  assert.equal(suggest(before).level, 60);
  let ss = [...before, b(1, 9, 60, 60)]; // didn't go well at 1:00, worry time unknown
  assert.equal(suggest(ss).kind, KINDS.HARD_CHOOSE);
  const steps = [];
  for (const [i, sec] of [20, 20, 22, 30, 60].entries()) {
    ss = [...ss, g(1, 10 + i, sec, sec)];
    steps.push(suggest(ss).sec);
  }
  // Two good sessions to restart (20 s), then 3 steps back to 1:00 – not 0:30 as before.
  assert.deepEqual(steps, [null, 20, 30, 45, 60]);
  const r = suggest(ss);
  assert.equal(r.kind, KINDS.REPEAT);
  assert.equal(r.note, NOTES.BACK);
});

test('recovery after a known worry time: lower, then 3 steps back, then normal increases', () => {
  let ss = [g(5, 9, 600), g(5, 10, 600), g(4, 9, 660, 660), g(4, 10, 660, 660), b(3, 9, 400, 700, 240)];
  let r = suggest(ss);
  assert.equal(r.kind, KINDS.EASIER);
  assert.equal(r.sec, 180); // 80 % of the worry time 4:00
  assert.equal(r.hard, HARD.LATEST);
  const seq = [];
  for (let i = 0; i < 5; i++) {
    ss = [...ss, g(3, 10 + i, r.sec, r.sec)];
    r = suggest(ss);
    seq.push([r.kind, r.sec]);
  }
  assert.deepEqual(seq, [
    [KINDS.RECOVER, 330], [KINDS.RECOVER, 480], [KINDS.REPEAT, 660], [KINDS.REPEAT, 660], [KINDS.RAISE, 720],
  ]);
});

test('during the way back, a session that ends early is neutral and a new hard session keeps the goal', () => {
  let ss = [g(5, 9, 600), g(5, 10, 600), b(3, 9, 600, 600, 300)]; // level 10:00, worry at 5:00 → 4:00
  assert.equal(suggest(ss).sec, 240);
  ss = [...ss, g(3, 10, 240, 240)];
  const step1 = suggest(ss);
  assert.equal(step1.kind, KINDS.RECOVER);
  assert.equal(step1.backTo, 600);
  ss = [...ss, g(3, 11, 60, step1.sec)]; // stopped early
  assert.equal(suggest(ss).sec, step1.sec);
  ss = [...ss, b(3, 12, 300, step1.sec, 200)]; // worry at 3:20
  const again = suggest(ss);
  assert.equal(again.sec, 150); // 80 % = 2:40, rounded down to 2:30
  ss = [...ss, g(3, 13, 150, 150)];
  assert.equal(suggest(ss).backTo, 600); // the goal is still the level from before the first setback
});

test('worry from the start: no automatic time until two good sessions, then back towards the earlier level', () => {
  let ss = [g(3, 9, 300), g(3, 10, 300), b(2, 9, 120, 300, 3)];
  assert.equal(suggest(ss).kind, KINDS.WORRIED_AT_ONCE);
  ss = [...ss, g(2, 10, 10, 10)];
  assert.equal(suggest(ss).sec, null);
  ss = [...ss, g(2, 11, 10, 10)];
  assert.equal(suggest(ss).sec, 10);
  ss = [...ss, g(2, 12, 10, 10)];
  const r = suggest(ss);
  assert.equal(r.kind, KINDS.RECOVER);
  assert.equal(r.sec, 20); // never more than doubled in one step
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
  assert.equal(anchor([good(3, 300), good(2, 600), good(1, 7200)]), 600);
  assert.equal(anchor([good(1, 7200, { targetSec: 30 })], S, { singleAllowed: false }), null);
});

test('deterministic, and dependent only on the injected time', () => {
  const ss = [good(4, 300), good(3, 300), good(2, 300)];
  assert.deepEqual(suggest(ss), suggest(ss));
  assert.equal(suggest(ss, NOW + 30 * DAY).kind, KINDS.BREAK);
  assert.equal(formatTarget(suggest(ss).sec), '5:30');
});

test('one shorter session never lowers the suggestion, but three in a row make it follow them', () => {
  let ss = [g(3, 9, 600), g(3, 10, 600), g(3, 11, 600)]; // level 10:00, suggestion 11:00
  const start = suggest(ss).sec;
  assert.equal(start, 660);
  ss = [...ss, g(2, 9, 120)];
  assert.equal(suggest(ss).sec, start);
  ss = [...ss, g(2, 10, 120)];
  assert.equal(suggest(ss).sec, start);
  ss = [...ss, g(2, 11, 130)];
  const r = suggest(ss);
  assert.equal(r.note, NOTES.FOLLOW);
  assert.ok(r.sec <= 135, `follows the short sessions: ${r.sec}`);
  // A session at the suggestion in between resets the run.
  const mixed = suggest([g(3, 9, 600), g(3, 10, 600), g(3, 11, 600), g(2, 9, 120), g(2, 10, 660), g(2, 11, 120), g(2, 12, 120)]);
  assert.ok(mixed.sec >= 660);
});
