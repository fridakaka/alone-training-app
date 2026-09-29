import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stepFor, gridFor, roundNatural, floorNatural, stepUp, stepDown, formatTarget, MIN_TARGET_SEC,
} from '../../src/progression.js';

test('button step grows with duration', () => {
  assert.equal(stepFor(1), 1);
  assert.equal(stepFor(9), 1);
  assert.equal(stepFor(10), 5);
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

test('suggestion grid is fine at short times and never more than ~8 % at the start of a band', () => {
  assert.equal(gridFor(10), 1);
  assert.equal(gridFor(29), 1);
  assert.equal(gridFor(30), 5);
  assert.equal(gridFor(119), 5);
  assert.equal(gridFor(120), 15);
  assert.equal(gridFor(300), 30);
  assert.equal(gridFor(900), 60);
  assert.equal(gridFor(3600), 300);
  for (const start of [60, 120, 300, 900, 3600]) assert.ok(gridFor(start) / start <= 0.125, `${start}`);
});

test('natural rounding avoids awkward values like 4:23 or 17:47', () => {
  assert.equal(formatTarget(roundNatural(4 * 60 + 23)), '4:30');
  assert.equal(formatTarget(roundNatural(17 * 60 + 47)), '18:00');
  assert.equal(roundNatural(33), 35);
  assert.equal(roundNatural(7 * 60 + 44), 7 * 60 + 30);
  assert.equal(roundNatural(62 * 60), 60 * 60);
  assert.equal(roundNatural(1), 1);
  assert.equal(MIN_TARGET_SEC, 1);
});

test('floorNatural never rounds up', () => {
  assert.equal(floorNatural(24), 24);
  assert.equal(floorNatural(34), 30);
  assert.equal(floorNatural(4 * 60 + 29), 4 * 60 + 15);
  assert.equal(floorNatural(17 * 60 + 59), 17 * 60);
  for (let v = 1; v < 3 * 3600; v += 7) assert.ok(floorNatural(v) <= v, `${v}`);
  assert.equal(floorNatural(0), 0);
});

test('manual − / + steps land on natural values', () => {
  assert.equal(stepUp(null), null); // from "no target" the app asks for a time
  assert.equal(stepUp(1), 2);
  assert.equal(stepUp(9), 10);
  assert.equal(stepUp(270), 285);
  assert.equal(stepUp(295), 300); // crosses into 30 s steps
  assert.equal(stepUp(300), 330);
  assert.equal(stepUp(55), 60);
  assert.equal(stepDown(300), 285); // just below 5 min uses 15 s steps
  assert.equal(stepDown(60), 55);
  assert.equal(stepDown(5), 4);
  assert.equal(stepDown(10), 9);
  assert.equal(stepDown(1), 1);
  assert.equal(stepDown(null), null);
});

test('+ always goes up and − always goes down, for every target up to 4 h', () => {
  for (let v = 1; v < 4 * 3600; v += 1) {
    assert.ok(stepUp(v) > v, `up ${v}`);
    assert.ok(stepDown(v) < v || v === MIN_TARGET_SEC, `down ${v}`);
  }
});

test('target formatting', () => {
  assert.equal(formatTarget(45), '0:45');
  assert.equal(formatTarget(270), '4:30');
  assert.equal(formatTarget(3900), '1:05:00');
});
