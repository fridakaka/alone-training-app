// "The target is reached": a short vibration. Pure functions (easy to test).
//
// - App open: a short haptic tap the moment the target is reached (app.js).
// - Phone locked / another app open (iOS app only): iOS has paused the app, so a local
//   notification is scheduled for startedAt + target when the session starts. It vibrates
//   (and plays the normal notification sound). It is hidden while the app is open (the tap is
//   enough) and cancelled when the session ends or is discarded. It never ends the session.
import { formatTarget } from './progression.js';
import { t } from './i18n.js';

export const REMINDER_ID = 4201; // one session at a time → one fixed notification id
// Coming back to the app long after the target: no late buzz.
export const BUZZ_LATE_SEC = 3;

/** What should be scheduled now, or null (no session, no target, or already passed). */
export function reminderPlan(state, now = Date.now()) {
  const a = state?.active;
  if (!a || !a.targetSec) return null;
  const at = a.startedAt + a.targetSec * 1000;
  if (at <= now) return null;
  const dog = state.dogs?.[0]?.name ?? '';
  return {
    key: `${a.startedAt}:${a.targetSec}`,
    at,
    title: t('reminderTitle', { time: formatTarget(a.targetSec) }),
    body: t('reminderBody', { dog }),
  };
}

/**
 * What to do given the key that was last scheduled ('unknown' at app start, null = nothing).
 * A passed target with the same session keeps its (already delivered) notification.
 */
export function reminderStep(lastKey, plan) {
  if (plan) return plan.key === lastKey ? { action: 'none' } : { action: 'schedule', plan };
  return lastKey === null ? { action: 'none' } : { action: 'cancel' };
}

/** Buzz now? Only on the live moment the target is passed, once per session and target. */
export function shouldBuzz(active, elapsed, buzzedKey) {
  if (!active?.targetSec) return false;
  const key = `${active.startedAt}:${active.targetSec}`;
  return key !== buzzedKey && elapsed >= active.targetSec && elapsed - active.targetSec <= BUZZ_LATE_SEC;
}
