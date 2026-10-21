// Builds the "duration over time" bar chart as an SVG string.
// One bar per session (oldest left), height = duration.
// Result is shown by colour AND pattern (solid = went well, striped = didn't),
// so it is readable for colour-blind users too.
// If a session had a target, a thin horizontal tick marks the target height.

import { RESULTS } from './training.js';
import { formatTarget } from './progression.js';
import { t, locale, formatDuration } from './i18n.js';

// The main screen shows only the latest sessions, zoomed in on where the training is.
export const MAX_BARS = 10;
// A session more than this many times the typical (median) time is cut off ("broken" bar
// with its time written above), so one very long session can't flatten all the others.
export const CLIP_RATIO = 3;

// "Didn't go well · worried at 0:30", "Went well · not counted". Used by graph and history.
export function resultText(s) {
  if (s.result === RESULTS.GOOD) return s.uncertain ? t('resultNotCounted') : t('good');
  return Number.isFinite(s.anxietyOnsetSec)
    ? t('resultWorriedAt', { time: formatTarget(s.anxietyOnsetSec) })
    : t('bad');
}

const W = 340;
const H = 150;
// Extra room at the top only when a cut-off bar needs its label.
const padFor = (clipped) => ({ top: clipped ? 22 : 10, right: 8, bottom: 24, left: 40 });

const STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];

export function niceScale(maxSec) {
  const max = Math.max(maxSec, 1);
  const step = STEPS.find((s) => max / s <= 4) ?? Math.ceil(max / 4 / 3600) * 3600;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

export function tickLabel(sec) {
  if (sec === 0) return '0';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${sec / 60}m`;
  return `${+(sec / 3600).toFixed(1)}h`;
}

// Short time written above a cut-off bar: "45s", "12m", "2.2h".
export function compactDuration(sec) {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${+(sec / 3600).toFixed(1)}h`;
}

const median = (xs) => {
  const v = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Highest value the zoomed chart shows: the longest time (or target), unless that is far
// above the typical session – then CLIP_RATIO × the median, and longer bars are cut off.
export function chartCap(sessions) {
  const values = sessions.flatMap((s) => [s.durationSec, s.targetSec || 0]).filter((v) => v > 0);
  if (!values.length) return 1;
  const max = Math.max(...values);
  const med = median(sessions.map((s) => s.durationSec).filter((v) => v > 0));
  return Number.isFinite(med) && max > CLIP_RATIO * med ? CLIP_RATIO * med : max;
}

const dateFmt = (ms) =>
  new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
const dayFmt = (ms) =>
  new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'numeric' });

/** Zoomed bar chart of the latest MAX_BARS sessions. @returns {string} SVG ('' if none) */
export function renderChart(allSessions) {
  const sessions = allSessions.slice(-MAX_BARS);
  if (sessions.length === 0) return '';

  const { top, ticks } = niceScale(chartCap(sessions));
  const PAD = padFor(sessions.some((s) => s.durationSec > top));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / MAX_BARS; // same bar width from the first session on
  const barW = Math.max(3, Math.min(24, slot - 6));
  const y = (v) => PAD.top + plotH - (Math.min(v, top) / top) * plotH;
  const baseline = y(0);

  const grid = ticks
    .map(
      (t) => `
    <line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="axis" x="${PAD.left - 6}" y="${y(t)}" text-anchor="end" dominant-baseline="middle">${tickLabel(t)}</text>`,
    )
    .join('');

  const bars = sessions
    .map((s, i) => {
      const x = PAD.left + i * slot + (slot - barW) / 2;
      const cx = x + barW / 2;
      const clipped = s.durationSec > top;
      const h = Math.max(2, baseline - y(s.durationSec));
      const r = Math.min(4, barW / 2, h);
      const target = s.targetSec ? ` (${t('historyTarget', { time: formatTarget(s.targetSec) })})` : '';
      const label = `${dateFmt(s.startedAt)} · ${formatDuration(s.durationSec)}${target} · ${resultText(s)}`;
      const tickW = Math.min(barW + 6, slot);
      const targetTick = s.targetSec && s.targetSec <= top
        ? `<line class="target" x1="${cx - tickW / 2}" x2="${cx + tickW / 2}" y1="${y(s.targetSec)}" y2="${y(s.targetSec)}"/>`
        : '';
      // A cut-off bar: a gap across its top part and its real time written above.
      const cut = clipped
        ? `<path class="cut" d="M${x - 2},${PAD.top + 9} L${x + barW + 2},${PAD.top + 5} M${x - 2},${PAD.top + 14} L${x + barW + 2},${PAD.top + 10}"/>
      <text class="clip-label" x="${cx}" y="${PAD.top - 6}" text-anchor="middle">↑${compactDuration(s.durationSec)}</text>`
        : '';
      return `
    <g class="bar ${s.result}${clipped ? ' clipped' : ''}" data-id="${s.id}" tabindex="0" role="img" aria-label="${label}">
      <rect class="hit" x="${PAD.left + i * slot}" y="${PAD.top - 18}" width="${slot}" height="${plotH + 18}"/>
      <path class="mark" d="${roundedTopBar(x, baseline, barW, h, r)}"/>
      ${targetTick}
      ${cut}
      <text class="axis day" x="${cx}" y="${H - 8}" text-anchor="middle">${dayFmt(s.startedAt)}</text>
    </g>`;
    })
    .join('');

  return `
<svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="${t('chartAria')}">
  <defs>
    <pattern id="stripe" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" class="stripe-bg"/>
      <line x1="0" y1="0" x2="0" y2="5" class="stripe-line"/>
    </pattern>
  </defs>
  ${grid}
  <line class="baseline" x1="${PAD.left}" x2="${W - PAD.right}" y1="${baseline}" y2="${baseline}"/>
  ${bars}
</svg>`;
}

/** True when the zoomed chart cuts off at least one bar (the app then explains the ↑). */
export function hasClippedBars(allSessions) {
  const sessions = allSessions.slice(-MAX_BARS);
  if (!sessions.length) return false;
  const { top } = niceScale(chartCap(sessions));
  return sessions.some((s) => s.durationSec > top);
}

// ---------- the whole course: every session, log scale, smoothed line ----------

export const SMOOTH_SESSIONS = 5; // the line = median of the latest 5 good sessions at each point
const OW = 340;
const OH = 230;
const OPAD = { top: 12, right: 12, bottom: 26, left: 40 };
const LOG_TICKS = [1, 10, 30, 60, 300, 900, 1800, 3600, 7200, 14400, 28800];

// Typical time that went well: at each good session, the median of it and the good
// sessions just before it. Only good sessions ("don't count" left out). Pure.
export function smoothedGood(sessions, n = SMOOTH_SESSIONS) {
  const goods = sessions.filter((s) => s.result === RESULTS.GOOD && !s.uncertain && s.durationSec > 0);
  return goods.map((s, i) => ({ at: s.startedAt, sec: median(goods.slice(Math.max(0, i - n + 1), i + 1).map((g) => g.durationSec)) }));
}

// One entry per calendar day: the longest session that went well and the shortest one that
// didn't – the two that say most about the day. ("Don't count" sessions are left out.) Pure.
export function dailySummary(sessions) {
  const days = new Map();
  for (const s of sessions) {
    if (!Number.isFinite(s.startedAt) || !Number.isFinite(s.durationSec)) continue;
    const d = new Date(s.startedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const day = days.get(key) ?? { at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(), good: null, bad: null };
    if (s.result === RESULTS.GOOD && !s.uncertain) {
      if (!day.good || s.durationSec > day.good.durationSec) day.good = s;
    } else if (s.result === RESULTS.BAD) {
      if (!day.bad || s.durationSec < day.bad.durationSec) day.bad = s;
    }
    days.set(key, day);
  }
  return [...days.values()].filter((d) => d.good || d.bad).sort((a, b) => a.at - b.at);
}

/**
 * Overview of the course in one place. Log scale, so 10 s and 2 h are both readable.
 * Per day: the longest session that went well (dot) and the shortest that didn't (ring),
 * and a line for the typical time that went well (median of the latest 5, at the end of each day).
 * @param sessions sessions of one dog in one place
 * @param opts.from  only sessions from this time (ms); null = from the start
 * @returns {string} SVG ('' if none)
 */
export function renderOverview(allSessions, { from = null } = {}) {
  const sessions = allSessions
    .filter((s) => Number.isFinite(s.startedAt) && (from == null || s.startedAt >= from))
    .sort((a, b) => a.startedAt - b.startedAt);
  const days = dailySummary(sessions);
  if (!days.length) return '';

  // The line: the typical good time as it stood at the end of each day.
  const smooth = smoothedGood(sessions);
  const line = days
    .map((d) => {
      const end = d.at + 12 * 3600 * 1000;
      const last = smooth.filter((p) => p.at < end).pop();
      return last ? { at: d.at, sec: last.sec } : null;
    })
    .filter(Boolean);

  const plotW = OW - OPAD.left - OPAD.right;
  const plotH = OH - OPAD.top - OPAD.bottom;
  const shown = [...days.flatMap((d) => [d.good, d.bad].filter(Boolean).map((s) => s.durationSec)), ...line.map((p) => p.sec)]
    .map((v) => Math.max(1, v));
  const lo = [...LOG_TICKS].reverse().find((v) => v <= Math.min(...shown)) ?? 1;
  const hi = LOG_TICKS.find((v) => v >= Math.max(...shown)) ?? LOG_TICKS[LOG_TICKS.length - 1];
  const top = hi > lo ? hi : lo * 10;
  const ly = (v) => OPAD.top + plotH - ((Math.log(Math.max(1, v)) - Math.log(lo)) / (Math.log(top) - Math.log(lo))) * plotH;
  const t0 = days[0].at;
  const t1 = Math.max(days[days.length - 1].at, t0 + 1);
  const x = (ms) => OPAD.left + 8 + ((ms - t0) / (t1 - t0)) * (plotW - 16);

  const ticks = LOG_TICKS.filter((v) => v >= lo && v <= top);
  const grid = ticks
    .map((v) => `
    <line class="grid" x1="${OPAD.left}" x2="${OW - OPAD.right}" y1="${ly(v)}" y2="${ly(v)}"/>
    <text class="axis" x="${OPAD.left - 6}" y="${ly(v)}" text-anchor="end" dominant-baseline="middle">${tickLabel(v)}</text>`)
    .join('');

  const path = line.length > 1
    ? `<path class="trend" d="${line.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${ly(p.sec).toFixed(1)}`).join(' ')}"/>`
    : '';

  const dot = (s) => {
    const label = `${dateFmt(s.startedAt)} · ${formatDuration(s.durationSec)} · ${resultText(s)}`;
    return `<circle class="dot ${s.result}" cx="${x(new Date(s.startedAt).setHours(12, 0, 0, 0)).toFixed(1)}" cy="${ly(s.durationSec).toFixed(1)}" r="4.5" role="img" aria-label="${label}"/>`;
  };
  const dots = days.map((d) => [d.bad, d.good].filter(Boolean).map(dot).join('')).join('');

  return `
<svg class="chart overview-chart" viewBox="0 0 ${OW} ${OH}" role="group" aria-label="${t('overviewAria')}">
  ${grid}
  ${path}
  ${dots}
  <text class="axis" x="${OPAD.left}" y="${OH - 8}" text-anchor="start">${dateFmt(t0)}</text>
  ${days.length > 1 ? `<text class="axis" x="${OW - OPAD.right}" y="${OH - 8}" text-anchor="end">${dateFmt(t1)}</text>` : ''}
</svg>`;
}

// Bar with rounded top corners only, sitting on the baseline.
function roundedTopBar(x, baseline, w, h, r) {
  const top = baseline - h;
  return [
    `M${x},${baseline}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + w - r}`,
    `Q${x + w},${top} ${x + w},${top + r}`,
    `V${baseline}`,
    'Z',
  ].join(' ');
}
