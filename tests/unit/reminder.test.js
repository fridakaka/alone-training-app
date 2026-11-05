// "Target reached" vibration: when the notification is scheduled/cancelled, and when the open
// app taps once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminderPlan, reminderStep, shouldBuzz, BUZZ_LATE_SEC } from '../../src/reminder.js';
import { buzz, scheduleReminder } from '../../src/native.js';
import { createInitialState, startSession, endSession, discardPending, renameDog } from '../../src/training.js';
import { setLang } from '../../src/i18n.js';

test('notification: scheduled at start + target, with the dog\'s name; none without a target', () => {
  setLang('sv');
  let s = renameDog(createInitialState(), 'Majken');
  assert.equal(reminderPlan(s, 0), null);
  s = startSession(s, { dogId: 'charlie', contextId: 'home', targetSec: 95, now: 1_000_000 });
  assert.deepEqual(reminderPlan(s, 1_000_000), {
    key: '1000000:95',
    at: 1_000_000 + 95_000,
    title: 'Målet 1:35 är nått',
    body: 'Majken är fortfarande ensam – passet pågår tills du avslutar det.',
  });
  assert.equal(reminderPlan(startSession(createInitialState(), { dogId: 'charlie', contextId: 'home', now: 5 }), 5), null);
  // Reopened after the target: nothing new is scheduled (it has already been delivered).
  assert.equal(reminderPlan(s, 1_000_000 + 95_000), null);
  setLang('en');
});

test('notification: scheduled once, cancelled when the session ends or is discarded', () => {
  let s = startSession(createInitialState(), { dogId: 'charlie', contextId: 'home', targetSec: 60, now: 0 });
  const plan = reminderPlan(s, 0);
  assert.equal(reminderStep('unknown', plan).action, 'schedule');
  assert.equal(reminderStep(null, plan).action, 'schedule');
  assert.deepEqual(reminderStep(plan.key, plan), { action: 'none' }); // every render: nothing new
  s = endSession(s, 30_000);
  assert.deepEqual(reminderStep(plan.key, reminderPlan(s, 30_000)), { action: 'cancel' });
  assert.deepEqual(reminderStep(null, reminderPlan(discardPending(s), 30_000)), { action: 'none' });
  assert.deepEqual(reminderStep('unknown', null), { action: 'cancel' }); // app opens: no stale one left
});

test('open app: one tap at the moment the target is passed – not before, not twice, not late', () => {
  const a = { startedAt: 0, targetSec: 60 };
  assert.equal(shouldBuzz(a, 59, null), false);
  assert.equal(shouldBuzz(a, 60, null), true);
  assert.equal(shouldBuzz(a, 61, '0:60'), false); // already tapped
  assert.equal(shouldBuzz(a, 60 + BUZZ_LATE_SEC + 1, null), false); // came back long after
  assert.equal(shouldBuzz({ startedAt: 0, targetSec: null }, 999, null), false);
  assert.equal(shouldBuzz({ startedAt: 1, targetSec: 60 }, 60, '0:60'), true); // a new session
});

test('outside the iOS app: notifications do nothing, the tap uses navigator.vibrate when it exists', async () => {
  assert.equal(await scheduleReminder(1, { at: 0, title: '', body: '' }), false);
  const calls = [];
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (p) => calls.push(p) }, configurable: true });
  try {
    buzz();
  } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', had);
    else delete globalThis.navigator;
  }
  assert.deepEqual(calls, [[120, 80, 120]]);
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true }); // iPhone Safari: no vibrate
  try { buzz(); } finally { if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator; }
});
