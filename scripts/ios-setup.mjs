// Adds Alone Time's own native code to the Capacitor iOS app (safe to run again):
// - copies native/ios/App/*.swift into ios/App/App and adds them to the App target
// - uses MainViewController (registers the Live Activity plugin) as the root view controller
// - turns on Live Activities in Info.plist (NSSupportsLiveActivities)
//   npm run ios:setup
import { readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import xcode from 'xcode';

const root = new URL('../', import.meta.url);
const appDir = new URL('ios/App/App/', root);
const srcDir = new URL('native/ios/App/', root);
const pbxPath = fileURLToPath(new URL('ios/App/App.xcodeproj/project.pbxproj', root));

// 1. Swift files
const swiftFiles = (await readdir(srcDir)).filter((f) => f.endsWith('.swift'));
for (const f of swiftFiles) await copyFile(new URL(f, srcDir), new URL(f, appDir));

const project = xcode.project(pbxPath);
project.parseSync();
const groupKey = project.findPBXGroupKey({ name: 'App' }) ?? project.findPBXGroupKey({ path: 'App' });
if (!groupKey) throw new Error('Could not find the App group in the Xcode project.');
const appTarget = project.getFirstTarget().uuid;
const existing = new Set(Object.values(project.pbxFileReferenceSection()).map((r) => r && r.path && String(r.path).replace(/"/g, '')));
for (const f of swiftFiles) {
  if (existing.has(f)) continue;
  project.addSourceFile(f, { target: appTarget }, groupKey);
  console.log(`added ${f} to the App target`);
}
// node-xcode writes `explicitFileType = undefined; includeInIndex = 0;` for new files, which
// Xcode can read as an unknown file type. Write the references the way Xcode itself does.
const pbx = project
  .writeSync()
  .replace(/\{isa = PBXFileReference; name = "([^"]+\.swift)"; path = "\1"; sourceTree = "<group>"; fileEncoding = 4; lastKnownFileType = sourcecode\.swift; explicitFileType = undefined; includeInIndex = 0; \}/g,
    '{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = $1; sourceTree = "<group>"; }')
  .replace(/(LastSwiftUpdateCheck|LastUpgradeCheck) = (\d{3});/g, '$1 = 0$2;'); // keep Xcode's own format
if (/= undefined;/.test(pbx)) throw new Error('Unexpected "undefined" value in project.pbxproj');
await writeFile(pbxPath, pbx);

// 2. Root view controller
const scenePath = new URL('SceneDelegate.swift', appDir);
let scene = await readFile(scenePath, 'utf8');
if (scene.includes('rootViewController = CAPBridgeViewController()')) {
  scene = scene.replace('rootViewController = CAPBridgeViewController()', 'rootViewController = MainViewController()');
  await writeFile(scenePath, scene);
  console.log('SceneDelegate now uses MainViewController');
}
const storyboardPath = new URL('Base.lproj/Main.storyboard', appDir);
let storyboard = await readFile(storyboardPath, 'utf8');
if (storyboard.includes('customClass="CAPBridgeViewController" customModule="Capacitor"')) {
  storyboard = storyboard.replace(
    'customClass="CAPBridgeViewController" customModule="Capacitor"',
    'customClass="MainViewController" customModule="App" customModuleProvider="target"',
  );
  await writeFile(storyboardPath, storyboard);
}

// 3. Info.plist
const plistPath = new URL('Info.plist', appDir);
let plist = await readFile(plistPath, 'utf8');
if (!plist.includes('NSSupportsLiveActivities')) {
  plist = plist.replace(/<dict>\n/, '<dict>\n\t<key>NSSupportsLiveActivities</key>\n\t<true/>\n');
  await writeFile(plistPath, plist);
  console.log('Info.plist: NSSupportsLiveActivities = true');
}
console.log('iOS native setup done.');
