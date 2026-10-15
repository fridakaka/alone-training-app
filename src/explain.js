// Words for the ready screen: why today's suggestion is what it is, and the longest session
// that went well. Pure functions (no DOM); the text itself lives in i18n.js.
//
// Rules:
// - The explanation names the ACTUAL reason. "The latest session" is only said when the latest
//   session itself didn't go well; an earlier hard session that still limits the suggestion is
//   called "a recent hard session".
// - Never "the dog can …": the journal can't establish what a dog manages today.
// - The longest good session is history only. It is computed separately from the suggestion
//   and never feeds back into it.

import { KINDS, HARD } from './suggestion.js';
import { formatTarget } from './progression.js';

/** @returns {{ key: string, params?: object }} an i18n key (+ parameters) for the suggestion */
export function explanationKey(suggestion) {
  const { kind, sec, hard, fromOnset } = suggestion;
  const recent = hard === HARD.RECENT;
  switch (kind) {
    case KINDS.RAISE: return { key: 'explainRaise' };
    case KINDS.REPEAT: return { key: 'explainRepeat' };
    case KINDS.LIMITED:
      return sec == null ? { key: 'explainLimitedNone' } : { key: 'explainLimited', params: { time: formatTarget(sec) } };
    case KINDS.EASIER:
      if (recent) return { key: fromOnset ? 'explainEasierRecentOnset' : 'explainEasierRecent' };
      return { key: fromOnset ? 'explainEasierLatestOnset' : 'explainEasierLatest' };
    case KINDS.HARD_CHOOSE: return { key: recent ? 'explainHardChooseRecent' : 'explainHardChooseLatest' };
    case KINDS.WORRIED_AT_ONCE: return { key: recent ? 'explainWorriedRecent' : 'explainWorriedLatest' };
    case KINDS.BREAK: return { key: 'explainBreak' };
    case KINDS.TOO_LITTLE: return { key: 'explainTooLittle' };
    case KINDS.NONE: return { key: 'explainNone' };
    default: return { key: '' };
  }
}

/**
 * The longest session marked "Went well" (history only – never a target or a floor).
 * Sessions the user marked "don't count" (unsure or logged wrong) are left out.
 * Equal durations: the most recent one.
 * @param sessions sessions of ONE dog in ONE place
 * @returns {{ id, durationSec, startedAt } | null}
 */
export function longestGoodSession(sessions) {
  let best = null;
  for (const s of sessions) {
    if (!s || s.result !== 'good' || s.uncertain === true) continue;
    if (!Number.isFinite(s.durationSec) || s.durationSec < 1 || !Number.isFinite(s.startedAt)) continue;
    if (!best || s.durationSec > best.durationSec || (s.durationSec === best.durationSec && s.startedAt > best.startedAt)) best = s;
  }
  return best && { id: best.id, durationSec: best.durationSec, startedAt: best.startedAt };
}
