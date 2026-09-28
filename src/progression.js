// Suggested next duration. Pure functions, no DOM, no storage.
// Rules are documented in docs/PLAN-v0.2.md – keep the two in sync.

export const GROWTH = 0.1; // ±10 %
export const MIN_TARGET_SEC = 5;

// Rounding step for a duration of this size (seconds).
export function stepFor(sec) {
  if (sec < 60) return 5;
  if (sec < 5 * 60) return 15;
  if (sec < 15 * 60) return 30;
  if (sec < 60 * 60) return 60;
  return 5 * 60;
}

export function roundNatural(sec) {
  const step = stepFor(sec);
  return Math.max(MIN_TARGET_SEC, Math.round(sec / step) * step);
}

// `sessions` must be the history of ONE dog in ONE context, oldest first.
export function lastSession(sessions) {
  return sessions.length ? sessions[sessions.length - 1] : null;
}

export function suggestNext(sessions) {
  const last = lastSession(sessions);
  if (!last) return null;
  const base = roundNatural(last.durationSec);
  if (last.result === 'good') {
    const next = roundNatural(last.durationSec * (1 + GROWTH));
    return next > base ? next : base + stepFor(base);
  }
  const next = roundNatural(last.durationSec * (1 - GROWTH));
  if (next < base) return next;
  return Math.max(MIN_TARGET_SEC, stepDown(base));
}

// "Repeat" option after a good session: roughly the same duration again.
export function repeatLast(sessions) {
  const last = lastSession(sessions);
  return last && last.result === 'good' ? roundNatural(last.durationSec) : null;
}

// Manual − / + adjustments. Snaps to the natural grid of the new size.
export function stepUp(sec) {
  if (!sec) return 60; // from "no target", start at 1 minute
  const next = sec + stepFor(sec);
  const step = stepFor(next);
  const down = Math.floor(next / step) * step; // e.g. 4:55 + 15 s -> 5:00, not 5:30
  return down > sec ? down : Math.ceil(next / step) * step;
}

export function stepDown(sec) {
  if (!sec) return null;
  const next = sec - stepFor(sec - 1);
  return next < MIN_TARGET_SEC ? MIN_TARGET_SEC : snapDown(next);
}

function snapDown(sec) {
  const step = stepFor(sec);
  return Math.max(MIN_TARGET_SEC, Math.floor(sec / step) * step);
}

// Target display, e.g. "0:45", "4:30", "1:05:00".
export function formatTarget(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
