// Time suggestion ("tidsförslag") for the next session in ONE training context.
//
// Pure and deterministic: same sessions + same `now` => same answer. Nothing is
// stored; the suggestion is always derived from the logged history, so edits,
// deletions and restores are reflected immediately. Observations are never changed.
// The model is described in docs/SUGGESTION-MODEL.md – keep the two in sync.
//
// These are preliminary, adjustable product rules for a training journal – not
// validated training advice, and not a statement of what a dog can manage.
//
// Two separate ideas:
// - CURRENT BASIS: relevant sessions from the recent window. Only this decides today's suggestion.
// - EARLIER STABLE LEVEL: a longer time that was supported in the past. Shown as history only –
//   never a target, a share of a target, or a hidden floor.

import { floorNatural, gridFor } from './progression.js';

export const SUGGESTION_SETTINGS = Object.freeze({
  // Current basis (adjustable product choices, not biological limits)
  WINDOW_DAYS: 7, // only sessions from the last 7 × 24 h
  MAX_SESSIONS: 5, // at most the 5 most recent relevant sessions
  RECENCY_DECAY: 0.8, // weight = 0.8^rank (newest rank 0), shared by sessions on the same calendar day

  // A time counts as "supported" by a session that lasted at least 90 % of it
  SUPPORT_TOLERANCE: 0.9,
  // Established current level: supported by >= 2 good sessions on >= 2 different days,
  // with enough recency weight
  ESTABLISH_MIN_SESSIONS: 2,
  ESTABLISH_MIN_DAYS: 2,
  ESTABLISH_MIN_WEIGHT: 1.0,
  // Limited basis: the longest time supported by >= 2 good sessions (any days).
  // With a single session: that session (capped by its planned time, if it had one).
  ANCHOR_MIN_SESSIONS: 2,

  // Raising from an established current level
  RAISE_RATIO: 0.1, // at most +10 %, rounded down
  MAX_STEP_RATIO: 0.2, // very short times: one grid step, never more than +20 %

  // After a hard session
  BELOW_ONSET_RATIO: 0.8, // known worry time => stay at 80 % of it
  IMMEDIATE_ONSET_SEC: 10, // worry within 10 s => no positive time built from earlier sessions
  SHORTER_LEVEL_RATIO: 0.9, // unknown worry time: earlier good sessions shorter than 90 % of the hard one...
  SHORTER_LEVEL_CAUTION: 0.8, // ...their supported time × 0.8
  RECOVERY_SESSIONS: 2, // the cap from a hard session applies until 2 good sessions have followed

  // "Repeat" button: never offered for a time much longer than the suggestion
  REPEAT_MAX_RATIO: 1.5,
});

export const KINDS = Object.freeze({
  RAISE: 'raise', // established on different days and just confirmed => small step up
  REPEAT: 'repeat', // established, not confirmed by the latest session => same time
  LIMITED: 'limited', // current basis is thin => repeat a supported, cautious time (or none: user chooses)
  EASIER: 'easier', // latest session was hard => shorter
  HARD_CHOOSE: 'hard-choose', // latest session was hard, no basis for a time => user chooses
  WORRIED_AT_ONCE: 'worried-at-once', // worry from the start => no positive time
  BREAK: 'break', // nothing logged in the window => user chooses
  TOO_LITTLE: 'too-little', // logged recently, but nothing usable (e.g. all marked "don't count")
  NONE: 'none', // nothing logged in this context
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param sessions sessions of ONE dog in ONE context (any order)
 * @param options.now current time in ms (inject in tests)
 * @returns {{ kind, sec, level, repeatSec, earlierLevel }}
 *   sec          – today's suggested target, or null (the user chooses)
 *   level        – current level established by recent sessions on different days, or null
 *   repeatSec    – the latest good time, for the Repeat button (null when not relevant)
 *   earlierLevel – earlier stable level from before the current window (history only), or null
 */
export function suggestTarget(sessions, { now = Date.now(), settings = SUGGESTION_SETTINGS } = {}) {
  const S = settings;
  const logged = sessions.filter(isValid).sort((a, b) => a.startedAt - b.startedAt);
  const since = now - S.WINDOW_DAYS * DAY_MS;
  const relevant = logged.filter(isRelevant);
  const earlierLevel = stableLevelBefore(relevant, since, S);

  const base = decide(logged, relevant, since, now, S);
  let repeatSec = null;
  // Repeat is only offered next to an actual suggestion, and never far above it.
  if ([KINDS.RAISE, KINDS.REPEAT, KINDS.LIMITED].includes(base.kind) && base.lastGood && base.sec != null) {
    repeatSec = floorNatural(base.lastGood.durationSec);
    if (repeatSec > base.sec * S.REPEAT_MAX_RATIO) repeatSec = null;
  }
  return { kind: base.kind, sec: base.sec, level: base.level ?? null, repeatSec, earlierLevel };
}

function decide(logged, relevant, since, now, S) {
  if (!logged.length) return { kind: KINDS.NONE, sec: null };
  const window = relevant.filter((s) => s.startedAt >= since && s.startedAt <= now).slice(-S.MAX_SESSIONS);
  if (!window.length) {
    const loggedRecently = logged.some((s) => s.startedAt >= since && s.startedAt <= now);
    return { kind: loggedRecently ? KINDS.TOO_LITTLE : KINDS.BREAK, sec: null };
  }
  const w = weights(window, S);
  const last = window[window.length - 1];

  // Only sessions AFTER the latest hard session describe the current level.
  const hardIdx = findLastIndex(window, (s) => s.result !== 'good');
  const after = window.slice(hardIdx + 1).map((s, i) => [s, w[hardIdx + 1 + i]]);
  const lastGood = after.length ? after[after.length - 1][0] : null;

  // 1. Latest session hard, nothing good since: the difficulty decides.
  if (hardIdx >= 0 && !after.length) return difficulty(window, w, hardIdx, S);

  // 2. Current level from good sessions since then.
  const level = establishedLevel(after, S);
  let out;
  if (level) {
    const confirms = last.result === 'good' && last.durationSec >= S.SUPPORT_TOLERANCE * level;
    const up = confirms ? raiseFrom(level, S) : level;
    out = up > level ? { kind: KINDS.RAISE, sec: up, level } : { kind: KINDS.REPEAT, sec: level, level };
  } else {
    out = { kind: KINDS.LIMITED, sec: anchor(after.map(([s]) => s), S) };
  }

  // 3. A recent hard session still limits the suggestion until enough good sessions followed.
  //    "No time" from the hard session (worry from the start, or no shorter basis) is a limit
  //    too – not the absence of one: it stays in force until RECOVERY_SESSIONS good sessions.
  if (hardIdx >= 0 && after.length < S.RECOVERY_SESSIONS) {
    const hard = difficulty(window, w, hardIdx, S);
    if (hard.sec == null) return { ...hard, lastGood };
    if (out.sec == null || out.sec > hard.sec) out = { kind: KINDS.EASIER, sec: hard.sec };
  }
  return { ...out, lastGood };
}

// ---------- building blocks (exported for tests) ----------

function isValid(s) {
  return s && Number.isFinite(s.startedAt) && Number.isFinite(s.durationSec) && s.durationSec >= 0 &&
    (s.result === 'good' || s.result === 'bad');
}

// Relevant = usable as an observation. "Didn't go well" always, however short.
// "Went well" always – also 1–2 s – unless the user marked it "don't count".
export function isRelevant(s) {
  return s.result !== 'good' || !s.uncertain;
}

// Newer sessions weigh more; sessions on the same calendar day share that day's weight.
export function weights(window, S = SUGGESTION_SETTINGS) {
  const perDay = new Map();
  for (const s of window) perDay.set(dayKey(s.startedAt), (perDay.get(dayKey(s.startedAt)) || 0) + 1);
  return window.map((s, i) => S.RECENCY_DECAY ** (window.length - 1 - i) / perDay.get(dayKey(s.startedAt)));
}

export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Longest time D that good sessions reached (>= 90 % of D) at least twice, on at least two
// different days, with enough recency weight. Input: [session, weight] pairs.
// A single long session or many sessions on one day cannot establish a level.
export function establishedLevel(pairs, S = SUGGESTION_SETTINGS) {
  const goods = pairs.filter(([s]) => s.result === 'good');
  for (const d of distinctDesc(goods.map(([s]) => s.durationSec))) {
    const support = goods.filter(([s]) => s.durationSec >= S.SUPPORT_TOLERANCE * d);
    const days = new Set(support.map(([s]) => dayKey(s.startedAt))).size;
    const weight = support.reduce((sum, [, wt]) => sum + wt, 0);
    if (support.length >= S.ESTABLISH_MIN_SESSIONS && days >= S.ESTABLISH_MIN_DAYS &&
        weight >= S.ESTABLISH_MIN_WEIGHT - 1e-9) {
      return floorNatural(d);
    }
  }
  return null;
}

// Cautious time when the basis is thin: the longest time supported by at least two good
// sessions. A single good session is confirmed by nothing else, so on its own it can only
// anchor the time that was PLANNED for it (min of plan and actual). Without a plan it gives
// no automatic target – it is kept and counts as soon as another session supports it.
export function anchor(sessions, S = SUGGESTION_SETTINGS) {
  const goods = sessions.filter((s) => s.result === 'good');
  if (!goods.length) return null;
  if (goods.length === 1) {
    const [s] = goods;
    const planned = Number.isFinite(s.targetSec) && s.targetSec > 0 ? s.targetSec : null;
    return planned == null ? null : floorNatural(Math.min(s.durationSec, planned)) || null;
  }
  for (const d of distinctDesc(goods.map((s) => s.durationSec))) {
    const support = goods.filter((s) => s.durationSec >= S.SUPPORT_TOLERANCE * d).length;
    if (support >= S.ANCHOR_MIN_SESSIONS) return floorNatural(d);
  }
  return null;
}

// At most +10 %, rounded DOWN. If rounding leaves no increase, one grid step is allowed
// only when that step is at most +20 % (very short times); otherwise keep the level.
export function raiseFrom(level, S = SUGGESTION_SETTINGS) {
  const up = floorNatural(level * (1 + S.RAISE_RATIO));
  if (up > level) return up;
  const step = level + gridFor(level);
  return step <= level * (1 + S.MAX_STEP_RATIO) + 1e-9 ? step : level;
}

// What the latest hard session allows, looking only at the current window.
function difficulty(window, w, i, S) {
  const hard = window[i];
  if (Number.isFinite(hard.anxietyOnsetSec)) {
    // Known worry time: stay below it. The end time is never used as a tolerated time.
    const below = floorNatural(hard.anxietyOnsetSec * S.BELOW_ONSET_RATIO);
    if (hard.anxietyOnsetSec < S.IMMEDIATE_ONSET_SEC || below < 1) return { kind: KINDS.WORRIED_AT_ONCE, sec: null };
    return { kind: KINDS.EASIER, sec: below };
  }
  // Unknown worry time: an earlier, clearly shorter time that went well (in the current
  // window, before the hard session), used cautiously – or the user chooses.
  const shorter = window
    .slice(0, i)
    .filter((s) => s.result === 'good' && s.durationSec < hard.durationSec * S.SHORTER_LEVEL_RATIO);
  const base = anchor(shorter, S);
  const sec = base ? floorNatural(base * S.SHORTER_LEVEL_CAUTION) : 0;
  return sec >= 1 ? { kind: KINDS.EASIER, sec } : { kind: KINDS.HARD_CHOOSE, sec: null };
}

// Earlier stable level (history only): the longest time supported by >= 2 good sessions on
// >= 2 different days within one window-length, among sessions from BEFORE the current window.
export function stableLevelBefore(relevant, since, S = SUGGESTION_SETTINGS) {
  const goods = relevant.filter((s) => s.result === 'good' && s.startedAt < since);
  let best = null;
  for (const d of distinctDesc(goods.map((s) => s.durationSec))) {
    if (best != null) break;
    const support = goods.filter((s) => s.durationSec >= S.SUPPORT_TOLERANCE * d);
    for (const s of support) {
      const near = support.filter((x) => Math.abs(x.startedAt - s.startedAt) <= S.WINDOW_DAYS * DAY_MS);
      if (near.length >= S.ESTABLISH_MIN_SESSIONS && new Set(near.map((x) => dayKey(x.startedAt))).size >= S.ESTABLISH_MIN_DAYS) {
        best = floorNatural(d);
        break;
      }
    }
  }
  return best;
}

function distinctDesc(values) {
  return [...new Set(values)].sort((a, b) => b - a);
}

function findLastIndex(arr, fn) {
  for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) return i;
  return -1;
}
