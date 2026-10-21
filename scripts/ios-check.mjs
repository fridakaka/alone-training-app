// Checks the iOS project before a TestFlight build – and that it can be rebuilt from a clean
// clone. Changes nothing. Prints what is wrong, and exactly which files to commit.
//   npm run ios:check
import { readFile, readdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { checkProject, WIDGET_TARGET } from './ios-project.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');
const exists = (p) => access(new URL(p, root)).then(() => true, () => false);
const list = (p) => readdir(new URL(p, root)).catch(() => null);

const problems = [];
const notes = [];

const pbx = await read('ios/App/App.xcodeproj/project.pbxproj');
const nativeWidgetFiles = (await list('native/ios/AloneTimeWidget/')).filter((f) => f.endsWith('.swift'));
const widgetDir = await list(`ios/App/${WIDGET_TARGET}/`);
const res = checkProject(pbx, { widgetFiles: widgetDir, nativeWidgetFiles });
problems.push(...res.problems);
notes.push(...res.notes);

// The widget's files must be the ones from native/ (the source of truth in the repository).
if (widgetDir) {
  for (const f of nativeWidgetFiles.filter((x) => widgetDir.includes(x))) {
    if ((await read(`ios/App/${WIDGET_TARGET}/${f}`)) !== (await read(`native/ios/AloneTimeWidget/${f}`))) {
      problems.push(`ios/App/${WIDGET_TARGET}/${f} differs from native/ios/AloneTimeWidget/${f} – run npm run ios:widget.`);
    }
  }
  notes.push(`ios/App/${WIDGET_TARGET}: ${widgetDir.join(', ')}`);
}
for (const f of (await list('native/ios/App/')).filter((x) => x.endsWith('.swift'))) {
  if ((await read(`ios/App/App/${f}`).catch(() => '')) !== (await read(`native/ios/App/${f}`))) problems.push(`ios/App/App/${f} is out of date – run npm run ios:setup.`);
}

// Info.plist
const plist = await read('ios/App/App/Info.plist');
if (!/<key>NSSupportsLiveActivities<\/key>\s*<true\/>/.test(plist)) problems.push('Info.plist: NSSupportsLiveActivities is not true – run npm run ios:setup.');
if (!/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist)) notes.push('Info.plist: ITSAppUsesNonExemptEncryption not set (TestFlight will ask about encryption) – run npm run ios:setup.');

// App icon: 1024 × 1024 without transparency (App Store Connect rejects an alpha channel).
const icon = await readFile(new URL('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', root)).catch(() => null);
if (!icon) problems.push('App icon AppIcon-512@2x.png is missing.');
else {
  const w = icon.readUInt32BE(16), h = icon.readUInt32BE(20), colorType = icon[25];
  if (w !== 1024 || h !== 1024) problems.push(`App icon is ${w}×${h}, must be 1024×1024.`);
  if (colorType === 4 || colorType === 6) problems.push('App icon has an alpha channel – App Store Connect rejects it.');
}

// Swift packages: the resolved versions should be committed, so a clean clone builds the same.
const resolved = 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved';
if (!(await exists(resolved))) notes.push(`${resolved} not found yet – it appears after the first build in Xcode; commit it.`);

// Git: what is changed under ios/ and native/, and the accidental nested folder.
let gitOk = true;
let changed = [];
try {
  const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'ios', 'native'], { cwd: new URL('.', root), encoding: 'utf8' });
  changed = out.split('\n').filter(Boolean).map((l) => ({ code: l.slice(0, 2), path: l.slice(3) }));
} catch {
  gitOk = false;
}
if (await exists('alone-training-app')) {
  notes.push('A nested folder "alone-training-app/" exists here (an accidental second clone). It is ignored by .gitignore – never add it; delete it yourself in Finder when you are sure nothing in it is needed.');
}

console.log('\nAlone Time – iOS check\n');
for (const n of notes) console.log(`  · ${n}`);
console.log('');
if (problems.length) {
  console.log('Needs fixing:');
  for (const p of problems) console.log(`  ✗ ${p}`);
} else {
  console.log('  ✓ Project ready: iPhone only, Live Activity widget in place, versions match.');
}
if (gitOk && changed.length) {
  console.log('\nChanged or new files to commit (check each one – nothing else):');
  for (const c of changed) console.log(`  ${c.code} ${c.path}`);
  const paths = [...new Set(changed.map((c) => c.path.replace(/^"|"$/g, '')))];
  console.log(`\n  git add -- ${paths.map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ')}`);
} else if (gitOk) {
  console.log('\n  ✓ No uncommitted changes under ios/ or native/.');
}
console.log('');
process.exitCode = problems.length ? 1 : 0;
