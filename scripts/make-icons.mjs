// Renders icon.svg to the PNG sizes phones need (iPhone ignores SVG home-screen icons).
import { readFile } from 'node:fs/promises';
import { launch } from './browser.mjs';

const svg = await readFile(new URL('../icon.svg', import.meta.url), 'utf8');
const browser = await launch();
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // iOS rounds the corners itself, so fill the square fully.
  await page.setContent(`<body style="margin:0;background:#1F4A45">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `).replace('rx="112"', 'rx="0"')}</body>`);
  await page.screenshot({ path: new URL(`../icon-${size}.png`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
console.log('Icons written.');
