// End-to-end test: opens the real app on an iPhone-sized screen and taps through it.
// Screenshots go to test-results/.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from '../../scripts/serve.mjs';
import { launch } from '../../scripts/browser.mjs';

const PORT = 8123;
const APP = `http://localhost:${PORT}/`;
const OUT = new URL('../../test-results/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const server = await serve(PORT);
const browser = await launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errors = [];

function watch(page) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
}

async function step(name, fn) {
  await fn();
  console.log(`  ✓ ${name}`);
}

try {
  const ctx = await browser.newContext({ ...phone, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  watch(page);
  await page.clock.install({ time: new Date('2026-09-28T09:00:00') });
  await page.goto(APP);

  await step('first launch shows Charlie · Home, Start button and empty state', async () => {
    assert.equal(await page.textContent('h1'), 'Charlie · Home');
    assert.ok(await page.isVisible('#start-btn'));
    assert.ok(await page.isVisible('#empty'));
    assert.ok(await page.isHidden('#history-section'));
    await page.screenshot({ path: OUT + '1-ready-empty.png', fullPage: true });
  });

  await step('one tap starts training and the timer runs', async () => {
    await page.tap('#start-btn');
    assert.ok(await page.isVisible('#timer'));
    assert.ok(await page.isHidden('#start-btn'));
    await page.clock.runFor(75_000);
    assert.equal(await page.textContent('#timer'), '01:15');
    await page.screenshot({ path: OUT + '2-training.png', fullPage: true });
  });

  await step('timer survives closing/reopening the app', async () => {
    await page.reload();
    await page.clock.runFor(1_000);
    assert.match(await page.textContent('#timer'), /^01:1[6-9]$/);
  });

  await step('ending asks how it went', async () => {
    await page.tap('#end-btn');
    assert.ok(await page.isVisible('#view-result'));
    assert.match(await page.textContent('#result-duration'), /^1 min 1[6-9] s$/);
    await page.screenshot({ path: OUT + '3-result.png', fullPage: true });
  });

  await step('"Went well" saves the session to history and graph', async () => {
    await page.tap('#good-btn');
    assert.ok(await page.isVisible('#start-btn'));
    assert.equal(await page.locator('#history li').count(), 1);
    assert.match(await page.textContent('#history li'), /1 min 1\d s[\s\S]*Went well/);
    assert.equal(await page.locator('.chart .bar.good').count(), 1);
  });

  await step('a second session that did not go well is saved too', async () => {
    await page.clock.runFor(3_600_000);
    await page.tap('#start-btn');
    await page.clock.runFor(40_000);
    await page.tap('#end-btn');
    await page.tap('#bad-btn');
    assert.equal(await page.locator('#history li').count(), 2);
    assert.match(await page.textContent('#history li:first-child'), /40 s[\s\S]*Didn't go well/);
    assert.equal(await page.locator('.chart .bar.bad').count(), 1);
  });

  await step('discard removes an accidental session', async () => {
    await page.tap('#start-btn');
    await page.clock.runFor(2_000);
    await page.tap('#end-btn');
    await page.tap('#discard-btn');
    assert.equal(await page.locator('#history li').count(), 2);
  });

  await step('tapping a bar shows its details', async () => {
    await page.locator('.chart .bar').first().tap();
    assert.match(await page.textContent('#chart-detail'), /1 min 1\d s · Went well/);
  });

  await step('data persists after reload', async () => {
    await page.reload();
    assert.equal(await page.locator('#history li').count(), 2);
  });

  await step('layout fits phone width with no sideways scroll', async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
  });
  await ctx.close();

  // Screenshots with a realistic few weeks of history, light and dark.
  for (const scheme of ['light', 'dark']) {
    await step(`screenshot with history (${scheme})`, async () => {
      const c = await browser.newContext({ ...phone, colorScheme: scheme, serviceWorkers: 'block' });
      const p = await c.newPage();
      watch(p);
      await p.addInitScript(() => {
        const base = new Date('2026-09-01T10:00:00').getTime();
        const durs = [30, 45, 60, 40, 90, 120, 100, 180, 240, 150, 300, 360, 420, 300, 540, 600];
        const sessions = durs.map((d, i) => ({
          id: 's' + i, dogId: 'charlie', contextId: 'home',
          startedAt: base + i * 86_400_000 * 1.5, endedAt: base + i * 86_400_000 * 1.5 + d * 1000,
          durationSec: d, result: [3, 6, 9, 13].includes(i) ? 'bad' : 'good',
        }));
        if (!localStorage.getItem('alone-training:v1')) {
          localStorage.setItem('alone-training:v1', JSON.stringify({
            schemaVersion: 1, dogs: [{ id: 'charlie', name: 'Charlie' }],
            contexts: [{ id: 'home', name: 'Home' }], active: null, pending: null, sessions,
          }));
        }
      });
      await p.goto(APP);
      assert.equal(await p.locator('.chart .bar').count(), 16);
      await p.screenshot({ path: OUT + `4-history-${scheme}.png`, fullPage: true });
      await c.close();
    });
  }

  await step('no errors in the browser console', async () => {
    assert.deepEqual(errors, []);
  });

  console.log(`\nAll end-to-end checks passed. Screenshots in ${OUT}`);
} catch (e) {
  console.error('\n✗ End-to-end test failed:\n', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
