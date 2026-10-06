// Copies the web app into www/, which Capacitor bundles INSIDE the iOS app
// (so the iOS app never loads the app from the internet and works offline).
//   npm run build:www
// The PWA itself is still served from the repository root as before.
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const out = new URL('www/', root);
const FILES = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js'];
const DIRS = ['src', 'icons'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of FILES) await cp(new URL(f, root), new URL(f, out));
for (const d of DIRS) await cp(new URL(`${d}/`, root), new URL(`${d}/`, out), { recursive: true });

// Capacitor's runtime (window.Capacitor) is injected by the iOS app itself; plugin JS
// is reached through it, so no bundler is needed.
const version = JSON.parse(await readFile(new URL('package.json', root), 'utf8')).version;
await writeFile(new URL('build.json', out), JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2));
console.log(`www/ ready (v${version}).`);
