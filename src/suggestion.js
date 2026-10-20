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
// v0.12: the level is the TYPICAL LEVEL of the latest good sessions (since the latest break):
// the longest time that at least 3 of the latest 10 good sessions reached. One or two extreme
// sessions – very long or very short – don't move it.
// - The two latest sessions (not counting ones that ended early) went well at it => +10 %.
// - A good session that ends earlier than the suggestion is neutral: it never lowers it.
// - A hard session lowers the suggestion (below the worry time, if known); good sessions then
//   lead back to the typical level from before it in at most 3 steps.
// - After a break (7 days without sessions) everything starts over without an automatic time.
//   The earlier stable level is then shown as history only – never a target or a floor.

import { floorNatural, gridFor } from './progression.js';

export const SUGGESTION_SETTINGS = Object.freeze({
  WINDOW_DAYS: 7, // no session for 7 × 24 h => a break: start over, no automatic time

  // A time counts as "supported" by a good session that lasted at least 90 % of it
  SUPPORT_TOLERANCE: 0.9,
  // A good session "confirms" today's suggestion when it lasted at least 95 % of it.
  // Shorter good sessions are neutral: kept as observations, but they never lower the level.
  CONFIRM_TOLERANCE: 0.95,
  // A level needs this many supporting good sessions. One single session can only anchor the
  // time that was planned for it (the smaller of plan and actual).
  ANCHOR_MIN_SESSIONS: 2,
  // TYPICAL LEVEL: the longest time that at least 3 of the latest 10 good sessions reached.
  // One or two extreme sessions – very long or very short – don't move it. Once older sessions
  // drop out of the latest 10, the level follows the newer ones.
  TYPICAL_SESSIONS: 10,
  TYPICAL_MIN_SUPPORT: 3,

  // Raising
  CONFIRMS_TO_RAISE: 2, // the two latest sessions went well at the level => small increase
  RAISE_RATIO: 0.1, // at most +10 %, rounded down
  MAX_STEP_RATIO: 0.2, // very short times: one grid step, never more than +20 %

  // After a hard session
  BELOW_ONSET_RATIO: 0.8, // known worry time => 80 % of it
  IMMEDIATE_ONSET_SEC: 10, // worry within 10 s => no automatic time
  SHORTER_LEVEL_RATIO: 0.9, // unknown worry time: good sessions shorter than 90 % of the hard one...
  SHORTER_LEVEL_CAUTION: 0.8, // ...their supported time × 0.8
  RECOVERY_SESSIONS: 2, // "no time" after a hard session lasts until 2 good sessions have followed
  RECOVERY_STEPS: 3, // back to the level from before a setback in at most 3 confirmed sessions
  RECOVERY_MAX_STEP: 2, // ...but never more than doubling in one step

  // "Repeat" button: never offered for a time much longer than the suggestion
  REPEAT_MAX_RATIO: 1.5,
});

export const KINDS = Object.freeze({
  RAISE: 'raise', // two good sessions at the level => small step up
  REPEAT: 'repeat', // a level, not (yet) confirmed twice => same time
  RECOVER: 'recover', // on the way back to the level from before a hard session
  LIMITED: 'limited', // thin basis => repeat a supported, cautious time (or none: user chooses)
  EASIER: 'easier', // a hard session (the latest, or a recent one) => shorter
  HARD_CHOOSE: 'hard-choose', // a hard session, no basis for a time => user chooses
  WORRIED_AT_ONCE: 'worried-at-once', // worry from the start => no automatic time
  BREAK: 'break', // nothing logged in the window => user chooses
  TOO_LITTLE: 'too-little', // logged recently, but nothing usable (e.g. all marked "don't count")
  NONE: 'none', // nothing logged in this context
});

// Which hard session limits the suggestion (for EASIER / RECOVER / HARD_CHOOSE / WORRIED_AT_ONCE):
// LATEST – the latest session itself didn't go well;
// RECENT – an earlier session didn't go well and still limits the suggestion, although the
//          latest one went well.
export const HARD = Object.freeze({ LATEST: 'latest', RECENT: 'recent' });

// Extra detail for the explanation of REPEAT / RAISE / RECOVER.
export const NOTES = Object.freeze({
  SHORTER: 'shorter', // the latest good session ended before the suggestion – it did not lower it
  ONCE: 'once', // the level went well once – once more before it goes up
  BACK: 'back', // just back at the level from before the hard session
  FOLLOW: 'follow', // several good sessions in a row were shorter: the suggestion followed them
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param sessions sessions of ONE dog in ONE context (any order)
 * @param options.now current time in ms (inject in tests)
 * @returns {{ kind, sec, level, repeatSec, earlierLevel, hard, fromOnset, note, step, backTo }}
 *   sec          – today's suggested target, or null (the user chooses)
 *   level        – the current level (confirmed time), or null
 *   repeatSec    – the latest good time, for the Repeat button (null when not relevant)
 *   earlierLevel – earlier stable level from before the current window (history only), or null
 *   hard         – HARD.LATEST / HARD.RECENT when a hard session decides the suggestion, else null
 *   fromOnset    – true when that limit comes from an entered worry time
 *   note         – NOTES.* or null
 *   step, backTo – RECOVER: step n of RECOVERY_STEPS towards the earlier level `backTo`
 */
export function suggestTarget(sessions, { now = Date.now(), settings = SUGGESTION_SETTINGS } = {}) {
  const S = settings;
  const logged = sessions.filter(isValid).filter((s) => s.startedAt <= now).sort((a, b) => a.startedAt - b.startedAt);
  const since = now - S.WINDOW_DAYS * DAY_MS;
  const relevant = logged.filter(isRelevant);
  const earlierLevel = stableLevelBefore(relevant, since, S);
  const base = decide(logged, relevant, since, S);

  let repeatSec = null;
  // Repeat is only offered next to an actual suggestion, right after a session that went well,
  // and never far above the suggestion.
  if ([KINDS.RAISE, KINDS.REPEAT, KINDS.LIMITED, KINDS.RECOVER].includes(base.kind) && base.lastGood && base.sec != null) {
    repeatSec = floorNatural(base.lastGood.durationSec);
    if (repeatSec > base.sec * S.REPEAT_MAX_RATIO || repeatSec < 1) repeatSec = null;
  }
  return {
    kind: base.kind, sec: base.sec ?? null, level: base.level ?? null, repeatSec, earlierLevel,
    hard: base.hard ?? null, fromOnset: base.fromOnset === true, note: base.note ?? null,
    step: base.step ?? null, backTo: base.backTo ?? null,
  };
}

function decide(logged, relevant, since, S) {
  if (!logged.length) return { kind: KINDS.NONE };
  const last = relevant[relevant.length - 1];
  if (!last || last.startedAt < since) {
    const loggedRecently = logged.some((s) => s.startedAt >= since);
    return { kind: loggedRecently ? KINDS.TOO_LITTLE : KINDS.BREAK };
  }
  const streak = currentStreak(relevant, S);
  const goods = streak.filter((s) => s.result === 'good');
  const lastGood = last.result === 'good' ? last : null;

  // The level: the TYPICAL level of the latest good sessions (3 of the latest 10). At the very
  // start (fewer sessions) a cautious anchor: 2 sessions, or 1 session's planned time.
  const typical = typicalLevel(goods, S);
  const level = typical ?? anchor(goods, S);

  const hardIdx = findLastIndex(streak, (s) => s.result !== 'good');
  let note = null;
  let lvl = level;
  if (hardIdx >= 0) {
    const limited = afterHardSession(streak, hardIdx, S);
    if (limited?.back) {
      // Just back at the level from before the hard session.
      lvl = Math.max(level ?? 0, limited.goal);
      note = NOTES.BACK;
    } else if (limited) {
      return { ...limited, lastGood, hard: limited.hard ?? (lastGood ? HARD.RECENT : HARD.LATEST) };
    }
  }
  if (lvl == null) return { kind: KINDS.LIMITED, lastGood };
  // Start: one single session only anchors its planned time – repeat it.
  if (typical == null && note == null && goods.length < S.ANCHOR_MIN_SESSIONS) return { kind: KINDS.LIMITED, sec: lvl, level: lvl, lastGood };
  // Older sessions dropped out of the latest 10 and the level went down with them.
  if (note == null && lastGood && typical != null && typical < (typicalLevel(goods.slice(0, -1), S) ?? 0)) note = NOTES.FOLLOW;
  return atLevel(streak, lvl, lastGood, S, note);
}

// No hard session limits the suggestion: the level, or a small increase once the two latest
// sessions went well at it. A session that ended earlier changes nothing.
function atLevel(streak, level, lastGood, S, note = null) {
  const atIt = (s) => s.result === 'good' && s.durationSec >= S.CONFIRM_TOLERANCE * level;
  // Good sessions that ended earlier are skipped: they neither count nor take an increase away.
  const suggestionFor = (list) => {
    const counted = list.filter((s) => s.result !== 'good' || atIt(s)).slice(-2);
    return counted.length === 2 && counted.every(atIt) ? raiseFrom(level, S) : level;
  };
  const sec = suggestionFor(streak);
  const counted = streak.filter((s) => s.result !== 'good' || atIt(s)).slice(-2);
  const out = { sec, level, lastGood };
  // "Shorter": the latest session ended before the suggestion that applied to it.
  const shorter = lastGood && lastGood.durationSec < S.CONFIRM_TOLERANCE * suggestionFor(streak.slice(0, -1));
  if (note === NOTES.FOLLOW || note === NOTES.BACK) return { ...out, kind: sec > level ? KINDS.RAISE : KINDS.REPEAT, note };
  if (sec > level) return { ...out, kind: KINDS.RAISE, note: shorter ? NOTES.SHORTER : null };
  if (shorter) return { ...out, kind: KINDS.REPEAT, note: NOTES.SHORTER };
  return { ...out, kind: KINDS.REPEAT, note: counted.length && atIt(counted[counted.length - 1]) ? NOTES.ONCE : null };
}

// The latest hard session: lower (below the worry time, if known), then back to the typical
// level in at most RECOVERY_STEPS good sessions. Returns null when it no longer limits.
function afterHardSession(streak, hardIdx, S) {
  const hard = streak[hardIdx];
  const before = streak.slice(0, hardIdx).filter((s) => s.result === 'good');
  const after = streak.slice(hardIdx + 1); // all good (it is the latest hard session)
  const d = difficulty(hard, before, S);
  // The level to return to: the typical level of the good sessions BEFORE the hard one –
  // single extreme sessions don't count (at the very start: the cautious anchor).
  const goal = typicalLevel(before, S) ?? anchor(before, S);

  // Start of the way back: the lowered time, or – after "no time" – what 2 good sessions support.
  let start = d.sec;
  let rest = after;
  if (start == null) {
    if (after.length < S.RECOVERY_SESSIONS) return { kind: d.kind, fromOnset: d.fromOnset };
    start = anchor(after.slice(0, S.RECOVERY_SESSIONS), S);
    rest = after.slice(S.RECOVERY_SESSIONS);
    if (goal == null) return null; // nothing to return to: the two good sessions are the start
  }
  if (goal != null && start >= goal) {
    // Already at or below what the hard session allows: same time. Right after it, say why.
    return after.length ? null : { kind: KINDS.EASIER, sec: goal, level: goal, fromOnset: d.fromOnset === true };
  }

  const fromOnset = d.fromOnset === true;
  if (goal == null) {
    // Too few sessions for a level: stay at the lowered time until two good sessions confirm it.
    const confirmed = rest.filter((s) => s.durationSec >= S.CONFIRM_TOLERANCE * start).length;
    if (confirmed < S.CONFIRMS_TO_RAISE) return { kind: KINDS.EASIER, sec: start, level: start, fromOnset };
    return null;
  }

  let sec = start;
  let step = 0;
  let neutral = false;
  for (const s of rest) {
    neutral = s.durationSec < S.CONFIRM_TOLERANCE * sec;
    if (neutral) continue; // ended earlier: changes nothing
    step += 1;
    const target = floorNatural(start + (step * (goal - start)) / S.RECOVERY_STEPS);
    sec = Math.min(goal, Math.max(Math.min(target, sec * S.RECOVERY_MAX_STEP), raiseFrom(sec, S)));
    if (sec >= goal) return s === rest[rest.length - 1] ? { back: true, goal } : null; // back at the level
  }
  if (step === 0) return { kind: KINDS.EASIER, sec, level: sec, fromOnset, note: neutral && rest.length ? NOTES.SHORTER : null };
  return { kind: KINDS.RECOVER, sec, level: sec, step, backTo: goal, hard: HARD.RECENT, note: neutral ? NOTES.SHORTER : null };
}

// Relevant sessions since the latest break (a gap of WINDOW_DAYS without sessions).
function currentStreak(relevant, S) {
  let start = 0;
  for (let i = 1; i < relevant.length; i++) {
    if (relevant[i].startedAt - relevant[i - 1].startedAt >= S.WINDOW_DAYS * DAY_MS) start = i;
  }
  return relevant.slice(start);
}

function findLastIndex(arr, fn) {
  for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) return i;
  return -1;
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

export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function support(goods, d, S) {
  return goods.filter((s) => s.durationSec >= S.SUPPORT_TOLERANCE * d).length;
}

// Cautious time from good sessions: the longest time supported by at least two of them.
// A single good session is confirmed by nothing else, so on its own it can only anchor the
// time that was PLANNED for it (min of plan and actual). Without a plan it gives no time.
export function anchor(sessions, S = SUGGESTION_SETTINGS, { singleAllowed = true } = {}) {
  const goods = sessions.filter((s) => s.result === 'good');
  if (!goods.length) return null;
  if (goods.length === 1) {
    if (!singleAllowed) return null;
    const [s] = goods;
    const planned = Number.isFinite(s.targetSec) && s.targetSec > 0 ? s.targetSec : null;
    return planned == null ? null : floorNatural(Math.min(s.durationSec, planned)) || null;
  }
  for (const d of distinctDesc(goods.map((s) => s.durationSec))) {
    if (support(goods, d, S) >= S.ANCHOR_MIN_SESSIONS) return floorNatural(d) || null;
  }
  return null;
}

// Typical level: the longest time that at least TYPICAL_MIN_SUPPORT of the latest TYPICAL_SESSIONS
// good sessions reached (≥ 90 %). Robust against single extreme sessions in both directions.
export function typicalLevel(goods, S = SUGGESTION_SETTINGS) {
  const latest = goods.filter((s) => s.result === 'good').slice(-S.TYPICAL_SESSIONS);
  if (latest.length < S.TYPICAL_MIN_SUPPORT) return null;
  for (const d of distinctDesc(latest.map((s) => s.durationSec))) {
    if (support(latest, d, S) >= S.TYPICAL_MIN_SUPPORT) return floorNatural(d) || null;
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

// What a hard session allows.
function difficulty(hard, goodsBefore, S) {
  if (Number.isFinite(hard.anxietyOnsetSec)) {
    // Known worry time: stay below it. The end time is never used as a tolerated time.
    const below = floorNatural(hard.anxietyOnsetSec * S.BELOW_ONSET_RATIO);
    if (hard.anxietyOnsetSec < S.IMMEDIATE_ONSET_SEC || below < 1) return { kind: KINDS.WORRIED_AT_ONCE, sec: null, fromOnset: true };
    return { kind: KINDS.EASIER, sec: below, fromOnset: true };
  }
  // Unknown worry time: an earlier, clearly shorter time that went well, used cautiously –
  // or the user chooses.
  const shorter = goodsBefore.filter((s) => s.durationSec < hard.durationSec * S.SHORTER_LEVEL_RATIO);
  const base = anchor(shorter, S);
  const sec = base ? floorNatural(base * S.SHORTER_LEVEL_CAUTION) : 0;
  return sec >= 1 ? { kind: KINDS.EASIER, sec } : { kind: KINDS.HARD_CHOOSE, sec: null };
}

// Earlier stable level (history only): the longest time supported by >= 2 good sessions on
// >= 2 different days within one window-length, among sessions from BEFORE the current window.
export function stableLevelBefore(relevant, since, S = SUGGESTION_SETTINGS) {
  const goods = relevant.filter((s) => s.result === 'good' && s.startedAt < since);
  for (const d of distinctDesc(goods.map((s) => s.durationSec))) {
    const supp = goods.filter((s) => s.durationSec >= S.SUPPORT_TOLERANCE * d);
    for (const s of supp) {
      const near = supp.filter((x) => Math.abs(x.startedAt - s.startedAt) <= S.WINDOW_DAYS * DAY_MS);
      if (near.length >= 2 && new Set(near.map((x) => dayKey(x.startedAt))).size >= 2) return floorNatural(d);
    }
  }
  return null;
}

function distinctDesc(values) {
  return [...new Set(values)].sort((a, b) => b - a);
}
