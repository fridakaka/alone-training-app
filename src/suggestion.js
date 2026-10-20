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
// v0.11: a CURRENT LEVEL that is carried forward session by session (since the latest break):
// - Two good sessions at the level => a small increase (+10 %). Same day or different days.
// - A good session that ends earlier than the suggestion is neutral: it never lowers it.
// - A hard session lowers the level (below the worry time, if known). The level from before
//   the setback is remembered, and good sessions then lead back to it in at most 3 steps –
//   faster than climbing there for the first time.
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
  // ...but when this many good sessions IN A ROW end before the suggestion, it follows them
  // (the longest time at least two of them support) – an old level is not kept forever.
  SHORTER_RUN_TO_FOLLOW: 3,
  // A level needs this many supporting good sessions. One single session can only anchor the
  // time that was planned for it (the smaller of plan and actual).
  ANCHOR_MIN_SESSIONS: 2,

  // Raising
  CONFIRMS_TO_RAISE: 2, // two good sessions at the level => small increase
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
  const st = replay(currentStreak(relevant, S), S);
  const lastGood = last.result === 'good' ? last : null;
  const hard = st.setback ? (last.result === 'good' ? HARD.RECENT : HARD.LATEST) : null;

  // No time after a hard session (worry from the start, or no shorter basis).
  if (st.level == null && st.setback?.kind) {
    return { kind: st.setback.kind, hard, fromOnset: st.setback.fromOnset };
  }
  if (st.level == null) return { kind: KINDS.LIMITED, lastGood };

  // On the way back after a setback the steps decide; otherwise two confirmations raise.
  const suggestion = st.backTo == null && st.confirms >= S.CONFIRMS_TO_RAISE ? raiseFrom(st.level, S) : st.level;
  const shorter = lastGood && st.neutral ? NOTES.SHORTER : null;
  const out = { sec: suggestion, level: st.level, lastGood };

  if (st.backTo != null) {
    // After a hard session: lower until a good session confirms, then back in steps.
    if (st.step === 0) return { ...out, kind: KINDS.EASIER, hard, fromOnset: st.setback.fromOnset };
    return { ...out, kind: KINDS.RECOVER, hard: HARD.RECENT, step: st.step, backTo: st.backTo, note: shorter };
  }
  if (st.setback && !st.setback.cleared) {
    // Lowered by a hard session without an earlier level to return to.
    return { ...out, kind: KINDS.EASIER, hard, fromOnset: st.setback.fromOnset };
  }
  if (st.single) return { ...out, kind: KINDS.LIMITED };
  if (st.followed) return { ...out, kind: suggestion > st.level ? KINDS.RAISE : KINDS.REPEAT, note: NOTES.FOLLOW };
  if (suggestion > st.level) return { ...out, kind: KINDS.RAISE, note: shorter };
  return { ...out, kind: KINDS.REPEAT, note: shorter ?? (st.back ? NOTES.BACK : st.confirms === 1 ? NOTES.ONCE : null) };
}

// Relevant sessions since the latest break (a gap of WINDOW_DAYS without sessions).
function currentStreak(relevant, S) {
  let start = 0;
  for (let i = 1; i < relevant.length; i++) {
    if (relevant[i].startedAt - relevant[i - 1].startedAt >= S.WINDOW_DAYS * DAY_MS) start = i;
  }
  return relevant.slice(start);
}

// Walks through the sessions in order and carries the current level forward.
export function replay(sessions, S = SUGGESTION_SETTINGS) {
  const st = {
    level: null, // current level (seconds) or null
    confirms: 0, // good sessions at the level since it was set
    single: false, // level anchored by one planned session only
    backTo: null, // level from before a setback, while on the way back
    start: null, // level right after the setback (recovery steps are counted from here)
    step: 0, // recovery steps taken
    back: false, // the latest step reached the earlier level
    neutral: false, // the latest good session ended before the suggestion (and changed nothing)
    shortRun: [], // good sessions in a row that ended before the suggestion
    followed: false, // the latest session made the level follow a run of shorter sessions
    setback: null, // { kind?, fromOnset, cleared } – the latest hard session
    goods: [], // good sessions since the latest hard session (or the break)
    before: [], // all good sessions in the streak (basis for an unknown worry time)
  };
  for (const s of sessions) {
    if (s.result === 'good') good(st, s, S);
    else hardSession(st, s, S);
  }
  return st;
}

function hardSession(st, s, S) {
  const d = difficulty(s, st.before, S);
  const prev = st.level;
  const next = d.sec == null ? null : prev == null ? d.sec : Math.min(prev, d.sec);
  // Remember the level from before the setback (the highest one, if setbacks follow each other).
  if (prev != null && (next == null || next < prev)) st.backTo = Math.max(st.backTo ?? 0, prev);
  Object.assign(st, {
    level: next, confirms: 0, single: false, start: next, step: 0, back: false, goods: [], shortRun: [],
    setback: { kind: d.sec == null ? d.kind : null, fromOnset: d.fromOnset === true, cleared: false },
  });
}

function good(st, s, S) {
  st.goods.push(s);
  st.before.push(s);
  st.back = false;
  st.neutral = false;
  st.followed = false;

  if (st.level == null) {
    // "No time" after a hard session stays until RECOVERY_SESSIONS good sessions have followed.
    if (st.setback && st.goods.length < S.RECOVERY_SESSIONS) return;
    const a = anchor(st.goods, S);
    if (a == null) return;
    st.level = a;
    st.start = a;
    st.confirms = support(st.goods, a, S);
    st.single = st.goods.length < S.ANCHOR_MIN_SESSIONS;
    if (st.setback) st.setback.cleared = st.backTo == null;
    if (st.backTo != null && a >= st.backTo) endRecovery(st);
    return;
  }

  // Longer good sessions: once two of them support a longer time, the level can move there directly.
  const longer = anchor(st.goods, S, { singleAllowed: false });

  // On the way back: every good session at the current level is one step back (or the longer
  // time two sessions support, if that is further). At most RECOVERY_STEPS steps.
  if (st.backTo != null) {
    if (s.durationSec < S.CONFIRM_TOLERANCE * st.level) return shorterSession(st, s, S); // ended earlier
    st.shortRun = [];
    st.step += 1;
    const target = st.start + (st.step * (st.backTo - st.start)) / S.RECOVERY_STEPS;
    const next = Math.min(st.backTo, floorNatural(target), st.level * S.RECOVERY_MAX_STEP);
    st.level = Math.max(next, Math.min(st.backTo, raiseFrom(st.level, S)), longer ?? 0);
    if (st.level >= st.backTo) {
      const beyond = st.level > st.backTo;
      st.level = beyond ? st.level : st.backTo;
      endRecovery(st);
      st.back = !beyond;
      if (beyond) st.confirms = support(st.goods, st.level, S);
    }
    return;
  }

  if (longer != null && longer > st.level) {
    st.shortRun = [];
    st.level = longer;
    st.confirms = support(st.goods, longer, S);
    st.single = false;
    if (st.setback) st.setback.cleared = true;
    return;
  }

  const suggestion = st.confirms >= S.CONFIRMS_TO_RAISE ? raiseFrom(st.level, S) : st.level;
  if (suggestion > st.level && s.durationSec >= S.CONFIRM_TOLERANCE * suggestion) {
    st.level = suggestion; // the increase went well: it is the new level
    st.confirms = 1;
  } else if (s.durationSec >= S.CONFIRM_TOLERANCE * st.level) {
    st.confirms += 1;
  } else {
    return shorterSession(st, s, S); // ended earlier than the suggestion
  }
  st.shortRun = [];
  st.single = false;
  if (st.setback && st.confirms >= S.CONFIRMS_TO_RAISE) st.setback.cleared = true;
}

// A good session that ended before the suggestion is neutral – until SHORTER_RUN_TO_FOLLOW of
// them in a row: then the level follows what they support (and counts as confirmed by them).
function shorterSession(st, s, S) {
  st.shortRun.push(s);
  if (st.shortRun.length < S.SHORTER_RUN_TO_FOLLOW) {
    st.neutral = true;
    return;
  }
  const level = anchor(st.shortRun, S, { singleAllowed: false });
  if (level != null && level < st.level) {
    st.level = level;
    st.confirms = support(st.shortRun, level, S);
    st.single = false;
    if (st.backTo != null) {
      st.start = level;
      st.step = 0;
    }
    st.followed = true;
    st.goods = [...st.shortRun]; // older, longer sessions no longer support a jump back up
  } else {
    st.neutral = true;
  }
  st.shortRun = [];
}

function endRecovery(st) {
  st.backTo = null;
  st.start = null;
  st.step = 0;
  st.confirms = 0;
  if (st.setback) st.setback.cleared = true;
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
