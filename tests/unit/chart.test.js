import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderChart, niceScale, tickLabel, MAX_BARS, chartCap, hasClippedBars, renderOverview, smoothedGood, compactDuration,
} from '../../src/chart.js';

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

// ---------- v0.10: zoomed main chart and the whole course ----------

test('the main chart shows the latest 10 sessions', () => {
  assert.equal(MAX_BARS, 10);
  const svg = renderChart(Array.from({ length: 25 }, (_, i) => mk(i, 60)));
  assert.equal((svg.match(/class="bar /g) || []).length, 10);
  assert.ok(svg.includes('data-id="s24"') && !svg.includes('data-id="s14"'));
});

test('one very long session no longer flattens the short ones: it is cut off and labelled', () => {
  const sessions = [mk(0, 60), mk(1, 80), mk(2, 7800, 'bad'), mk(3, 70), mk(4, 90)];
  assert.equal(chartCap(sessions), 240); // 3 × the median (80 s), not 2 h 10 min
  const { top } = niceScale(chartCap(sessions));
  assert.ok(top < 600);
  const svg = renderChart(sessions);
  assert.equal((svg.match(/bar bad clipped/g) || []).length, 1);
  assert.match(svg, /↑2\.2h/);
  assert.match(svg, /2 h 10 min/); // the exact time is still in the bar's label
  assert.ok(hasClippedBars(sessions));
});

test('similar sessions are never cut off', () => {
  const sessions = [mk(0, 300), mk(1, 600), mk(2, 420, 'bad'), mk(3, 540)];
  assert.equal(chartCap(sessions), 600);
  assert.ok(!hasClippedBars(sessions));
  assert.ok(!renderChart(sessions).includes('clipped'));
});

test('compact times above cut-off bars', () => {
  assert.equal(compactDuration(45), '45s');
  assert.equal(compactDuration(1500), '25m');
  assert.equal(compactDuration(7800), '2.2h');
});

test('the smoothed line is the median of the latest good sessions; hard and "don\'t count" sessions are left out', () => {
  const s = [mk(0, 60), mk(1, 7200, 'bad'), mk(2, 120), { ...mk(3, 9000), uncertain: true }, mk(4, 90), mk(5, 3000), mk(6, 100)];
  assert.deepEqual(smoothedGood(s, 3).map((p) => p.sec), [60, 90, 90, 120, 100]);
});

test('the whole course: one dot per session, period filter, nothing when empty', () => {
  const s = Array.from({ length: 12 }, (_, i) => mk(i, 60 + i * 30, i % 4 === 3 ? 'bad' : 'good'));
  const all = renderOverview(s);
  assert.equal((all.match(/class="dot /g) || []).length, 12);
  assert.equal((all.match(/class="trend"/g) || []).length, 1);
  const recent = renderOverview(s, { from: Date.UTC(2026, 8, 9) });
  assert.equal((recent.match(/class="dot /g) || []).length, 4);
  assert.equal(renderOverview(s, { from: Date.UTC(2027, 0, 1) }), '');
  assert.equal(renderOverview([]), '');
});
