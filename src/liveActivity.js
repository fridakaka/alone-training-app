// What the iOS Live Activity should show, derived from the app state. Pure: easy to test.
// null = no Live Activity (no running session). The app sends a start/update when this
// changes, and an end when it becomes null – so the activity starts with a session, ends
// when the session is ended (or the result is discarded), and is restored/cleaned up when
// the app is opened again.
import { formatTarget } from './progression.js';
import { t } from './i18n.js';

export function liveActivityPayload(state) {
  const a = state?.active;
  if (!a) return null;
  const dogName = state.dogs?.[0]?.name ?? '';
  const placeName = state.contexts?.find((c) => c.id === a.contextId)?.name ?? '';
  return {
    sessionId: String(a.startedAt),
    startedAt: a.startedAt, // the timer counts up from here on the lock screen
    targetSec: a.targetSec ?? null, // shown only; never ends the session
    dogName,
    placeName,
    aloneForLabel: t('trainingLabel', { dog: dogName }),
    targetLabel: a.targetSec ? t('trainingTarget', { time: formatTarget(a.targetSec) }) : '',
  };
}

// Decides what to send, given the last payload that was sent ('unknown' at app start).
export function liveActivityStep(lastSent, payload) {
  if (!payload) return lastSent === null ? { action: 'none' } : { action: 'end' };
  if (lastSent && lastSent !== 'unknown' && JSON.stringify(lastSent) === JSON.stringify(payload)) {
    return { action: 'none' };
  }
  return { action: 'start', payload };
}
