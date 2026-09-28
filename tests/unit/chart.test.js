import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderChart, niceScale, tickLabel, MAX_BARS } from '../../src/chart.js';

const mk = (i, sec, result = 'good') => ({ id: `s${i}`, startedAt: Date.UTC(2026, 8, i + 1), durationSec: sec, result });

test('no sessions -> no chart', () => {
  assert.equal(renderChart([]), '');
});

test('one bar per session, marked with its result', () => {
  const svg = renderChart([mk(0, 30), mk(1, 60, 'bad'), mk(2, 90)]);
  assert.equal((svg.match(/class="bar /g) || []).length, 3);
  assert.equal((svg.match(/class="bar good"/g) || []).length, 2);
  assert.equal((svg.match(/class="bar bad"/g) || []).length, 1);
  assert.match(svg, /Didn't go well/);
});

test('only the most recent sessions are drawn', () => {
  const many = Array.from({ length: MAX_BARS + 5 }, (_, i) => mk(i, 10 + i));
  const svg = renderChart(many);
  assert.equal((svg.match(/class="bar /g) || []).length, MAX_BARS);
  assert.ok(!svg.includes('data-id="s0"'));
});

test('nice scale picks readable steps', () => {
  assert.deepEqual(niceScale(45), { top: 45, ticks: [0, 15, 30, 45] });
  assert.deepEqual(niceScale(200), { top: 240, ticks: [0, 60, 120, 180, 240] });
  assert.equal(tickLabel(300), '5m');
  assert.equal(tickLabel(30), '30s');
});
