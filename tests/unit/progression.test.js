import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stepFor, roundNatural, suggestNext, repeatLast, stepUp, stepDown, formatTarget, MIN_TARGET_SEC,
} from '../../src/progression.js';

const s = (durationSec, result) => ({ durationSec, result, startedAt: 0 });

test('rounding step grows with duration', () => {
  assert.equal(stepFor(30), 5);
  assert.equal(stepFor(59), 5);
  assert.equal(stepFor(60), 15);
  assert.equal(stepFor(299), 15);
  assert.equal(stepFor(300), 30);
  assert.equal(stepFor(899), 30);
  assert.equal(stepFor(900), 60);
  assert.equal(stepFor(3599), 60);
  assert.equal(stepFor(3600), 300);
});

test('sensible rounding avoids awkward values like 4:23 or 17:47', () => {
  assert.equal(formatTarget(roundNatural(4 * 60 + 23)), '4:30');
  assert.equal(formatTarget(roundNatural(17 * 60 + 47)), '18:00');
  assert.equal(roundNatural(33), 35);
  assert.equal(roundNatural(7 * 60 + 44), 7 * 60 + 30);
  assert.equal(roundNatural(62 * 60), 60 * 60);
  assert.equal(roundNatural(1), MIN_TARGET_SEC);
});

test('+10% after a session that went well', () => {
  assert.equal(suggestNext([s(240, 'good')]), 270);     // 4:00 -> 4:24 -> 4:30
  assert.equal(suggestNext([s(600, 'good')]), 660);     // 10:00 -> 11:00
  assert.equal(suggestNext([s(1200, 'good')]), 1320);   // 20:00 -> 22:00
  assert.equal(suggestNext([s(30, 'good')]), 35);       // 30 s -> 33 -> 35
});

test('−10% after a session that did not go well', () => {
  assert.equal(suggestNext([s(240, 'bad')]), 210);      // 4:00 -> 3:36 -> 3:30
  assert.equal(suggestNext([s(600, 'bad')]), 540);      // 10:00 -> 9:00
  assert.equal(suggestNext([s(1200, 'bad')]), 1080);    // 20:00 -> 18:00
  assert.equal(suggestNext([s(30, 'bad')]), 25);        // 30 s -> 27 -> 25
});

test('rounding never cancels the direction of the change', () => {
  assert.equal(suggestNext([s(10, 'good')]), 15);       // 11 would round back to 10
  assert.equal(suggestNext([s(10, 'bad')]), 5);         // 9 would round back to 10
  assert.equal(suggestNext([s(5, 'bad')]), MIN_TARGET_SEC);
  for (let d = 5; d < 3 * 3600; d += 7) {
    assert.ok(suggestNext([s(d, 'good')]) > roundNatural(d), `good ${d}`);
    const down = suggestNext([s(d, 'bad')]);
    assert.ok(down < roundNatural(d) || down === MIN_TARGET_SEC, `bad ${d}`);
    for (const v of [suggestNext([s(d, 'good')]), down]) {
      assert.equal(v % stepFor(v) === 0 || v === MIN_TARGET_SEC, true, `grid ${d} -> ${v}`);
    }
  }
});

test('only the most recent session counts, and no history means no suggestion', () => {
  assert.equal(suggestNext([]), null);
  assert.equal(suggestNext([s(600, 'good'), s(240, 'bad')]), 210);
});

test('repeat option only after a good session', () => {
  assert.equal(repeatLast([s(247, 'good')]), 240);
  assert.equal(repeatLast([s(247, 'bad')]), null);
  assert.equal(repeatLast([]), null);
});

test('manual − / + steps land on natural values', () => {
  assert.equal(stepUp(null), 60);
  assert.equal(stepUp(270), 285);
  assert.equal(stepUp(295), 300);   // crosses into 30 s steps
  assert.equal(stepUp(300), 330);
  assert.equal(stepUp(55), 60);
  assert.equal(stepDown(300), 285); // just below 5 min uses 15 s steps
  assert.equal(stepDown(60), 55);
  assert.equal(stepDown(5), MIN_TARGET_SEC);
  assert.equal(stepDown(null), null);
});

test('target formatting', () => {
  assert.equal(formatTarget(45), '0:45');
  assert.equal(formatTarget(270), '4:30');
  assert.equal(formatTarget(3900), '1:05:00');
});

test('+ always goes up and − always goes down, for every target up to 4 h', () => {
  for (let v = 5; v < 4 * 3600; v += 5) {
    assert.ok(stepUp(v) > v, `up ${v}`);
    assert.ok(stepDown(v) < v || v === MIN_TARGET_SEC, `down ${v}`);
  }
});

// ---------- v0.3 rules ----------
import { suggestDetailed, plusTenLast, EARLY_END_RATIO } from '../../src/progression.js';

test('after a setback, the first good session is repeated, the second grows +10%', () => {
  const setback = [s(300, 'good'), s(300, 'bad'), s(270, 'good')];
  assert.deepEqual(suggestDetailed(setback), { sec: 270, reason: 'consolidate' });
  assert.deepEqual(suggestDetailed([...setback, s(270, 'good')]), { sec: 300, reason: 'up' });
});

test('+10% chip is still offered when the suggestion is "same again"', () => {
  assert.equal(plusTenLast([s(300, 'bad'), s(270, 'good')]), 300);
  assert.equal(plusTenLast([s(270, 'bad')]), null);
});

test('good session ended well before its target suggests the same target again', () => {
  const early = { durationSec: 60, result: 'good', targetSec: 300, startedAt: 0 };
  assert.deepEqual(suggestDetailed([early]), { sec: 300, reason: 'early' });
  // Close to the target (>= 90 %) counts as reaching it.
  const close = { durationSec: 290, result: 'good', targetSec: 300, startedAt: 0 };
  assert.equal(EARLY_END_RATIO, 0.9);
  assert.deepEqual(suggestDetailed([close]), { sec: 330, reason: 'up' }); // 319 s -> 5:30
  // Didn't go well always means −10 % of what actually happened.
  const earlyBad = { durationSec: 60, result: 'bad', targetSec: 300, startedAt: 0 };
  assert.deepEqual(suggestDetailed([earlyBad]), { sec: 55, reason: 'down' });
});

test('two bad sessions in a row keep going down', () => {
  assert.deepEqual(suggestDetailed([s(300, 'bad'), s(270, 'bad')]), { sec: 240, reason: 'down' });
});
