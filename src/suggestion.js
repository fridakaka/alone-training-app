// Time suggestion ("tidsförslag") for the next session in ONE training context.
//
// Pure and deterministic: same sessions + same `now` => same answer. Nothing is
// stored; the suggestion is always derived from the logged history.
// The model is described in docs/SUGGESTION-MODEL.md – keep the two in sync.
//
// These are preliminary product rules for a training journal, NOT validated
// training advice, and not an estimate of how long a dog can safely be alone.

import { floorNatural, gridFor } from './progression.js';

export const SUGGESTION_SETTINGS = Object.freeze({
  // History window
  WINDOW_DAYS: 7, // only sessions from the last 7 × 24 h
  MAX_SESSIONS: 5, // at most the 5 most recent relevant sessions
  RECENCY_DECAY: 0.8, // weight = 0.8^rank (newest rank 0) ...
  //                     ... divided by the number of window sessions that calendar day
  MIN_WINDOW_SESSIONS: 2, // fewer than this => not enough for an automatic suggestion

  // What counts
  MIN_GOOD_SEC: 3, // "went well" shorter than this is treated as a mis-tap and ignored

  // Establishing a level
  SUPPORT_TOLERANCE: 0.9, // a session supports level L if it lasted >= 90 % of L
  ESTABLISH_MIN_SESSIONS: 2,
  ESTABLISH_MIN_DAYS: 2, // ...on at least 2 different days
  ESTABLISH_MIN_WEIGHT: 1.0, // ...and their recency weight adds up to at least this

  // Raising
  RAISE_RATIO: 0.1, // a raise is at most +10 % of the established level (rounded down)
  MAX_STEP_RATIO: 0.2, // at very short times: one grid step, but never more than +20 %

  // After a hard session
  BELOW_ONSET_RATIO: 0.8, // known onset of worry => suggest 80 % of it
  IMMEDIATE_ONSET_SEC: 10, // worry within 10 s => no time suggestion at all
  SHORTER_LEVEL_RATIO: 0.9, // unknown onset: earlier good sessions shorter than 90 % of the hard one...
  SHORTER_LEVEL_CAUTION: 0.8, // ...are used at 80 % of their weighted median
  RECOVERY_SESSIONS: 2, // the difficulty stays in force until 2 good sessions...
  RECOVERY_MIN_RATIO: 0.5, // ...each at least 50 % of the easier suggestion

  // After a break (nothing relevant in the window)
  RETURN_RATIO: 0.5, // cautious restart at 50 % of the level established before the break

  // "Repeat" button: offered only after a session that went well, and only if it is
  // not much longer than the suggestion (so one extreme session isn't offered as a target)
  REPEAT_MAX_RATIO: 1.5,
});

export const KINDS = Object.freeze({
  RAISE: 'raise', // several calm sessions at a similar time => small step up
  REPEAT: 'repeat', // keep the time until it is stable
  EASIER: 'easier', // shorter after a hard session
  HARD_CHOOSE: 'hard-choose', // hard session, no basis for a time => user picks an easy start
  WORRIED_AT_ONCE: 'worried-at-once', // worry started right away => no time from old successes
  RETURN: 'return', // careful return after a break
  RETURN_CHOOSE: 'return-choose', // break, and no established level to return from
  TOO_LITTLE: 'too-little', // too little recent history
  NONE: 'none', // nothing logged in this context
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param sessions sessions of ONE dog in ONE context (any order)
 * @param options.now current time in ms (inject in tests)
 * @returns {{ sec: number|null, kind: string, level: number|null, repeatSec: number|null }}
 *   sec    – the suggested target, or null when the user should choose an easy start
 *   level  – the level currently supported by several observations (null if none)
 *   repeatSec – the last relevant "went well" duration in the window, for the Repeat button
 */
export function suggestTarget(sessions, { now = Date.now(), settings = SUGGESTION_SETTINGS } = {}) {
  const S = settings;
  const { base, lastRelevant } = decide(sessions, now, S);
  let repeatSec = null;
  const offerRepeat = ![KINDS.EASIER, KINDS.HARD_CHOOSE, KINDS.WORRIED_AT_ONCE, KINDS.RETURN, KINDS.RETURN_CHOOSE].includes(base.kind);
  if (offerRepeat && lastRelevant?.result === 'good') {
    repeatSec = floorNatural(lastRelevant.durationSec);
    if (base.sec != null && repeatSec > base.sec * S.REPEAT_MAX_RATIO) repeatSec = null;
  }
  return { ...base, repeatSec };
}

function decide(sessions, now, S) {
  const out = (base, lastRelevant = null) => ({ base, lastRelevant });
  const logged = sessions.filter(isValid).sort((a, b) => a.startedAt - b.startedAt);
  if (!logged.length) return out(result(KINDS.NONE));

  const relevant = logged.filter((s) => isRelevant(s, S));
  const since = now - S.WINDOW_DAYS * DAY_MS;
  const window = relevant.filter((s) => s.startedAt >= since && s.startedAt <= now).slice(-S.MAX_SESSIONS);
  const beforeWindow = relevant.filter((s) => s.startedAt < since);
  const w = weights(window, S);
  if (!window.length) return out(returnFromBreak(beforeWindow, S));
  const last = window[window.length - 1];

  // 1. A recent hard session overrides older successes until it is "recovered".
  const hard = activeDifficulty(window, w, S);
  if (hard) return out(hard, last);

  // 2. Too little recent evidence.
  if (window.length < S.MIN_WINDOW_SESSIONS) {
    return out(beforeWindow.length ? returnFromBreak(beforeWindow, S) : result(KINDS.TOO_LITTLE), last);
  }

  // 3. Only evidence after the most recent hard session counts for the level.
  const lastBad = findLastIndex(window, (s) => s.result !== 'good');
  const evidence = window.slice(lastBad + 1);
  const ew = w.slice(lastBad + 1);
  const level = establishedLevel(evidence, ew, S);

  if (level) {
    const confirmsLevel = last.result === 'good' && last.durationSec >= S.SUPPORT_TOLERANCE * level;
    if (confirmsLevel) {
      const up = raiseFrom(level, S);
      if (up > level) return out(result(KINDS.RAISE, up, level), last);
    }
    return out(result(KINDS.REPEAT, level, level), last);
  }

  // 4. Not established yet (e.g. all on one day): repeat a robust typical good time.
  const goods = evidence.map((s, i) => [s, ew[i]]).filter(([s]) => s.result === 'good');
  if (goods.length) {
    const typical = weightedMedian(goods.map(([s, wt]) => [s.durationSec, wt]));
    return out(result(KINDS.REPEAT, floorNatural(typical)), last);
  }
  return out(result(KINDS.TOO_LITTLE), last);
}

// ---------- building blocks (exported for tests) ----------

function isValid(s) {
  return s && Number.isFinite(s.startedAt) && Number.isFinite(s.durationSec) && s.durationSec >= 0 &&
    (s.result === 'good' || s.result === 'bad');
}

// Relevant = usable as an observation.
// - "Didn't go well" is always relevant, however short (a short hard session is never ignored).
// - "Went well" is relevant unless marked "don't count" (uncertain) or shorter than MIN_GOOD_SEC.
export function isRelevant(s, S = SUGGESTION_SETTINGS) {
  if (s.result !== 'good') return true;
  return !s.uncertain && s.durationSec >= S.MIN_GOOD_SEC;
}

// Newer sessions weigh more; several sessions on the same calendar day share one day's weight.
export function weights(window, S = SUGGESTION_SETTINGS) {
  const perDay = new Map();
  for (const s of window) perDay.set(dayKey(s.startedAt), (perDay.get(dayKey(s.startedAt)) || 0) + 1);
  return window.map((s, i) => {
    const rank = window.length - 1 - i;
    return S.RECENCY_DECAY ** rank / perDay.get(dayKey(s.startedAt));
  });
}

export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// The longest duration D that several recent "went well" sessions reached (>= 90 % of D),
// on at least two different days, with enough recency weight. One long session alone,
// or many sessions on one day, cannot establish a level.
export function establishedLevel(sessions, w, S = SUGGESTION_SETTINGS) {
  const goods = sessions.map((s, i) => [s, w[i]]).filter(([s]) => s.result === 'good');
  const candidates = [...new Set(goods.map(([s]) => s.durationSec))].sort((a, b) => b - a);
  for (const d of candidates) {
    const support = goods.filter(([s]) => s.durationSec >= S.SUPPORT_TOLERANCE * d);
    const days = new Set(support.map(([s]) => dayKey(s.startedAt))).size;
    const weight = support.reduce((sum, [, wt]) => sum + wt, 0);
    if (support.length >= S.ESTABLISH_MIN_SESSIONS && days >= S.ESTABLISH_MIN_DAYS && weight >= S.ESTABLISH_MIN_WEIGHT - 1e-9) {
      return floorNatural(d);
    }
  }
  return null;
}

// At most +10 %, rounded DOWN. If rounding leaves no increase, one grid step is allowed
// only when that step is at most +20 % (very short times); otherwise keep the level.
export function raiseFrom(level, S = SUGGESTION_SETTINGS) {
  const up = floorNatural(level * (1 + S.RAISE_RATIO));
  if (up > level) return up;
  const step = level + gridFor(level);
  return step <= level * (1 + S.MAX_STEP_RATIO) ? step : level;
}

export function weightedMedian(pairs) {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((sum, [, wt]) => sum + wt, 0);
  let acc = 0;
  for (const [v, wt] of sorted) {
    acc += wt;
    if (acc >= total / 2 - 1e-9) return v;
  }
  return sorted.length ? sorted[sorted.length - 1][0] : null;
}

// The most recent "didn't go well" in the window, unless it has been followed by
// RECOVERY_SESSIONS good sessions of a meaningful length.
function activeDifficulty(window, w, S) {
  const i = findLastIndex(window, (s) => s.result !== 'good');
  if (i < 0) return null;
  const hard = window[i];
  let sec = null;
  let kind;

  if (Number.isFinite(hard.anxietyOnsetSec)) {
    // Worry started at a known time: stay below it. Never use the full end time.
    const below = floorNatural(hard.anxietyOnsetSec * S.BELOW_ONSET_RATIO);
    if (hard.anxietyOnsetSec < S.IMMEDIATE_ONSET_SEC || below < 1) {
      kind = KINDS.WORRIED_AT_ONCE;
    } else {
      sec = below;
      kind = KINDS.EASIER;
    }
  } else {
    // Unknown onset: the end time says nothing about when worry started.
    // Fall back to an earlier, clearly shorter level that went well – or let the user choose.
    const shorter = window
      .slice(0, i)
      .map((s, j) => [s, w[j]])
      .filter(([s]) => s.result === 'good' && s.durationSec < hard.durationSec * S.SHORTER_LEVEL_RATIO);
    if (shorter.length) {
      const typical = weightedMedian(shorter.map(([s, wt]) => [s.durationSec, wt]));
      sec = floorNatural(typical * S.SHORTER_LEVEL_CAUTION) || null;
    }
    kind = sec ? KINDS.EASIER : KINDS.HARD_CHOOSE;
  }

  const minRecovery = Math.max(S.MIN_GOOD_SEC, S.RECOVERY_MIN_RATIO * (sec ?? 0));
  const recovered = window.slice(i + 1).filter((s) => s.result === 'good' && s.durationSec >= minRecovery);
  if (recovered.length >= S.RECOVERY_SESSIONS) return null;
  return result(kind, sec);
}

// Nothing (or almost nothing) logged recently. Old history is kept but not used as
// current ability: restart at a fixed share of the level established before the break,
// or let the user choose an easy start. No per-day decay is invented.
function returnFromBreak(before, S) {
  if (!before.length) return result(KINDS.TOO_LITTLE);
  const lastOld = before[before.length - 1];
  if (lastOld.result !== 'good') return result(KINDS.RETURN_CHOOSE);
  const oldWindow = before
    .filter((s) => s.startedAt >= lastOld.startedAt - S.WINDOW_DAYS * DAY_MS)
    .slice(-S.MAX_SESSIONS);
  const lastBad = findLastIndex(oldWindow, (s) => s.result !== 'good');
  const evidence = oldWindow.slice(lastBad + 1);
  const oldLevel = establishedLevel(evidence, weights(oldWindow, S).slice(lastBad + 1), S);
  if (!oldLevel) return result(KINDS.RETURN_CHOOSE);
  const sec = floorNatural(oldLevel * S.RETURN_RATIO);
  return sec >= 1 ? result(KINDS.RETURN, sec) : result(KINDS.RETURN_CHOOSE);
}

function result(kind, sec = null, level = null) {
  return { kind, sec, level };
}

function findLastIndex(arr, fn) {
  for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) return i;
  return -1;
}
