// TestFlight preparation: iPhone only, widget version = app version, and the project check.
// The widget target below is a TEST FIXTURE shaped like Xcode's Widget Extension template – it is
// only used here to test the text edits; the real widget target is created in Xcode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { targets, iphoneOnly, syncExtensionVersions, checkProject, WIDGET_TEMPLATE_FILES } from '../../scripts/ios-project.mjs';

const real = await readFile(new URL('../../ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8');

const widgetConfig = (id, name, extra = '') => `
\t\t${id} /* ${name} */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tINFOPLIST_FILE = AloneTimeWidget/Info.plist;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 16.2;
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = se.fridakaka.alonetime.AloneTimeWidget;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSKIP_INSTALL = YES;${extra}
\t\t\t};
\t\t\tname = ${name};
\t\t};`;

function withWidget(pbx, { deviceFamily = '\n\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";', embed = true } = {}) {
  const objects = `
\t\tAA00000000000000000000A1 /* AloneTimeWidgetExtension */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = AA00000000000000000000B1 /* Build configuration list for PBXNativeTarget "AloneTimeWidgetExtension" */;
\t\t\tbuildPhases = (
\t\t\t);
\t\t\tname = AloneTimeWidgetExtension;
\t\t\tproductName = AloneTimeWidgetExtension;
\t\t\tproductReference = AA00000000000000000000C1 /* AloneTimeWidgetExtension.appex */;
\t\t\tproductType = "com.apple.product-type.app-extension";
\t\t};
\t\tAA00000000000000000000B1 /* Build configuration list for PBXNativeTarget "AloneTimeWidgetExtension" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\tAA00000000000000000000D1 /* Debug */,
\t\t\t\tAA00000000000000000000D2 /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};${widgetConfig('AA00000000000000000000D1', 'Debug', deviceFamily)}${widgetConfig('AA00000000000000000000D2', 'Release', deviceFamily)}${embed ? `
\t\tAA00000000000000000000E1 /* Embed Foundation Extensions */ = {
\t\t\tisa = PBXCopyFilesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tdstPath = "";
\t\t\tdstSubfolderSpec = 13;
\t\t\tfiles = (
\t\t\t\tAA00000000000000000000F1 /* AloneTimeWidgetExtension.appex in Embed Foundation Extensions */,
\t\t\t);
\t\t\tname = "Embed Foundation Extensions";
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};` : ''}`;
  return pbx.replace('\n/* End PBXProject section */', `\n/* End PBXProject section */${objects}`);
}

test('the real project: app target found, bundle id and versions as installed today', () => {
  const [app] = targets(real);
  assert.equal(app.name, 'App');
  assert.deepEqual(app.configs.map((c) => c.name), ['Debug', 'Release']);
  for (const c of app.configs) {
    assert.equal(c.bundleId, 'se.fridakaka.alonetime'); // unchanged: an update, not a new app
    assert.equal(c.marketingVersion, '1.0');
  }
});

test('iPhone only: every configuration of the app AND the widget, nothing else changes, safe to run again', () => {
  const before = withWidget(real);
  const after = iphoneOnly(before);
  for (const t of targets(after)) for (const c of t.configs) assert.equal(c.deviceFamily, '1', `${t.name} ${c.name}`);
  const a = before.split('\n');
  const b = after.split('\n');
  assert.equal(a.length, b.length);
  const changed = b.filter((l, i) => l !== a[i]);
  assert.deepEqual(changed, Array(4).fill('\t\t\t\tTARGETED_DEVICE_FAMILY = 1;'));
  assert.equal(iphoneOnly(after), after);
  // A configuration without the setting gets it (Xcode's default would be iPhone + iPad).
  const missing = iphoneOnly(withWidget(real, { deviceFamily: '' }));
  assert.ok(targets(missing).every((t) => t.configs.every((c) => c.deviceFamily === '1')));
});

test('the widget gets the same version and build number as the app', () => {
  const bumped = real.replaceAll('CURRENT_PROJECT_VERSION = 1;', 'CURRENT_PROJECT_VERSION = 7;').replaceAll('MARKETING_VERSION = 1.0;', 'MARKETING_VERSION = 1.1;');
  const out = syncExtensionVersions(withWidget(bumped));
  const widget = targets(out).find((t) => t.name === 'AloneTimeWidgetExtension');
  for (const c of widget.configs) {
    assert.equal(c.buildNumber, '7');
    assert.equal(c.marketingVersion, '1.1');
  }
  assert.equal(syncExtensionVersions(out), out);
});

test('the check: what is missing today, and a ready project', () => {
  const today = checkProject(real);
  assert.ok(today.problems.some((p) => /No "AloneTimeWidget" widget extension target/.test(p)));
  assert.ok(today.problems.some((p) => /TARGETED_DEVICE_FAMILY = 1,2/.test(p)));

  const native = ['AloneTimeActivityAttributes.swift', 'AloneTimeLiveActivity.swift', 'AloneTimeWidgetBundle.swift'];
  const ready = syncExtensionVersions(iphoneOnly(withWidget(real)));
  const ok = checkProject(ready, { widgetFiles: [...native, 'Info.plist', 'Assets.xcassets'], nativeWidgetFiles: native });
  assert.deepEqual(ok.problems, []);

  const leftovers = checkProject(ready, { widgetFiles: [...native, 'AppIntent.swift'], nativeWidgetFiles: native });
  assert.ok(leftovers.problems.some((p) => /template files left.*AppIntent\.swift/.test(p)));
  const notEmbedded = checkProject(syncExtensionVersions(iphoneOnly(withWidget(real, { embed: false }))));
  assert.ok(notEmbedded.problems.some((p) => /does not seem to embed the widget/.test(p)));
  const wrongId = checkProject(ready.replaceAll('se.fridakaka.alonetime.AloneTimeWidget', 'se.other.widget'));
  assert.ok(wrongId.problems.some((p) => /must start with "se\.fridakaka\.alonetime\."/.test(p)));
});

test('only known Xcode template files are ever removed by the widget step', () => {
  assert.deepEqual(WIDGET_TEMPLATE_FILES, ['AloneTimeWidget.swift', 'AloneTimeWidgetLiveActivity.swift', 'AloneTimeWidgetControl.swift', 'AppIntent.swift']);
  // Our own files (also the bundle, which replaces the template's) are never on that list.
  for (const f of ['AloneTimeActivityAttributes.swift', 'AloneTimeLiveActivity.swift', 'AloneTimeWidgetBundle.swift']) assert.ok(!WIDGET_TEMPLATE_FILES.includes(f));
});

test('stored data keys are unchanged, so an update keeps sessions, places, comments and settings', async () => {
  const { KEY } = await import('../../src/store.js');
  assert.equal(KEY, 'alone-training:v2');
  const cfg = JSON.parse(await readFile(new URL('../../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(cfg.appId, 'se.fridakaka.alonetime');
  const boot = await readFile(new URL('../../src/boot.js', import.meta.url), 'utf8');
  assert.match(boot, /readDurable\(KEY\)/); // the iOS app's own copy is read under the same key
});
