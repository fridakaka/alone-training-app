// Run AFTER creating the widget extension target "AloneTimeWidget" in Xcode
// (File → New → Target → Widget Extension, "Include Live Activity" ticked).
// Replaces Xcode's template Swift files with Alone Time's Live Activity.
//   npm run ios:widget
import { readdir, rm, copyFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const target = new URL('ios/App/AloneTimeWidget/', root);
const src = new URL('native/ios/AloneTimeWidget/', root);

try {
  await access(target);
} catch {
  console.error('ios/App/AloneTimeWidget was not found.\nCreate the widget target in Xcode first (see docs/IOS.md, step 4), named exactly "AloneTimeWidget".');
  process.exit(1);
}
for (const f of await readdir(target)) {
  if (f.endsWith('.swift')) {
    await rm(new URL(f, target));
    console.log(`removed Xcode template ${f}`);
  }
}
for (const f of (await readdir(src)).filter((x) => x.endsWith('.swift'))) {
  await copyFile(new URL(f, src), new URL(f, target));
  console.log(`added ${f}`);
}
console.log('Widget files installed. Back in Xcode: Product → Build.');
