// Builds the "duration over time" bar chart as an SVG string.
// One bar per session (oldest left), height = duration.
// Result is shown by colour AND pattern (solid = went well, striped = didn't),
// so it is readable for colour-blind users too.

import { formatDuration } from './training.js';

export const MAX_BARS = 30;

const W = 340;
const H = 190;
const PAD = { top: 12, right: 8, bottom: 26, left: 40 };

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

const dateFmt = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function renderChart(allSessions) {
  const sessions = allSessions.slice(-MAX_BARS);
  if (sessions.length === 0) return '';

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const { top, ticks } = niceScale(Math.max(...sessions.map((s) => s.durationSec)));
  const slot = plotW / Math.max(sessions.length, 6); // keep bars from getting huge
  const gap = 2;
  const barW = Math.max(3, Math.min(28, slot - gap));
  const y = (v) => PAD.top + plotH - (v / top) * plotH;
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
      const h = Math.max(2, baseline - y(s.durationSec));
      const r = Math.min(4, barW / 2, h);
      const label = `${dateFmt(s.startedAt)} · ${formatDuration(s.durationSec)} · ${
        s.result === 'good' ? 'Went well' : "Didn't go well"
      }`;
      return `
    <g class="bar ${s.result}" data-id="${s.id}" tabindex="0" role="img" aria-label="${label}">
      <rect class="hit" x="${PAD.left + i * slot}" y="${PAD.top}" width="${slot}" height="${plotH}"/>
      <path class="mark" d="${roundedTopBar(x, baseline, barW, h, r)}"/>
    </g>`;
    })
    .join('');

  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const xLabels = `
    <text class="axis" x="${PAD.left}" y="${H - 8}" text-anchor="start">${dateFmt(first.startedAt)}</text>
    ${
      sessions.length > 1
        ? `<text class="axis" x="${W - PAD.right}" y="${H - 8}" text-anchor="end">${dateFmt(last.startedAt)}</text>`
        : ''
    }`;

  return `
<svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Session duration over time">
  <defs>
    <pattern id="stripe" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" class="stripe-bg"/>
      <line x1="0" y1="0" x2="0" y2="5" class="stripe-line"/>
    </pattern>
  </defs>
  ${grid}
  <line class="baseline" x1="${PAD.left}" x2="${W - PAD.right}" y1="${baseline}" y2="${baseline}"/>
  ${bars}
  ${xLabels}
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
