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

  // ---------- v0.2: contexts + suggested target ----------
  const text = (sel) => page.textContent(sel).then((t) => t.trim());
  const historyCount = () => page.locator('#history li').count();
  const pick = (name) => page.locator('#context-picker .seg', { hasText: name }).tap();
  async function session(seconds, result) {
    await page.tap('#start-btn');
    await page.clock.runFor(seconds * 1000);
    await page.tap('#end-btn');
    await page.tap(result === 'good' ? '#good-btn' : '#bad-btn');
    await page.clock.runFor(3_600_000);
  }

  await step('Home shows a suggestion based on its last session (40 s, didn\'t go well → 0:35)', async () => {
    assert.equal(await text('#target-label'), 'Suggested today');
    assert.equal(await text('#target-value'), '0:35');
    assert.match(await text('#target-basis'), /40 s, didn't go well · −10%/);
  });

  await step('switching to Car: empty history, no suggestion yet, filtered graph', async () => {
    await pick('Car');
    assert.equal(await text('h1'), 'Charlie · Car');
    assert.equal(await page.getAttribute('#context-picker .seg >> nth=1', 'aria-pressed'), 'true');
    assert.equal(await text('#target-label'), 'No suggestion yet');
    assert.equal(await text('#target-value'), 'No target');
    assert.ok(await page.isVisible('#empty'));
    assert.equal(await page.locator('.chart .bar').count(), 0);
    await page.screenshot({ path: OUT + '5-car-empty.png', fullPage: true });
  });

  await step('Car session without target: still one tap to start, target stored as none', async () => {
    await session(300, 'good');
    assert.equal(await historyCount(), 1);
    assert.equal(await page.locator('#history .planned').count(), 0);
  });

  await step('after a good 5:00 Car session: suggest 5:30, offer Repeat 5:00', async () => {
    assert.equal(await text('#target-label'), 'Suggested today');
    assert.equal(await text('#target-value'), '5:30');
    assert.match(await text('#target-chips'), /Repeat 5:00/);
    await page.screenshot({ path: OUT + '6-car-suggestion.png', fullPage: true });
  });

  await step('choosing Repeat, then manual − changes the target', async () => {
    await page.locator('.chip', { hasText: 'Repeat' }).tap();
    assert.equal(await text('#target-label'), 'Your target');
    assert.equal(await text('#target-value'), '5:00');
    await page.tap('#target-down');
    assert.equal(await text('#target-value'), '4:45');
    assert.match(await text('#target-chips'), /Use suggestion 5:30/);
  });

  await step('target is shown while training but never stops the timer', async () => {
    await page.tap('#start-btn');
    assert.equal(await text('#training-target'), 'Target 4:45');
    await page.clock.runFor(300_000);
    assert.equal(await text('#timer'), '05:00');
    assert.equal(await text('#training-target'), 'Target 4:45 reached');
    assert.ok(await page.isVisible('#end-btn'));
    await page.screenshot({ path: OUT + '7-training-target.png', fullPage: true });
  });

  await step('timer and target survive closing/reopening mid-session', async () => {
    await page.reload();
    await page.clock.runFor(60_000);
    assert.match(await text('#timer'), /^06:[0-2]\d$/);
    assert.equal(await text('#training-target'), 'Target 4:45 reached');
    assert.equal(await text('h1'), 'Charlie · Car');
  });

  await step('result and history show actual vs target', async () => {
    await page.tap('#end-btn');
    assert.match(await text('#view-result .label'), /6 min [0-2]\d s · target 4:45/);
    await page.tap('#good-btn');
    assert.equal(await historyCount(), 2);
    assert.match(await text('#history li:first-child .dur'), /^6 min [0-2]\d s$/);
    assert.equal(await text('#history li:first-child .planned'), 'target 4:45');
    assert.equal(await page.locator('.chart .target').count(), 1);
    assert.ok(await page.isVisible('#legend-target'));
  });

  await step('"No target" chip starts a session without a target', async () => {
    await page.locator('.chip', { hasText: 'No target' }).tap();
    assert.equal(await text('#target-value'), 'No target');
    await session(30, 'bad');
    assert.equal(await page.locator('#history li:first-child .planned').count(), 0);
  });

  await step('Outside shop is independent too', async () => {
    await pick('Outside shop');
    assert.equal(await text('#target-label'), 'No suggestion yet');
    await session(120, 'bad');
    assert.equal(await text('#target-value'), '1:45');
    assert.equal(await historyCount(), 1);
  });

  await step('each context keeps its own history, graph and suggestion', async () => {
    await pick('Home');
    assert.equal(await historyCount(), 2);
    assert.equal(await page.locator('.chart .bar').count(), 2);
    assert.equal(await text('#target-value'), '0:35');
    await pick('Car');
    assert.equal(await historyCount(), 3);
    assert.equal(await page.locator('.chart .bar').count(), 3);
    assert.equal(await text('#target-value'), '0:25'); // last Car: 30 s, didn't go well
    await page.screenshot({ path: OUT + '8-car-history.png', fullPage: true });
  });

  await step('selected context is remembered after reopening the app', async () => {
    await page.reload();
    assert.equal(await text('h1'), 'Charlie · Car');
  });

  await step('layout still fits phone width', async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
  });
  await ctx.close();

  await step('v0.1 data on the phone is migrated to Home and the original is kept', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    const v1 = JSON.stringify({
      schemaVersion: 1, dogs: [{ id: 'charlie', name: 'Charlie' }], contexts: [{ id: 'home', name: 'Home' }],
      active: null, pending: null,
      sessions: [
        { id: 'x1', dogId: 'charlie', contextId: 'home', startedAt: Date.parse('2026-09-20T10:00'), endedAt: Date.parse('2026-09-20T10:03'), durationSec: 180, result: 'good' },
        { id: 'x2', dogId: 'charlie', contextId: 'home', startedAt: Date.parse('2026-09-21T10:00'), endedAt: Date.parse('2026-09-21T10:04'), durationSec: 240, result: 'good' },
      ],
    });
    await p.addInitScript((data) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.clear();
        localStorage.setItem('alone-training:v1', data);
        sessionStorage.setItem('seeded', '1');
      }
    }, v1);
    await p.goto(APP);
    assert.equal(await p.textContent('h1'), 'Charlie · Home');
    assert.equal(await p.locator('#history li').count(), 2);
    assert.equal((await p.textContent('#target-value')).trim(), '4:30'); // 4:00 good -> +10%
    await p.locator('#context-picker .seg', { hasText: 'Car' }).tap();
    assert.equal(await p.locator('#history li').count(), 0);
    await p.reload();
    assert.equal(await p.locator('#history li').count(), 0); // still Car, remembered
    assert.equal(await p.evaluate(() => localStorage.getItem('alone-training:v1')), v1);
    await c.close();
  });

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
