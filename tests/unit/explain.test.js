import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestTarget, KINDS, HARD } from '../../src/suggestion.js';
import { explanationKey, longestGoodSession } from '../../src/explain.js';
import { t, STRINGS } from '../../src/i18n.js';

const NOW = new Date(2026, 9, 15, 18).getTime();
const day = (d, h = 10) => new Date(2026, 9, 15 - d, h).getTime();
let n = 0;
const s = (d, sec, result, extra = {}) => ({
  id: `s${n++}`, dogId: 'charlie', contextId: 'home', startedAt: day(d), endedAt: day(d) + sec * 1000,
  durationSec: sec, targetSec: null, result, ...extra,
});
const explain = (sessions, lang) => {
  const { key, params } = explanationKey(suggestTarget(sessions, { now: NOW }));
  return t(key, params, lang);
};
// Words that would claim the LATEST session was hard.
const SAYS_LATEST = { sv: /senaste passet/i, en: /latest session|last session/i };

test('a hard session followed by a good one still limits the suggestion – and the text says "recent", not "latest"', () => {
  const sessions = [
    s(3, 300, 'good'),
    s(2, 480, 'bad', { anxietyOnsetSec: 375 }),
    s(1, 600, 'good', { targetSec: 600 }), // the latest session went WELL
  ];
  const sug = suggestTarget(sessions, { now: NOW });
  assert.equal(sug.kind, KINDS.EASIER);
  assert.equal(sug.sec, 300); // 80 % of the worry time 6:15 – still limited by the hard session
  assert.equal(sug.hard, HARD.RECENT);
  assert.equal(sug.fromOnset, true);
  for (const lang of ['sv', 'en']) assert.doesNotMatch(explain(sessions, lang), SAYS_LATEST[lang], lang);
  assert.match(explain(sessions, 'sv'), /^Ett nyligt svårt pass gör att förslaget är kortare/);
  assert.match(explain(sessions, 'en'), /^A recent hard session makes the suggestion shorter/);
});

test('when the latest session itself was hard, the text says so (both languages)', () => {
  const sessions = [s(3, 300, 'good'), s(1, 480, 'bad', { anxietyOnsetSec: 375 })];
  const sug = suggestTarget(sessions, { now: NOW });
  assert.equal(sug.hard, HARD.LATEST);
  assert.match(explain(sessions, 'sv'), /^Senaste passet gick inte bra/);
  assert.match(explain(sessions, 'en'), /^The latest session didn't go well/);
});

test('every hard case: latest vs recent, with and without a worry time, both languages', () => {
  const cases = [
    // [sessions, kind, hard]
    [[s(3, 300, 'good', { targetSec: 300 }), s(1, 480, 'bad')], KINDS.EASIER, HARD.LATEST], // unknown worry, shorter basis
    [[s(3, 300, 'good', { targetSec: 300 }), s(2, 480, 'bad'), s(1, 600, 'good', { targetSec: 600 })], KINDS.EASIER, HARD.RECENT],
    [[s(1, 120, 'bad')], KINDS.HARD_CHOOSE, HARD.LATEST], // no shorter basis
    [[s(2, 120, 'bad'), s(1, 60, 'good')], KINDS.HARD_CHOOSE, HARD.RECENT],
    [[s(1, 60, 'bad', { anxietyOnsetSec: 0 })], KINDS.WORRIED_AT_ONCE, HARD.LATEST],
    [[s(2, 60, 'bad', { anxietyOnsetSec: 3 }), s(1, 7200, 'good')], KINDS.WORRIED_AT_ONCE, HARD.RECENT],
  ];
  for (const [sessions, kind, hard] of cases) {
    const sug = suggestTarget(sessions, { now: NOW });
    assert.equal(sug.kind, kind, `${kind}/${hard}`);
    assert.equal(sug.hard, hard, `${kind}/${hard}`);
    for (const lang of ['sv', 'en']) {
      const text = explain(sessions, lang);
      assert.ok(text && !/\{\w+\}/.test(text), `${lang} ${kind}/${hard}: ${text}`);
      if (hard === HARD.RECENT) assert.doesNotMatch(text, SAYS_LATEST[lang], `${lang} ${kind}/${hard}: ${text}`);
      else assert.match(text, SAYS_LATEST[lang], `${lang} ${kind}/${hard}: ${text}`);
    }
  }
});

test('suggestions that do not come from a hard session carry no hard cause', () => {
  assert.equal(suggestTarget([], { now: NOW }).hard, null);
  assert.equal(suggestTarget([s(2, 60, 'good'), s(1, 60, 'good')], { now: NOW }).hard, null);
  assert.equal(suggestTarget([s(30, 60, 'bad')], { now: NOW }).hard, null); // a break
});

test('every explanation key exists in both languages', () => {
  const keys = new Set();
  const kinds = Object.values(KINDS);
  for (const kind of kinds) for (const hard of [null, ...Object.values(HARD)]) for (const fromOnset of [false, true]) {
    for (const sec of [null, 30]) keys.add(explanationKey({ kind, hard, fromOnset, sec }).key);
  }
  for (const k of keys) {
    assert.ok(k in STRINGS.en, k);
    assert.ok(k in STRINGS.sv, k);
  }
  assert.ok(keys.size >= 14);
});

test('longest session that went well: good only, never "don\'t count", most recent of equals', () => {
  assert.equal(longestGoodSession([]), null);
  assert.equal(longestGoodSession([s(1, 900, 'bad')]), null); // no relevant session → nothing shown
  const a = s(20, 7200, 'good');
  const b = s(5, 600, 'good');
  const uncertain = s(4, 9000, 'good', { uncertain: true });
  const bad = s(3, 8000, 'bad');
  assert.deepEqual(longestGoodSession([a, b, uncertain, bad]), { id: a.id, durationSec: 7200, startedAt: a.startedAt });
  const a2 = s(2, 7200, 'good');
  assert.equal(longestGoodSession([a, a2, b]).id, a2.id);
});

test('the historical record never raises today\'s suggestion or becomes a hidden baseline', () => {
  const recent = [
    s(3, 300, 'good'),
    s(2, 480, 'bad', { anxietyOnsetSec: 375 }),
    s(1, 600, 'good', { targetSec: 600 }),
  ];
  const before = suggestTarget(recent, { now: NOW });
  // A 2-hour session that went well, long ago …
  const old = s(40, 7200, 'good');
  // … and one inside the current window, before the hard session.
  const inWindow = s(4, 7200, 'good');
  for (const extra of [[old], [inWindow], [old, inWindow]]) {
    const all = [...extra, ...recent];
    const after = suggestTarget(all, { now: NOW });
    assert.equal(after.sec, before.sec);
    assert.equal(after.kind, before.kind);
    assert.equal(longestGoodSession(all).durationSec, 7200); // shown as history only
    assert.ok(after.sec < 7200);
  }
  // After a break: no automatic target at all, even with a 2-hour record.
  const brk = [s(40, 7200, 'good'), s(39, 7200, 'good'), s(38, 7200, 'good')];
  const sug = suggestTarget(brk, { now: NOW });
  assert.equal(sug.kind, KINDS.BREAK);
  assert.equal(sug.sec, null);
  assert.equal(sug.repeatSec, null);
  assert.equal(longestGoodSession(brk).durationSec, 7200);
  assert.equal(t('targetNoAuto', {}, 'sv'), 'Inget automatiskt mål i dag');
});
