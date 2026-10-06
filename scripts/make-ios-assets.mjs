// iOS app icon + launch screen from the master artwork alone-time-app-icon-1024.png.
//   npm run ios:assets
// - AppIcon: the 1024×1024 master as is (RGB, no transparency, as Apple requires).
// - Launch screen: the app's background colour with the icon in the middle.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { launch } from './browser.mjs';

const root = new URL('../', import.meta.url);
const assets = new URL('ios/App/App/Assets.xcassets/', root);
const masterUrl = new URL('alone-time-app-icon-1024.png', root);
await copyFile(masterUrl, new URL('AppIcon.appiconset/AppIcon-512@2x.png', assets));

const src = `data:image/png;base64,${(await readFile(masterUrl)).toString('base64')}`;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
const png = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const size = 2732;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FAF7F2';
  ctx.fillRect(0, 0, size, size);
  const icon = 360; // shown at about 180 pt on a phone
  const r = icon * 0.225;
  const x = (size - icon) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, x, icon, icon, r);
  ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, x, icon, icon);
  ctx.restore();
  return c.toDataURL('image/png').split(',')[1];
}, src);
await browser.close();
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await writeFile(new URL(`Splash.imageset/${f}`, assets), Buffer.from(png, 'base64'));
}
console.log('iOS icon and launch screen updated.');
