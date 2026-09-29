// Time values: rounding, manual −/+ steps and formatting. Pure functions.
// The time suggestion itself lives in suggestion.js.

export const MIN_TARGET_SEC = 1; // manual targets from 1 second

// Step for the manual − / + buttons (seconds). Coarse enough to be quick to tap.
export function stepFor(sec) {
  if (sec < 10) return 1;
  if (sec < 60) return 5;
  if (sec < 5 * 60) return 15;
  if (sec < 15 * 60) return 30;
  if (sec < 60 * 60) return 60;
  return 5 * 60;
}

// Rounding grid for time suggestions. Finer than the button steps at short
// times, so that rounding never turns a small change into a big relative jump
// (at the start of each band the grid is at most ~8 % of the value).
export function gridFor(sec) {
  if (sec < 30) return 1;
  if (sec < 2 * 60) return 5;
  if (sec < 5 * 60) return 15;
  if (sec < 15 * 60) return 30;
  if (sec < 60 * 60) return 60;
  return 5 * 60;
}

export function roundNatural(sec) {
  const grid = gridFor(sec);
  return Math.max(MIN_TARGET_SEC, Math.round(sec / grid) * grid);
}

// Rounds DOWN to the suggestion grid: a suggestion never exceeds the value it came from.
export function floorNatural(sec) {
  if (!(sec >= 1)) return 0;
  const grid = gridFor(sec);
  return Math.max(1, Math.floor(sec / grid) * grid);
}

// Manual − / + adjustments. Snaps to the natural grid of the new size.
export function stepUp(sec) {
  if (!sec) return null; // from "no target" the app asks for a time instead of guessing one
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
