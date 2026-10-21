// Run AFTER creating the widget extension target "AloneTimeWidget" in Xcode
// (File → New → Target → Widget Extension, "Include Live Activity" ticked).
// Puts Alone Time's Live Activity files in ios/App/AloneTimeWidget (safe to run again):
// - copies native/ios/AloneTimeWidget/*.swift (they replace the template files of the same name)
// - removes ONLY the known Xcode template Swift files (they would define a second widget);
//   any other Swift file there is left alone and reported
// - keeps everything else Xcode created (Info.plist, Assets.xcassets …): the build uses them
// - then runs the same project settings as ios:setup (iPhone only, widget version = app version)
//   npm run ios:widget
import { readdir, rm, copyFile, access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WIDGET_TEMPLATE_FILES, iphoneOnly, syncExtensionVersions } from './ios-project.mjs';

const root = new URL('../', import.meta.url);
const target = new URL('ios/App/AloneTimeWidget/', root);
const src = new URL('native/ios/AloneTimeWidget/', root);
const pbxPath = fileURLToPath(new URL('ios/App/App.xcodeproj/project.pbxproj', root));

try {
  await access(target);
} catch {
  console.error('ios/App/AloneTimeWidget was not found.\nCreate the widget target in Xcode first (see docs/IOS.md, step 4), named exactly "AloneTimeWidget".');
  process.exit(1);
}

const ours = (await readdir(src)).filter((x) => x.endsWith('.swift'));
for (const f of ours) {
  await copyFile(new URL(f, src), new URL(f, target));
  console.log(`installed ${f}`);
}
// A template file is removed only when nothing else in the widget uses what it declares.
const swift = (await readdir(target)).filter((f) => f.endsWith('.swift'));
// Code only: comments and string literals don't count as a use.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
const text = Object.fromEntries(await Promise.all(swift.map(async (f) => [f, code(await readFile(new URL(f, target), 'utf8'))])));
for (const f of swift) {
  if (ours.includes(f)) continue;
  if (!WIDGET_TEMPLATE_FILES.includes(f)) {
    console.warn(`left as it is: ios/App/AloneTimeWidget/${f} (not an Xcode template file – check it)`);
    continue;
  }
  const declared = [...text[f].matchAll(/\b(?:struct|class|enum|protocol)\s+(\w+)/g)].map((m) => m[1]);
  const usedBy = swift.filter((o) => o !== f && !WIDGET_TEMPLATE_FILES.includes(o) && declared.some((d) => new RegExp(`\\b${d}\\b`).test(text[o])));
  if (usedBy.length) {
    console.warn(`kept ${f}: ${declared.join(', ')} is used by ${usedBy.join(', ')}`);
    continue;
  }
  await rm(new URL(f, target));
  console.log(`removed unused Xcode template ${f}`);
}

const before = await readFile(pbxPath, 'utf8');
const after = syncExtensionVersions(iphoneOnly(before));
if (after !== before) {
  await writeFile(pbxPath, after);
  console.log('project.pbxproj updated (iPhone only, widget version = app version).');
}
console.log('Widget files installed. Check with: npm run ios:check');
