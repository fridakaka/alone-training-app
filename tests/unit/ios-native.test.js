// iOS-specific logic that can be tested without an iPhone: the Live Activity payload and
// when it is started/ended, the web-only fallbacks, and consistency checks of the native files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { liveActivityPayload, liveActivityStep } from '../../src/liveActivity.js';
import { isNativeApp, startLiveActivity, readDurable } from '../../src/native.js';
import { createInitialState, startSession, endSession, discardPending, renameDog } from '../../src/training.js';
import { setLang } from '../../src/i18n.js';

const read = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

test('Live Activity: payload only while a session runs; the timer counts from startedAt', () => {
  setLang('sv');
  let s = renameDog(createInitialState(), 'Majken');
  assert.equal(liveActivityPayload(s), null);
  s = startSession(s, { dogId: 'charlie', contextId: 'car', targetSec: 330, now: 1_700_000_000_000 });
  assert.deepEqual(liveActivityPayload(s), {
    sessionId: '1700000000000',
    startedAt: 1_700_000_000_000,
    targetSec: 330,
    dogName: 'Majken',
    placeName: 'Car',
    aloneForLabel: 'Majken har varit ensam i',
    targetLabel: 'Mål 5:30',
  });
  s = startSession(createInitialState(), { dogId: 'charlie', contextId: 'home', now: 5 });
  assert.equal(liveActivityPayload(s).targetLabel, ''); // no target → no target text
  setLang('en');
});

test('Live Activity: start with a session, end when it ends or is discarded, restore on reopen', () => {
  let s = createInitialState();
  // App opens with no session: make sure no old activity is left.
  assert.deepEqual(liveActivityStep('unknown', liveActivityPayload(s)), { action: 'end' });
  assert.deepEqual(liveActivityStep(null, null), { action: 'none' });
  // Start.
  s = startSession(s, { dogId: 'charlie', contextId: 'home', now: 1000 });
  const p = liveActivityPayload(s);
  assert.equal(liveActivityStep(null, p).action, 'start');
  assert.equal(liveActivityStep(p, liveActivityPayload(s)).action, 'none'); // nothing changed
  // Reopened with the session still running: start again (the plugin updates the same activity).
  assert.equal(liveActivityStep('unknown', p).action, 'start');
  // Renaming the dog during the session updates the text.
  assert.equal(liveActivityStep(p, liveActivityPayload(renameDog(s, 'Sixten'))).action, 'start');
  // End training → end the activity (also before a result is chosen).
  const ended = endSession(s, 61_000);
  assert.deepEqual(liveActivityStep(p, liveActivityPayload(ended)), { action: 'end' });
  // Discarding the result keeps it ended.
  assert.deepEqual(liveActivityStep(null, liveActivityPayload(discardPending(ended))), { action: 'none' });
});

test('in a normal browser (the PWA) the native bridge does nothing', async () => {
  assert.equal(isNativeApp(), false);
  assert.deepEqual(await startLiveActivity({}), { started: false, reason: 'web' });
  assert.equal(await readDurable('x'), null);
});

test('native files: attributes are identical in app and widget, plugin matches the JS bridge', async () => {
  const appAttr = await read('native/ios/App/AloneTimeActivityAttributes.swift');
  const widgetAttr = await read('native/ios/AloneTimeWidget/AloneTimeActivityAttributes.swift');
  assert.equal(widgetAttr, appAttr);
  // Every field the JS sends is read by the plugin, and every ContentState field is filled.
  const plugin = await read('native/ios/App/LiveActivityPlugin.swift');
  for (const key of ['sessionId', 'startedAt', 'targetSec', 'dogName', 'placeName', 'aloneForLabel', 'targetLabel']) {
    assert.match(plugin, new RegExp(`"${key}"`), key);
  }
  for (const field of [...appAttr.matchAll(/^\s+var (\w+):/gm)].map((m) => m[1]).filter((f) => f !== 'sessionId')) {
    assert.match(plugin, new RegExp(`${field}:`), field);
  }
  assert.match(plugin, /jsName = "LiveActivity"/);
  const nativeJs = await read('src/native.js');
  assert.match(nativeJs, /plugin\('LiveActivity'\)\.start\(/);
  assert.match(nativeJs, /plugin\('LiveActivity'\)\.end\(/);
  // The widget never ends a session by itself: the timer is drawn from the start time.
  const widget = await read('native/ios/AloneTimeWidget/AloneTimeLiveActivity.swift');
  assert.match(widget, /Text\(context\.state\.startedAt, style: \.timer\)/);
  assert.doesNotMatch(widget, /\.end\(/);
});

test('iOS project: native files are in the App target, Live Activities enabled, plugin registered', async () => {
  const pbx = await read('ios/App/App.xcodeproj/project.pbxproj');
  for (const f of ['AloneTimeActivityAttributes.swift', 'LiveActivityPlugin.swift', 'MainViewController.swift']) {
    assert.match(pbx, new RegExp(`/\\* ${f} in Sources \\*/,`), f);
    assert.equal(await read(`ios/App/App/${f}`), await read(`native/ios/App/${f}`), `${f} is up to date`);
  }
  assert.doesNotMatch(pbx, /= undefined;/);
  assert.match(await read('ios/App/App/Info.plist'), /<key>NSSupportsLiveActivities<\/key>\s*<true\/>/);
  assert.match(await read('ios/App/App/SceneDelegate.swift'), /rootViewController = MainViewController\(\)/);
  assert.match(await read('native/ios/App/MainViewController.swift'), /registerPluginInstance\(LiveActivityPlugin\(\)\)/);
  const cfg = JSON.parse(await read('capacitor.config.json'));
  assert.equal(cfg.webDir, 'www');
});
