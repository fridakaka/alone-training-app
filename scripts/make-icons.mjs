// Makes the app icons from the master artwork `alone-time-app-icon-1024.png`
// (dog in front of a half-open door). The motif is used as is – only resized.
//   node scripts/make-icons.mjs
// Output: icons/alone-time-{32,180,192,512}.png. New file names (instead of the old
// icon-*.png) make browsers fetch the new icon instead of a cached old one.
import { readFile, mkdir } from 'node:fs/promises';
import { launch } from './browser.mjs';

const root = new URL('../', import.meta.url);
const master = await readFile(new URL('alone-time-app-icon-1024.png', root));
const src = `data:image/png;base64,${master.toString('base64')}`;
await mkdir(new URL('icons/', root), { recursive: true });

const browser = await launch();
for (const size of [32, 180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  // Downscale in steps of at most 2x on a canvas: sharper than a single big jump.
  const png = await page.evaluate(async ({ src, size }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    let canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    while (canvas.width / 2 >= size) {
      const next = document.createElement('canvas');
      next.width = canvas.width / 2;
      next.height = canvas.height / 2;
      const ctx = next.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, next.width, next.height);
      canvas = next;
    }
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, size, size);
    return out.toDataURL('image/png').split(',')[1];
  }, { src, size });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(new URL(`icons/alone-time-${size}.png`, root), Buffer.from(png, 'base64'));
  await page.close();
}
await browser.close();
console.log('Icons written to icons/.');
