// End-to-end test: opens the real app on an iPhone-sized screen and taps through it.
// Screenshots go to test-results/.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
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
  page.setDefaultTimeout(8000);
  // The app module loads after the page's load event (boot.js imports it once storage is
  // ready): wait until it has drawn the screen, so the static fallback text is never read.
  const ready = () => page.waitForFunction(() => document.body.dataset.mode || document.body.dataset.welcome === 'true');
  for (const name of ['goto', 'reload', 'goBack']) {
    const orig = page[name].bind(page);
    page[name] = async (...args) => {
      const res = await orig(...args);
      await ready();
      return res;
    };
  }
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
}

async function step(name, fn) {
  await fn();
  console.log(`  ✓ ${name}`);
}

// New browser profiles start as new users: complete the short welcome (English, "Charlie")
// so that the older steps keep testing the same app as before.
async function gotoApp(p, { lang = 'en', dog = 'Charlie' } = {}) {
  await p.goto(APP);
  if (await p.isVisible('#welcome')) {
    await p.tap(`[data-welcome-lang="${lang}"]`);
    await p.fill('#welcome-dog', dog);
    await p.tap('#welcome-start');
  }
}

// The main screen has only the training flow; the rest are pages opened from the ☰ menu.
async function open(p, view) {
  if ((await p.evaluate(() => document.body.dataset.view)) === view) return;
  await p.tap('#menu-btn');
  await p.tap(`#menu [data-nav="${view}"]`);
  await p.waitForFunction((v) => document.body.dataset.view === v, view);
}
const home = (p) => open(p, 'home');

// Choose a backup file: the app shows a review first; nothing changes until "Import".
// Returns { summary, settings, status } (status after confirming / cancelling / an error).
async function importFile(p, file, { useSettings = false, cancel = false, input = '#restore-input' } = {}) {
  await p.setInputFiles(input, file);
  await p.waitForFunction(() =>
    document.getElementById('import-dialog').open || /\S/.test(document.getElementById('data-status').textContent) &&
    !/^(Reading|Läser)/.test(document.getElementById('data-status').textContent));
  if (!(await p.evaluate(() => document.getElementById('import-dialog').open))) {
    return { status: (await p.textContent('#data-status')).trim(), summary: null };
  }
  const summary = (await p.textContent('#import-summary')).trim();
  const settings = (await p.isVisible('#import-settings')) ? (await p.textContent('#import-settings-text')).trim() : '';
  if (useSettings && (await p.isVisible('#import-use-settings'))) await p.check('#import-use-settings');
  await p.tap(cancel ? '#import-cancel' : '#import-confirm');
  return { summary, settings, status: (await p.textContent('#data-status')).trim() };
}

try {
  const ctx = await browser.newContext({ ...phone, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  watch(page);
  await page.clock.install({ time: new Date('2026-09-28T09:00:00') });
  await page.goto(APP);

  await step('first start: short welcome with language and dog name (keyboard works)', async () => {
    assert.ok(await page.isVisible('#welcome'));
    assert.ok(await page.isHidden('#app'));
    assert.equal(await page.textContent('#welcome-title'), 'Welcome to Alone Time');
    assert.match(await page.textContent('#welcome-intro'), /Every dog is different/);
    await page.tap('#welcome-start');
    assert.equal(await page.textContent('#welcome-error'), "Enter your dog's name.");
    await page.fill('#welcome-dog', 'x'.repeat(31));
    await page.press('#welcome-dog', 'Enter');
    assert.equal(await page.textContent('#welcome-error'), "The dog's name can be at most 30 characters.");
    await page.fill('#welcome-dog', '  Charlie ');
    await page.press('#welcome-dog', 'Enter');
    assert.ok(await page.isHidden('#welcome'));
    assert.ok(await page.isHidden('#lang-banner')); // language already chosen
  });

  await step('first launch shows Charlie · Home, Start button and empty state', async () => {
    assert.equal(await page.textContent('h1'), 'Charlie · Home');
    assert.ok(await page.isVisible('#start-btn'));
    assert.ok(await page.isVisible('#empty'));
    assert.ok(await page.isHidden('#history-link'));
    // A brand-new user sees the optional "getting ready at home" hint; it is never forced.
    assert.ok(await page.isVisible('#prep-link'));
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

  await step('"Didn\'t go well" is saved at once and asks the optional worry question', async () => {
    await page.clock.runFor(3_600_000);
    await page.tap('#start-btn');
    await page.clock.runFor(40_000);
    await page.tap('#end-btn');
    await page.tap('#bad-btn');
    assert.ok(await page.isVisible('#view-onset'));
    assert.ok(await page.isHidden('#view-ready'));
    assert.match(await page.textContent('#view-onset .question'), /Roughly when did Charlie start to get worried\?/);
    // Already saved before answering.
    assert.equal(await page.locator('#history li').count(), 2);
    await page.screenshot({ path: OUT + '12-worry-question.png', fullPage: true });
    await page.tap('#onset-unknown');
    assert.ok(await page.isVisible('#start-btn'));
    assert.match(await page.textContent('#history li:first-child'), /40 s[\s\S]*Didn't go well/);
    assert.doesNotMatch(await page.textContent('#history li:first-child'), /worried/);
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

  // ---------- contexts, targets and the time suggestion ----------
  const text = (sel) => page.textContent(sel).then((t) => t.trim());
  const historyCount = () => page.locator('#history li').count();
  const pick = async (name) => {
    await home(page);
    await page.locator('#context-picker .seg', { hasText: name }).tap();
  };
  const nextDay = () => page.clock.fastForward(24 * 3_600_000);
  async function session(seconds, result, onset) {
    await home(page);
    await page.tap('#start-btn');
    await page.clock.runFor(seconds * 1000);
    await page.tap('#end-btn');
    await page.tap(result === 'good' ? '#good-btn' : '#bad-btn');
    if (result !== 'good') {
      if (onset == null) await page.tap('#onset-unknown');
      else {
        await page.fill('#onset-min', String(Math.floor(onset / 60)));
        await page.fill('#onset-sec', String(onset % 60));
        await page.tap('#onset-save');
      }
    }
    await page.clock.runFor(3_600_000);
  }

  await step('Home after a hard session with unknown worry time: no time suggestion, user chooses', async () => {
    assert.equal(await text('#target-label'), 'No automatic target today');
    assert.equal(await text('#target-value'), 'No target');
    assert.equal(await text('#target-basis'), "The latest session didn't go well — choose a short, easy time.");
  });

  await step('switching to Car: empty history, no suggestion, filtered graph', async () => {
    await pick('Car');
    assert.equal(await text('h1'), 'Charlie · Car');
    assert.equal(await page.getAttribute('#context-picker .seg >> nth=1', 'aria-pressed'), 'true');
    assert.equal(await text('#target-label'), 'No automatic target today');
    assert.equal(await text('#target-basis'), 'No sessions logged here yet — choose a short, easy time.');
    assert.ok(await page.isVisible('#empty'));
    assert.equal(await page.locator('.chart .bar').count(), 0);
    await page.screenshot({ path: OUT + '5-car-empty.png', fullPage: true });
  });

  await step('Car session without target: still one tap to start, target stored as none', async () => {
    await session(300, 'good');
    assert.equal(await historyCount(), 1);
    assert.equal(await page.locator('#history .planned').count(), 0);
  });

  await step('one unplanned Car session: kept, but no automatic target and no Repeat', async () => {
    assert.equal(await text('#target-label'), 'No automatic target today');
    assert.equal(await text('#target-value'), 'No target');
    assert.equal(await text('#target-basis'), 'Limited basis — choose a short time. One session counts once more sessions confirm it.');
    assert.doesNotMatch(await text('#target-chips'), /Repeat/);
  });

  await step('type 5:00, then manual − changes the target', async () => {
    await page.tap('#target-up');
    await page.fill('#target-min', '5');
    await page.fill('#target-sec', '0');
    await page.tap('#target-set');
    assert.equal(await text('#target-value'), '5:00');
    await page.tap('#target-down');
    assert.equal(await text('#target-label'), 'Your own target');
    assert.equal(await text('#target-value'), '4:45');
    // The app's own suggestion stays visible and is told apart from the user's target.
    assert.match(await text('#target-basis'), /^No automatic target today\. Limited basis/);
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

  await step('reaching the target does not rate the session – the user still answers', async () => {
    await page.tap('#end-btn');
    assert.ok(await page.isVisible('#view-result'));
    assert.match(await text('#view-result .label'), /6 min [0-2]\d s · target 4:45/);
    await page.tap('#good-btn');
    assert.equal(await historyCount(), 2);
    assert.match(await text('#history li:first-child .dur'), /^6 min [0-2]\d s$/);
    assert.equal(await text('#history li:first-child .planned'), 'target 4:45');
    assert.equal(await page.locator('.chart .target').count(), 1);
  });

  await step('two good Car sessions on the same day → the time both support, no raise', async () => {
    assert.equal(await text('#target-label'), 'Suggestion today');
    assert.equal(await text('#target-value'), '5:00'); // not the longer 6 min 10 s
    assert.equal(await text('#target-basis'), 'Limited basis — repeat 5:00.');
    await page.screenshot({ path: OUT + '6-car-suggestion.png', fullPage: true });
  });

  await step('worry question: time after the end is rejected, a valid time is saved', async () => {
    await page.locator('.chip', { hasText: 'No target' }).tap();
    await page.tap('#start-btn');
    await page.clock.runFor(30_000);
    await page.tap('#end-btn');
    await page.tap('#bad-btn');
    await page.fill('#onset-min', '0');
    await page.fill('#onset-sec', '45');
    await page.tap('#onset-save');
    assert.match(await text('#onset-error'), /longer than the session/);
    assert.ok(await page.isVisible('#view-onset'));
    await page.fill('#onset-sec', '20');
    await page.tap('#onset-save');
    assert.ok(await page.isVisible('#start-btn'));
    assert.match(await text('#history li:first-child .tag'), /Didn't go well · worried at 0:20/);
    assert.equal(await page.locator('#history li:first-child .planned').count(), 0);
  });

  await step('a recent hard session overrides earlier success: suggestion stays below the worry time', async () => {
    assert.equal(await text('#target-value'), '0:16'); // 80 % of 0:20
    assert.equal(await text('#target-basis'), "The latest session didn't go well — the suggestion is below the time when worry started.");
    await page.screenshot({ path: OUT + '9-shorter.png', fullPage: true });
  });

  await step('Outside shop is independent: nothing borrowed from Home or Car', async () => {
    await pick('Outside shop');
    assert.equal(await text('#target-basis'), 'No sessions logged here yet — choose a short, easy time.');
    await session(120, 'bad');
    assert.equal(await text('#target-label'), 'No automatic target today');
    assert.equal(await historyCount(), 1);
  });

  await step('each context keeps its own history, graph and suggestion', async () => {
    await pick('Home');
    assert.equal(await historyCount(), 2);
    assert.equal(await page.locator('.chart .bar').count(), 2);
    assert.equal(await text('#target-value'), 'No target');
    await pick('Car');
    assert.equal(await historyCount(), 3);
    assert.equal(await page.locator('.chart .bar').count(), 3);
    assert.equal(await text('#target-value'), '0:16');
  });

  await step('selected context is remembered after reopening the app', async () => {
    await page.reload();
    assert.equal(await text('h1'), 'Charlie · Car');
  });

  await step('Home: good sessions on two different days → level established → small increase', async () => {
    await pick('Home');
    await nextDay();
    await session(30, 'good');
    // One good session after the hard one is not enough to lift the limit – and the text
    // must not claim that the LATEST session was hard: it went well.
    assert.equal(await text('#target-basis'), 'A recent hard session still limits the suggestion — choose a short, easy time.');
    assert.equal(await text('#target-value'), 'No target');
    await nextDay();
    await session(30, 'good');
    assert.equal(await text('#target-label'), 'Suggestion today');
    assert.equal(await text('#target-value'), '0:35');
    assert.equal(await text('#target-basis'), 'This time went well on different days and the latest session confirmed it — small increase.');
    await page.screenshot({ path: OUT + '8-raise.png', fullPage: true });
  });

  await step('layout still fits phone width', async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
  });

  // ---------- editing ----------
  await step('edit a session: "didn\'t go well" with a worry time; suggestion is recalculated', async () => {
    const before = await historyCount();
    await open(page, 'history');
    await page.locator('#history .row').first().tap();
    assert.ok(await page.isVisible('#edit-dialog'));
    assert.equal(await page.inputValue('#edit-dur-sec'), '30');
    assert.ok(await page.isHidden('#edit-onset-field'));
    assert.ok(await page.isVisible('#edit-uncertain-field'));
    await page.tap('#edit-dialog [data-result="bad"]');
    assert.ok(await page.isVisible('#edit-onset-field'));
    assert.ok(await page.isHidden('#edit-uncertain-field'));
    await page.fill('#edit-onset-sec', '40');
    await page.tap('#edit-save');
    assert.match(await text('#edit-error'), /can't start after the session ended/);
    assert.ok(await page.isVisible('#edit-dialog'));
    await page.fill('#edit-onset-sec', '20');
    await page.screenshot({ path: OUT + '10-edit.png' });
    await page.tap('#edit-save');
    assert.ok(await page.isHidden('#edit-dialog'));
    assert.equal(await historyCount(), before);
    assert.match(await text('#history li:first-child .tag'), /Didn't go well · worried at 0:20/);
    assert.equal(await text('#target-value'), '0:16');
  });

  await step('mark a good session "don\'t count as progress"', async () => {
    await open(page, 'history');
    await page.locator('#history .row').nth(1).tap();
    await page.check('#edit-uncertain');
    await page.tap('#edit-save');
    assert.match(await text('#history li:nth-child(2) .tag'), /Went well · not counted/);
  });

  await step('cancel leaves a session unchanged', async () => {
    await open(page, 'history');
    await page.locator('#history .row').first().tap();
    await page.fill('#edit-dur-min', '9');
    await page.tap('#edit-cancel');
    assert.equal(await text('#history li:first-child .dur'), '30 s');
  });

  await step('editing the place moves a session to another context', async () => {
    const homeCount = await historyCount();
    await open(page, 'history');
    await page.locator('#history .row').first().tap();
    await page.locator('#edit-context .seg', { hasText: 'Outside shop' }).tap();
    await page.tap('#edit-save');
    assert.equal(await historyCount(), homeCount - 1);
    // The history page shows any place without changing the main screen's place.
    await page.locator('#history-picker .seg', { hasText: 'Outside shop' }).tap();
    assert.equal(await historyCount(), 2);
    assert.equal(await text('h1'), 'Charlie · Home');
    await pick('Outside shop');
    assert.equal(await historyCount(), 2);
    await pick('Home');
  });

  await step('delete needs two taps and removes only that session', async () => {
    const homeCount = await historyCount();
    await open(page, 'history');
    await page.locator('#history .row').first().tap();
    await page.tap('#edit-delete');
    assert.equal(await text('#edit-delete'), 'Tap again to delete');
    assert.ok(await page.isVisible('#edit-dialog'));
    await page.tap('#edit-delete');
    assert.equal(await historyCount(), homeCount - 1);
    await page.reload();
    assert.equal(await historyCount(), homeCount - 1);
  });

  await step('history cannot be edited during a running session', async () => {
    await home(page);
    await page.tap('#start-btn');
    assert.equal(await page.locator('#history .row:disabled').count(), await historyCount());
    await page.tap('#end-btn');
    await page.tap('#discard-btn');
  });

  await step('Help explains how the suggestion is calculated', async () => {
    await open(page, 'help');
    await page.tap('#help-calc summary');
    assert.match(await text('#help-calc'), /never raises today's suggestion/);
    assert.match(await text('#help-section'), /last 7 days/);
    assert.match(await text('#help-section'), /Earlier long sessions stay in\s+your history, but don't automatically decide today's time/);
    assert.match(await text('#help-section'), /can't tell how long your dog can safely be alone/);
  });

  let backupPath;
  await step('Save backup downloads a file with every session and records the date', async () => {
    assert.match(await text('#last-backup'), /No backup saved yet/);
    await open(page, 'data');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.tap('#backup-btn')]);
    assert.match(dl.suggestedFilename(), /^alone-time-\d{4}-\d\d-\d\d\.json$/);
    backupPath = OUT + 'backup.json';
    await dl.saveAs(backupPath);
    const data = JSON.parse(await readFile(backupPath, 'utf8'));
    const total = await page.evaluate(() => JSON.parse(localStorage.getItem('alone-training:v2')).sessions.length);
    assert.equal(data.sessions.length, total);
    assert.match(await text('#last-backup'), /Last backup:/);
    assert.match(await text('#data-status'), new RegExp(`Backup saved \\(${total} sessions\\)`));
  });

  await step('Export for Excel downloads a CSV with a header and one row per session', async () => {
    await open(page, 'data');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.tap('#csv-btn')]);
    const csv = await readFile(await dl.path(), 'utf8');
    const lines = csv.trim().split('\r\n');
    assert.equal(lines[1], 'Date;Time;Place;Actual (s);Actual;Target (s);Target;Result;Worried after (s);Worried after;Counted for suggestions;Place ID;Comment');
    assert.match(csv, /;Didn't go well;20;0:20;Yes/);
    const total = await page.evaluate(() => JSON.parse(localStorage.getItem('alone-training:v2')).sessions.length);
    assert.equal(lines.length - 2, total);
    await page.locator('#data-section').screenshot({ path: OUT + '11-data.png' });
  });
  await ctx.close();

  await step('Restore from backup on an empty phone brings everything back; restoring twice adds nothing', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await gotoApp(p);
    assert.equal(await p.locator('#history li').count(), 0);
    const restoreStatus = async (file) => (await importFile(p, file)).status;
    // Cancelling the review changes nothing.
    const cancelled = await importFile(p, backupPath, { cancel: true });
    assert.match(cancelled.summary, /\d+ new sessions will be added/);
    assert.equal(cancelled.status, 'Import cancelled. Nothing was changed.');
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('alone-training:v2') || '{"sessions":[]}').sessions.length), 0);
    assert.match(await restoreStatus(backupPath), /Restored \d+ sessions/);
    const total = JSON.parse(await readFile(backupPath, 'utf8')).sessions.length;
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('alone-training:v2')).sessions.length), total);
    assert.ok((await p.locator('#history li').count()) > 0);
    assert.match(await restoreStatus(backupPath), /Nothing new/);
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('alone-training:v2')).sessions.length), total);
    const junk = { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') };
    assert.match(await restoreStatus(junk), /isn't a backup/);
    await c.close();
  });

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
    await p.clock.install({ time: new Date('2026-09-22T09:00:00') });
    await gotoApp(p);
    assert.equal(await p.textContent('h1'), 'Charlie · Home');
    assert.equal(await p.locator('#history li').count(), 2);
    // 3:00 and 4:00 went well on two days → level 3:00 established → +10 % rounded down = 3:15.
    assert.equal((await p.textContent('#target-value')).trim(), '3:15');
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
      await gotoApp(p);
      assert.equal(await p.locator('.chart .bar').count(), 10); // zoomed in on the latest 10
      assert.equal(await p.locator('#history li').count(), 10);
      assert.equal((await p.textContent('#history-more')).trim(), 'Show all (16)');
      assert.equal((await p.textContent('#chart-note')).trim(), 'The latest 10 of 16 sessions.');
      await p.screenshot({ path: OUT + `4-history-${scheme}.png`, fullPage: true });
      await open(p, 'history');
      await p.screenshot({ path: OUT + `4b-history-page-${scheme}.png`, fullPage: true });
      await c.close();
    });
  }

  await step('Show all expands the history; graph shows the latest 10 with a caption', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await p.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const base = new Date('2026-08-01T10:00:00').getTime();
      const sessions = Array.from({ length: 35 }, (_, i) => ({
        id: 'm' + i, dogId: 'charlie', contextId: 'home', startedAt: base + i * 86_400_000,
        endedAt: base + i * 86_400_000 + 60_000, durationSec: 60 + i * 10, targetSec: null,
        result: i % 5 === 3 ? 'bad' : 'good',
      }));
      localStorage.setItem('alone-training:v2', JSON.stringify({
        schemaVersion: 2, dogs: [{ id: 'charlie', name: 'Charlie' }],
        contexts: [{ id: 'home', name: 'Home' }, { id: 'car', name: 'Car' }, { id: 'outside-shop', name: 'Outside shop' }],
        selectedContextId: 'home', active: null, pending: null, sessions,
      }));
    });
    await gotoApp(p);
    assert.equal(await p.locator('.chart .bar').count(), 10);
    assert.equal((await p.textContent('#chart-note')).trim(), 'The latest 10 of 35 sessions.');
    assert.equal(await p.locator('#history li').count(), 10);
    await open(p, 'history');
    await p.tap('#history-more');
    assert.equal(await p.locator('#history li').count(), 35);
    assert.equal((await p.textContent('#history-more')).trim(), 'Show fewer');
    await p.tap('#history-more');
    assert.equal(await p.locator('#history li').count(), 10);
    await c.close();
  });

  await step('type a time directly: from "No target", + asks for a time; 1-second targets work', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date('2026-10-01T09:00:00') });
    await gotoApp(p);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    assert.equal(await t('#target-value'), 'No target');
    await p.tap('#target-up');
    assert.ok(await p.isVisible('#target-edit'));
    assert.equal(await t('#target-value'), 'No target'); // no guessed 1:00
    assert.equal(await p.evaluate(() => document.activeElement.id), 'target-sec');
    await p.tap('#target-set');
    assert.match(await t('#target-error'), /at least 1 second/);
    await p.fill('#target-sec', '3');
    await p.press('#target-sec', 'Enter'); // keyboard works
    assert.ok(await p.isHidden('#target-edit'));
    assert.equal(await t('#target-value'), '0:03');
    assert.equal(await t('#target-label'), 'Your own target');
    await p.tap('#target-down');
    await p.tap('#target-down');
    assert.equal(await t('#target-value'), '0:01');
    assert.ok(await p.isDisabled('#target-down'));
    await p.tap('#target-value'); // tapping the time opens the input too
    assert.equal(await p.inputValue('#target-sec'), '1');
    await p.fill('#target-min', '2');
    await p.fill('#target-sec', '30');
    await p.tap('#target-set');
    assert.equal(await t('#target-value'), '2:30');
    assert.match(await p.getAttribute('#target-value', 'aria-label'), /Target 2:30\. Tap to type a time\./);
    await p.screenshot({ path: OUT + '13-typed-time.png', fullPage: true });
    // A 2-second session that went well is saved and used.
    await p.tap('#target-value');
    await p.fill('#target-min', '');
    await p.fill('#target-sec', '2');
    await p.tap('#target-set');
    await p.tap('#start-btn');
    await p.clock.runFor(2_000);
    await p.tap('#end-btn');
    await p.tap('#good-btn');
    assert.match(await t('#history li:first-child .dur'), /^2 s$/);
    assert.equal(await t('#history li:first-child .planned'), 'target 0:02');
    assert.equal(await t('#target-basis'), 'Limited basis — repeat 0:02.');
    await c.close();
  });

  await step('after a break: no automatic time, earlier level only as history; a new 10 s session becomes the anchor', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date('2026-10-20T18:00:00') });
    await p.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const day = (d) => new Date(2026, 9, 20 - d, 10).getTime();
      const sessions = [16, 15, 14].map((d, i) => ({
        id: 'old' + i, dogId: 'charlie', contextId: 'home', startedAt: day(d), endedAt: day(d) + 7_200_000,
        durationSec: 7200, targetSec: null, result: 'good',
      }));
      localStorage.setItem('alone-training:v2', JSON.stringify({
        schemaVersion: 2, dogs: [{ id: 'charlie', name: 'Charlie' }],
        contexts: [{ id: 'home', name: 'Home' }, { id: 'car', name: 'Car' }, { id: 'outside-shop', name: 'Outside shop' }],
        selectedContextId: 'home', active: null, pending: null, sessions,
      }));
    });
    await gotoApp(p);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    assert.equal(await t('#target-label'), 'No automatic target today');
    assert.equal(await t('#target-value'), 'No target');
    assert.equal(await t('#target-basis'), "It's been a while. Choose a short time that feels easy today.");
    assert.equal(await t('#earlier-level'), 'Earlier stable level (several sessions): 2:00:00');
    // The longest good session is shown as history (one session, with its date) – no target.
    assert.equal(await t('#best-good'), 'Longest session that went well: 2 h 00 min, October 6');
    assert.equal(await t('#history-facts-title'), "History · not today's target");
    await p.screenshot({ path: OUT + '14-after-break.png', fullPage: true });
    await p.tap('#target-up');
    await p.fill('#target-sec', '10');
    await p.tap('#target-set');
    await p.tap('#start-btn');
    await p.clock.runFor(10_000);
    await p.tap('#end-btn');
    await p.tap('#good-btn');
    assert.equal(await t('#target-value'), '0:10');
    assert.equal(await t('#target-basis'), 'Limited basis — repeat 0:10.');
    assert.ok(await p.isVisible('#earlier-level'));
    assert.equal(await p.locator('#history li').count(), 4); // old history kept
    // Worry right away after that: no positive time from the old level.
    await p.clock.runFor(3_600_000);
    await p.tap('#start-btn');
    await p.clock.runFor(20_000);
    await p.tap('#end-btn');
    await p.tap('#bad-btn');
    await p.fill('#onset-sec', '0');
    await p.tap('#onset-save');
    assert.equal(await t('#target-value'), 'No target');
    assert.equal(await t('#target-basis'), 'Worry from the start in the latest session. Choose an easier step before the next absence.');
    // Reported case: then ONE good 2-hour session without a target → still no target, no Repeat.
    await p.clock.runFor(3_600_000);
    await p.tap('#start-btn');
    await p.clock.fastForward(7_200_000);
    await p.clock.runFor(500);
    await p.tap('#end-btn');
    await p.tap('#good-btn');
    assert.match(await t('#history li:first-child .dur'), /^2 h 00 min$/); // stored unchanged
    assert.equal(await t('#target-value'), 'No target');
    // The latest session went well, so the text names the earlier one as the reason.
    assert.equal(await t('#target-basis'), 'A recent session with worry from the start still limits the suggestion. Choose a short, easy step.');
    assert.doesNotMatch(await t('#target-chips'), /Repeat/);
    // The new 2-hour session is now the longest good one – shown as history, never as a target.
    assert.equal(await t('#best-good'), 'Longest session that went well: 2 h 00 min, October 20');
    assert.equal(await t('#target-label'), 'No automatic target today');
    await c.close();
  });

  // ---------- v0.6: renaming places ----------
  let renamedBackup;
  await step('rename places: old Car sessions stay in "Bilburen" with the same suggestion', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block', acceptDownloads: true });
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date('2026-10-20T18:00:00') });
    await p.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const day = (d, h = 10) => new Date(2026, 9, 20 - d, h).getTime();
      const mk = (id, ctx, d, sec, result, h) => ({
        id, dogId: 'charlie', contextId: ctx, startedAt: day(d, h), endedAt: day(d, h) + sec * 1000,
        durationSec: sec, targetSec: null, result,
      });
      const sessions = [
        mk('c1', 'car', 3, 300, 'good'), mk('c2', 'car', 2, 300, 'good'), mk('c3', 'car', 1, 300, 'good'),
        mk('h1', 'home', 2, 60, 'good', 12), mk('h2', 'home', 1, 60, 'good', 12),
        mk('s1', 'outside-shop', 1, 40, 'bad', 14),
      ];
      localStorage.setItem('alone-training:v2', JSON.stringify({
        schemaVersion: 2, dogs: [{ id: 'charlie', name: 'Charlie' }],
        contexts: [{ id: 'home', name: 'Home' }, { id: 'car', name: 'Car' }, { id: 'outside-shop', name: 'Outside shop' }],
        selectedContextId: 'car', active: null, pending: null, sessions,
      }));
    });
    await gotoApp(p);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    const pickP = async (name) => {
      await home(p);
      await p.locator('#context-picker .seg', { hasText: name }).tap();
    };
    const snapshot = async () => ({ value: await t('#target-value'), basis: await t('#target-basis'), rows: await p.locator('#history li').count() });

    // Existing users keep the default names.
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Home', 'Car', 'Outside shop']);
    const carBefore = await snapshot();
    await pickP('Home');
    const homeBefore = await snapshot();
    await pickP('Outside shop');
    const shopBefore = await snapshot();
    await pickP('Car');
    assert.equal(carBefore.value, '5:30');

    // The settings are a separate page, not part of the main screen.
    assert.ok(await p.isHidden('#settings-form'));
    await open(p, 'settings');
    assert.ok(await p.isVisible('#settings-form'));
    assert.equal(await p.inputValue('#place-name-car'), 'Car');

    // Empty, duplicate and too long names are refused with a clear message.
    await p.fill('#place-name-car', '   ');
    await p.tap('#settings-save');
    assert.equal(await t('#settings-error'), 'Every place needs a name.');
    await p.fill('#place-name-car', ' home ');
    await p.tap('#settings-save');
    assert.equal(await t('#settings-error'), "Two places can't have the same name.");
    await p.fill('#place-name-car', 'x'.repeat(31));
    await p.tap('#settings-save');
    assert.equal(await t('#settings-error'), 'Names can be at most 30 characters.');
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Home', 'Car', 'Outside shop']);

    // Cancel restores the saved names and returns to the main screen.
    await p.tap('#settings-cancel');
    assert.ok(await p.isHidden('#settings-form'));
    assert.ok(await p.isVisible('#start-btn'));
    await open(p, 'settings');
    assert.equal(await p.inputValue('#place-name-car'), 'Car');

    // Save, with spaces trimmed and Swedish characters.
    await p.fill('#place-name-home', '  Hela lägenheten ');
    await p.fill('#place-name-car', 'Bilburen');
    await p.fill('#place-name-outside-shop', 'Sovrummet');
    await p.screenshot({ path: OUT + '15-place-names.png', fullPage: true });
    await p.tap('#settings-save');
    assert.equal(await t('#settings-status'), 'Settings saved.');
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Hela lägenheten', 'Bilburen', 'Sovrummet']);

    // Everywhere the place is shown.
    assert.equal(await t('h1'), 'Charlie · Bilburen');
    assert.equal(await t('#progress-context'), 'Bilburen');
    await open(p, 'history');
    assert.equal(await t('#history-picker .seg[aria-pressed="true"]'), 'Bilburen');
    assert.match(await p.textContent('#help-calc-1'), /Each place \(Hela lägenheten, Bilburen and Sovrummet\)/);
    // Same history and same progression as before.
    assert.deepEqual(await snapshot(), carBefore);
    await pickP('Hela lägenheten');
    assert.deepEqual(await snapshot(), homeBefore);
    await pickP('Sovrummet');
    assert.deepEqual(await snapshot(), shopBefore);
    await pickP('Bilburen');

    // A new session in the renamed place joins the old ones. Rename WHILE it runs.
    await home(p);
    await p.tap('#start-btn');
    await p.clock.runFor(60_000);
    await open(p, 'settings');
    // On another page the running session is shown, with one tap back to the timer.
    assert.ok(await p.isVisible('#live-bar'));
    assert.equal(await t('#live-bar-text'), 'Charlie alone · 01:00');
    await p.fill('#place-name-outside-shop', 'Utanför affären');
    await p.tap('#settings-save');
    await p.clock.runFor(30_000);
    assert.equal(await t('#live-bar-text'), 'Charlie alone · 01:30');
    await p.screenshot({ path: OUT + '16-rename-while-training.png', fullPage: true });
    await p.tap('#live-bar');
    assert.equal(await t('#timer'), '01:30');
    assert.equal(await t('h1'), 'Charlie · Bilburen');
    await p.tap('#end-btn');
    await p.tap('#good-btn');
    assert.equal(await p.locator('#history li').count(), 4);
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('alone-training:v2')));
    assert.equal(stored.sessions.filter((x) => x.contextId === 'car').length, 4);
    assert.equal(stored.sessions.length, 7); // nothing moved, copied or deleted

    // Edit sheet shows the new names too.
    await open(p, 'history');
    await p.locator('#history .row').first().tap();
    assert.deepEqual(await p.locator('#edit-context .seg').allTextContents(), ['Hela lägenheten', 'Bilburen', 'Utanför affären']);
    await p.tap('#edit-cancel');

    // Reload: names and sessions are still there.
    await p.reload();
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Hela lägenheten', 'Bilburen', 'Utanför affären']);
    assert.equal(await p.locator('#history li').count(), 4);

    // Excel: shown names + stable id.
    await open(p, 'data');
    const [csvDl] = await Promise.all([p.waitForEvent('download'), p.tap('#csv-btn')]);
    const csv = await readFile(await csvDl.path(), 'utf8');
    assert.match(csv, /;Bilburen;300;5:00;;;Went well;;;Yes;car;\r\n/);
    assert.match(csv, /;Hela lägenheten;60;1:00;/);
    assert.match(csv, /;Utanför affären;40;0:40;;;Didn't go well;;;Yes;outside-shop/);

    // New backup with own names.
    await open(p, 'data');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.tap('#backup-btn')]);
    renamedBackup = OUT + 'backup-renamed.json';
    await dl.saveAs(renamedBackup);
    const data = JSON.parse(await readFile(renamedBackup, 'utf8'));
    assert.deepEqual(data.contexts.map((x) => x.name), ['Hela lägenheten', 'Bilburen', 'Utanför affären']);

    // Old backup without names: sessions only, current names untouched, no name prompt.
    const oldBackup = { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      sessions: [{ id: 'old1', dogId: 'charlie', contextId: 'car', startedAt: new Date(2026, 8, 1, 10).getTime(), durationSec: 120, result: 'good' }],
    })) };
    const oldImport = await importFile(p, oldBackup);
    assert.match(oldImport.status, /Restored 1 session/);
    assert.equal(oldImport.settings, ''); // no names in an old backup → nothing to offer
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Hela lägenheten', 'Bilburen', 'Utanför affären']);
    assert.equal(await p.locator('#history li').count(), 5); // the old Car session lands in Bilburen

    // Long names still fit the phone width.
    await open(p, 'settings');
    await p.fill('#place-name-home', 'Hela lägenheten med balkongen');
    await p.tap('#settings-save');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    await p.screenshot({ path: OUT + '17-long-names.png', fullPage: true });
    await c.close();
  });

  await step('restoring a backup with other names never changes names silently; the user chooses', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await gotoApp(p);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    // Review first: other place names are listed, and NOT applied unless ticked.
    await p.setInputFiles('#restore-input', renamedBackup);
    await p.waitForFunction(() => document.getElementById('import-dialog').open);
    assert.match(await t('#import-summary'), /7 new sessions will be added/); // backup taken before the old session was restored
    assert.match(await t('#import-settings-text'), /“Bilburen” instead of “Car”/);
    assert.equal(await p.isChecked('#import-use-settings'), false);
    await p.screenshot({ path: OUT + '18-import-review.png', fullPage: true });
    await p.check('#import-use-settings');
    await p.tap('#import-confirm');
    assert.match(await t('#data-status'), /Restored 7 sessions\. Settings from the backup are now used\./);
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Hela lägenheten', 'Bilburen', 'Utanför affären']);
    await p.reload();
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Hela lägenheten', 'Bilburen', 'Utanför affären']);
    // "Keep my names" path.
    const c2 = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p2 = await c2.newPage();
    await gotoApp(p2);
    const kept = await importFile(p2, renamedBackup); // box not ticked → own names kept
    assert.match(kept.settings, /instead of/);
    assert.deepEqual(await p2.locator('#context-picker .seg').allTextContents(), ['Home', 'Car', 'Outside shop']);
    await c2.close();
    await c.close();
  });

  await step('names are shown as plain text (no HTML from a name)', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await gotoApp(p);
    await open(p, 'settings');
    await p.fill('#place-name-car', '<b>Bil</b> & "co"');
    await p.tap('#settings-save');
    assert.equal(await p.locator('#context-picker b').count(), 0);
    assert.equal((await p.locator('#context-picker .seg').nth(1).textContent()), '<b>Bil</b> & "co"');
    await c.close();
  });

  // ---------- v0.7: Swedish, dog name, comments, welcome ----------
  await step('Swedish all the way: welcome → timer → end with comment → worry → history → edit', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block', locale: 'sv-SE', acceptDownloads: true });
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date('2026-10-05T09:00:00') });
    await p.goto(APP);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    // The phone is Swedish: the welcome starts in Swedish.
    assert.equal(await t('#welcome-title'), 'Välkommen till Alone Time');
    assert.match(await t('#welcome-intro'), /Alla hundar är olika/);
    assert.match(await t('#welcome-intro'), /inte individuella träningsråd/);
    await p.fill('#welcome-dog', 'Majken');
    await p.tap('#welcome-start');
    assert.equal(await t('h1'), 'Majken · Hemma');
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Hemma', 'Bilen', 'Utanför affären']);
    assert.equal(await p.getAttribute('html', 'lang'), 'sv');
    assert.equal(await t('#target-basis'), 'Inga pass loggade här än – välj en kort, lätt tid.');
    assert.equal(await p.getAttribute('#target-up', 'aria-label'), 'Längre mål');

    // Session 1: no comment.
    await p.tap('#start-btn');
    assert.equal(await t('#training-label'), 'Majken har varit ensam i');
    await p.clock.runFor(40_000);
    // Reload mid-session: timer continues.
    await p.reload();
    await p.clock.runFor(2_000);
    assert.match(await t('#timer'), /^00:4\d$/);
    await p.tap('#end-btn');
    assert.equal(await t('#view-result .question'), 'Hur gick det?');
    await p.tap('#good-btn');
    assert.equal(await p.locator('#history .note').count(), 0);

    // Session 2: comment, survives a reload on the result screen, saved with the result.
    await p.clock.fastForward(24 * 3_600_000);
    await p.tap('#start-btn');
    await p.clock.runFor(60_000);
    await p.tap('#end-btn');
    // The comment box comes BEFORE the two result buttons: write first, then rate.
    const box = async (sel) => (await p.locator(sel).boundingBox()).y;
    assert.ok((await box('#result-comment')) < (await box('#good-btn')));
    assert.ok((await box('#result-comment')) < (await box('#bad-btn')));
    await p.fill('#result-comment', 'Grannhunden skällde.\nHan lade sig efter en stund.');
    await p.reload();
    assert.equal(await p.inputValue('#result-comment'), 'Grannhunden skällde.\nHan lade sig efter en stund.');
    await p.screenshot({ path: OUT + '19-sv-result-comment.png', fullPage: true });
    await p.tap('#good-btn');
    assert.match(await t('#history li:first-child .note'), /Grannhunden skällde\.\s+Han lade sig efter en stund\./);

    // Session 3: comment + "didn't go well" + worry time.
    await p.clock.fastForward(24 * 3_600_000);
    await p.tap('#start-btn');
    await p.clock.runFor(90_000);
    await p.tap('#end-btn');
    await p.fill('#result-comment', '=Jag glömde stoppa timern');
    await p.tap('#bad-btn');
    assert.equal(await t('#onset-question'), 'Ungefär när började Majken bli orolig?');
    await p.fill('#onset-sec', '99');
    await p.tap('#onset-save');
    assert.equal(await t('#onset-error'), 'Ange hela minuter och 0–59 sekunder.');
    await p.fill('#onset-min', '1');
    await p.fill('#onset-sec', '10');
    await p.tap('#onset-save');
    assert.match(await t('#history li:first-child .tag'), /Gick inte bra · orolig efter 1:10/);
    assert.equal(await t('#history li:first-child .note'), '=Jag glömde stoppa timern');
    assert.match(await t('#history li:first-child .when'), /^(mån|tis|ons|tors|fre|lör|sön)/); // Swedish date
    assert.equal(await t('#target-basis'), 'Senaste passet gick inte bra – förslaget ligger under tiden då oron började.');
    const suggestionBefore = await t('#target-value');
    await p.screenshot({ path: OUT + '20-sv-history.png', fullPage: true });

    // Edit: comment changed, then removed – suggestion unchanged.
    await open(p, 'history');
    await p.locator('#history .row').first().tap();
    assert.equal(await p.inputValue('#edit-comment'), '=Jag glömde stoppa timern');
    assert.equal(await t('#edit-title'), 'Ändra pass');
    await p.fill('#edit-comment', 'Ny kommentar');
    await p.tap('#edit-save');
    assert.equal(await t('#history li:first-child .note'), 'Ny kommentar');
    assert.equal(await t('#target-value'), suggestionBefore);
    await open(p, 'history');
    await p.locator('#history .row').first().tap();
    await p.fill('#edit-comment', '   ');
    await p.tap('#edit-save');
    assert.equal(await p.locator('#history li:first-child .note').count(), 0);
    assert.equal(await t('#target-value'), suggestionBefore);

    // A very long comment is cut to 500 characters, shown shortened, complete in the sheet.
    await open(p, 'history');
    await p.locator('#history .row').nth(1).tap();
    await p.fill('#edit-comment', 'Å'.repeat(600));
    assert.equal((await p.inputValue('#edit-comment')).length, 500);
    await p.tap('#edit-save');
    const noteBox = await p.locator('#history li:nth-child(2) .note').boundingBox();
    assert.ok(noteBox.height < 60, `note height ${noteBox.height}`); // two lines at most
    await open(p, 'history');
    await p.locator('#history .row').nth(1).tap();
    assert.equal((await p.inputValue('#edit-comment')).length, 500);
    await p.tap('#edit-cancel');

    // Excel in Swedish mode: comment column, formula-like text neutralised, Swedish letters.
    await open(p, 'history');
    await p.locator('#history .row').first().tap();
    await p.fill('#edit-comment', '=SUMMA(A1)\n"citat"; åäö');
    await p.tap('#edit-save');
    await open(p, 'data');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.tap('#csv-btn')]);
    const csv = await readFile(await dl.path(), 'utf8');
    assert.ok(csv.includes(';home;"\'=SUMMA(A1)\n""citat""; åäö"\r\n'), csv);
    assert.equal(await t('#data-status'), 'Excel-filen är skapad.');
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await c.close();
  });

  await step('existing user: no welcome, Charlie and history kept; optional language choice; renames keep everything', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date('2026-10-20T18:00:00') });
    await p.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const day = (d) => new Date(2026, 9, 20 - d, 10).getTime();
      const sessions = [3, 2, 1].map((d, i) => ({
        id: 'x' + i, dogId: 'charlie', contextId: 'car', startedAt: day(d), endedAt: day(d) + 300_000,
        durationSec: 300, targetSec: null, result: 'good',
      }));
      // Saved by v0.6: no lang, no onboarded flag, a renamed place.
      localStorage.setItem('alone-training:v2', JSON.stringify({
        schemaVersion: 2, dogs: [{ id: 'charlie', name: 'Charlie' }],
        contexts: [{ id: 'home', name: 'Home' }, { id: 'car', name: 'Bilburen' }, { id: 'outside-shop', name: 'Outside shop' }],
        selectedContextId: 'car', active: null, pending: null, sessions,
      }));
    });
    await p.goto(APP);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    assert.ok(await p.isHidden('#welcome'));
    assert.equal(await t('h1'), 'Charlie · Bilburen');
    assert.ok(await p.isVisible('#lang-banner')); // small, optional
    const before = { value: await t('#target-value'), rows: await p.locator('#history li').count() };
    assert.equal(before.value, '5:30');

    // The banner never shows during a running session.
    await p.tap('#start-btn');
    assert.ok(await p.isHidden('#lang-banner'));
    await p.tap('#end-btn');
    await p.tap('#discard-btn');

    // Choose Swedish: interface translated, the user's names untouched (also the default English ones).
    await p.tap('[data-banner-lang="sv"]');
    assert.ok(await p.isHidden('#lang-banner'));
    assert.equal(await t('#start-btn'), 'Starta träning');
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Home', 'Bilburen', 'Outside shop']);
    assert.equal(await t('#target-value'), before.value);
    assert.equal(await p.locator('#history li').count(), before.rows);
    await p.screenshot({ path: OUT + '21-existing-user-sv.png', fullPage: true });

    // Settings: validation, then rename the dog.
    await open(p, 'settings');
    assert.equal(await p.inputValue('#settings-dog'), 'Charlie');
    await p.fill('#settings-dog', '   ');
    await p.tap('#settings-save');
    assert.equal(await t('#settings-error'), 'Skriv hundens namn.');
    await p.fill('#settings-dog', 'Ö'.repeat(31));
    await p.tap('#settings-save');
    assert.equal(await t('#settings-error'), 'Hundens namn får vara högst 30 tecken.');
    await p.fill('#settings-dog', '  Sixten ');
    await p.fill('#place-name-home', ' home ');
    await p.fill('#place-name-car', 'Home');
    await p.tap('#settings-save');
    assert.equal(await t('#settings-error'), 'Två spår kan inte ha samma namn.');
    await p.fill('#place-name-home', 'Hallen');
    await p.fill('#place-name-car', 'Bilburen');
    await p.screenshot({ path: OUT + '22-settings-sv.png', fullPage: true });
    await p.tap('#settings-save');
    assert.equal(await t('#settings-status'), 'Inställningarna är sparade.');
    assert.equal(await t('h1'), 'Sixten · Bilburen');
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('alone-training:v2')));
    assert.equal(stored.dogs[0].id, 'charlie'); // stable id
    assert.equal(stored.dogs[0].name, 'Sixten');
    assert.ok(stored.sessions.every((x) => x.dogId === 'charlie'));
    assert.equal(stored.sessions.length, 3);
    assert.equal(await t('#target-value'), before.value);

    // Dog name during a running session: timer and session unaffected.
    await home(p);
    await p.tap('#start-btn');
    await p.clock.runFor(30_000);
    await open(p, 'settings');
    await p.fill('#settings-dog', 'Sixten den store');
    await p.tap('#settings-save');
    await p.clock.runFor(15_000);
    assert.equal(await t('#live-bar-text'), 'Sixten den store ensam · 00:45');
    assert.equal(await t('#live-bar-action'), 'Tillbaka till timern');
    await p.tap('#live-bar');
    assert.equal(await t('#timer'), '00:45');
    assert.equal(await t('#training-label'), 'Sixten den store har varit ensam i');
    await p.tap('#end-btn');
    await p.tap('#good-btn');
    assert.equal(await p.locator('#history li').count(), 4);

    // Switch back to English in settings: names stay exactly as they are.
    await open(p, 'settings');
    await p.check('input[name="settings-lang"][value="en"]');
    await p.tap('#settings-save');
    assert.equal(await t('#start-btn'), 'Start training');
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Hallen', 'Bilburen', 'Outside shop']);
    await p.reload();
    assert.equal(await t('h1'), 'Sixten den store · Bilburen');
    assert.equal(await t('#start-btn'), 'Start training');
    assert.ok(await p.isHidden('#lang-banner'));

    // Keyboard + labels: every button and input in the ready screen has an accessible name.
    await home(p);
    const unnamed = await p.evaluate(() => [...document.querySelectorAll('#view-ready button, #view-ready input')]
      .filter((el) => el.offsetParent && !(el.getAttribute('aria-label') || el.textContent.trim() || el.labels?.length)).length);
    assert.equal(unnamed, 0);
    await c.close();
  });

  await step('backup with dog name, language and comments; old backups never overwrite settings', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block', acceptDownloads: true });
    const p = await c.newPage();
    watch(p);
    await gotoApp(p, { lang: 'sv', dog: 'Majken' });
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    await p.tap('#start-btn');
    await p.tap('#end-btn');
    await p.fill('#result-comment', 'Lugn hela tiden');
    await p.tap('#good-btn');
    await open(p, 'data');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.tap('#backup-btn')]);
    const path = OUT + 'backup-v07.json';
    await dl.saveAs(path);
    const data = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(data.lang, 'sv');
    assert.equal(data.dogs[0].name, 'Majken');
    assert.equal(data.sessions[0].comment, 'Lugn hela tiden');
    assert.deepEqual(data.contexts.map((x) => x.name), ['Hemma', 'Bilen', 'Utanför affären']);

    // Restore into an English "Charlie" phone: sessions + comments added, settings only offered.
    const c2 = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p2 = await c2.newPage();
    watch(p2);
    await gotoApp(p2);
    const t2 = (sel) => p2.textContent(sel).then((x) => x.trim());
    await p2.setInputFiles('#restore-input', path);
    await p2.waitForFunction(() => document.getElementById('import-dialog').open);
    assert.equal(await t2('h1'), 'Charlie · Home');
    assert.match(await t2('#import-settings-text'), /dog “Majken” instead of “Charlie”/);
    assert.match(await t2('#import-settings-text'), /Svenska instead of English/);
    assert.match(await t2('#import-settings-text'), /“Hemma” instead of “Home”/);
    assert.match(await t2('#import-summary'), /1 new session will be added[\s\S]*1 of them with a comment/);
    await p2.check('#import-use-settings');
    await p2.tap('#import-confirm');
    assert.equal(await t2('#history li:first-child .note'), 'Lugn hela tiden');
    assert.equal(await t2('h1'), 'Majken · Hemma');
    assert.equal(await t2('#start-btn'), 'Starta träning');

    // An old backup without these fields: nothing changes, no prompt.
    const old = { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      sessions: [{ id: 'o1', dogId: 'charlie', contextId: 'home', startedAt: new Date(2026, 8, 1, 10).getTime(), durationSec: 60, result: 'good' }],
    })) };
    const oldRes = await importFile(p2, old);
    assert.equal(oldRes.status, 'Återställde 1 pass.');
    assert.equal(oldRes.settings, '');
    assert.equal(await t2('h1'), 'Majken · Hemma');
    await c2.close();
    await c.close();
  });

  await step('dark mode, Swedish, with comments: readable, fits the phone', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block', colorScheme: 'dark' });
    const p = await c.newPage();
    watch(p);
    await gotoApp(p, { lang: 'sv', dog: 'Majken' });
    await p.tap('#start-btn');
    await p.tap('#end-btn');
    await p.fill('#result-comment', 'Han lade sig efter en stund. Grannhunden skällde två gånger men sedan var det lugnt resten av passet.');
    await p.tap('#good-btn');
    await p.screenshot({ path: OUT + '23-dark-sv-home.png', fullPage: true });
    await open(p, 'help');
    await p.tap('#help-intro summary');
    assert.match(await p.textContent('#help-intro-body'), /Exempel:/);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await p.screenshot({ path: OUT + '23-dark-sv.png', fullPage: true });
    await c.close();
  });

  await step('icons referenced by the manifest and the page exist', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    await p.goto(APP);
    const manifest = await (await p.request.get(APP + 'manifest.webmanifest')).json();
    const links = await p.evaluate(() => [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => l.getAttribute('href')));
    for (const src of [...manifest.icons.map((i) => i.src), ...links]) {
      const res = await p.request.get(APP + src);
      assert.equal(res.status(), 200, src);
    }
    await c.close();
  });

  // ---------- v0.8: iOS app (simulated native bridge), import review, Swedish names ----------
  // Simulates what Capacitor provides inside the iOS app: Preferences (durable storage), the
  // app's LiveActivity plugin, Filesystem and Share. Calls are recorded, also across reloads.
  const nativeMock = () => {
    const S = (k, v) => (v === undefined ? JSON.parse(sessionStorage.getItem(k) || 'null') : sessionStorage.setItem(k, JSON.stringify(v)));
    const log = (entry) => S('__calls', [...(S('__calls') || []), entry]);
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        Preferences: {
          get: async ({ key }) => ({ value: (S('__prefs') || {})[key] ?? null }),
          set: async ({ key, value }) => S('__prefs', { ...(S('__prefs') || {}), [key]: value }),
        },
        LiveActivity: {
          start: async (payload) => (log(['start', payload]), { started: true }),
          end: async () => log(['end']),
        },
        Filesystem: {
          writeFile: async ({ path, data }) => (log(['writeFile', path, data.length]), { uri: `file:///cache/${path}` }),
        },
        Share: { share: async (o) => log(['share', o.url]) },
      },
    };
  };

  await step('iOS app: Live Activity starts with a session, survives reopening, ends on End/discard; data is kept natively', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await p.addInitScript(nativeMock);
    await p.clock.install({ time: new Date('2026-10-06T09:00:00') });
    const calls = () => p.evaluate(() => JSON.parse(sessionStorage.getItem('__calls') || '[]'));
    const last = async () => (await calls()).at(-1);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    await gotoApp(p, { lang: 'sv', dog: 'Majken' });
    assert.deepEqual(await last(), ['end']); // app opened without a session: no stale activity left

    // Start with a target.
    await p.tap('#target-up');
    await p.fill('#target-sec', '30');
    await p.tap('#target-set');
    await p.tap('#start-btn');
    const [kind, payload] = await last();
    assert.equal(kind, 'start');
    assert.equal(payload.aloneForLabel, 'Majken har varit ensam i');
    assert.equal(payload.placeName, 'Hemma');
    assert.equal(payload.targetLabel, 'Mål 0:30');
    // The lock-screen timer counts from exactly the session's saved start time.
    assert.equal(payload.startedAt, await p.evaluate(() => JSON.parse(localStorage.getItem('alone-training:v2')).active.startedAt));

    // Past the target: nothing ends by itself.
    await p.clock.runFor(45_000);
    assert.equal((await last())[0], 'start');
    assert.ok(await p.isVisible('#end-btn'));

    // Reopen: same session → the activity is restored with the same start time.
    await p.reload();
    await p.clock.runFor(1_000);
    assert.match(await t('#timer'), /^00:4\d$/);
    const [k2, p2] = await last();
    assert.equal(k2, 'start');
    assert.equal(p2.sessionId, payload.sessionId);

    // iOS cleared the web view's storage: the data comes back from native storage.
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.clock.runFor(1_000);
    assert.equal(await t('h1'), 'Majken · Hemma');
    assert.match(await t('#timer'), /^00:4\d$/);

    // End → activity ends right away (before choosing a result); discard keeps it ended.
    await p.tap('#end-btn');
    assert.deepEqual(await last(), ['end']);
    await p.tap('#discard-btn');
    assert.deepEqual(await last(), ['end']);

    // Save backup in the app: written to a file and shared (→ Save to Files).
    await open(p, 'data');
    await p.tap('#backup-btn');
    await p.waitForFunction(() => JSON.parse(sessionStorage.getItem('__calls') || '[]').some((x) => x[0] === 'share'));
    const shared = (await calls()).filter((x) => x[0] === 'writeFile' || x[0] === 'share');
    assert.match(shared[0][1], /^alone-time-\d{4}-\d\d-\d\d\.json$/);
    assert.match(shared[1][1], /^file:\/\/\/cache\/alone-time-/);
    assert.match(await t('#data-status'), /^Säkerhetskopian är sparad/);
    await c.close();
  });

  await step('first start on a new phone (e.g. the iOS app): import the old backup from the welcome screen, after a review', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await p.goto(APP);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    assert.ok(await p.isVisible('#welcome-import-input'));
    // Not a backup: a clear message, still on the welcome screen.
    await p.setInputFiles('#welcome-import-input', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
    await p.waitForFunction(() => /\S/.test(document.getElementById('welcome-error').textContent));
    assert.equal(await t('#welcome-error'), "This file isn't a backup from this app.");
    // The real backup (dog Majken, Swedish, comments) made earlier.
    await p.setInputFiles('#welcome-import-input', OUT + 'backup-v07.json');
    await p.waitForFunction(() => document.getElementById('import-dialog').open);
    assert.match(await t('#import-summary'), /1 new session will be added/);
    assert.match(await t('#import-settings-text'), /dog “Majken”, language Svenska, places Hemma, Bilen and Utanför affären/);
    assert.ok(await p.isHidden('#import-use-settings-field'));
    await p.tap('#import-confirm');
    assert.ok(await p.isHidden('#welcome'));
    assert.equal(await t('h1'), 'Majken · Hemma');
    assert.equal(await t('#start-btn'), 'Starta träning');
    assert.equal(await t('#history li:first-child .note'), 'Lugn hela tiden');
    await c.close();
  });

  await step('choosing Swedish offers Swedish names only for untouched English default names', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await p.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('alone-training:v2', JSON.stringify({
        schemaVersion: 2, dogs: [{ id: 'charlie', name: 'Charlie' }],
        contexts: [{ id: 'home', name: 'Home' }, { id: 'car', name: 'Bilburen' }, { id: 'outside-shop', name: 'Outside shop' }],
        selectedContextId: 'home', active: null, pending: null, sessions: [],
      }));
    });
    await p.goto(APP);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    assert.ok(await p.isHidden('#names-offer'));
    await p.tap('[data-banner-lang="sv"]');
    assert.ok(await p.isVisible('#names-offer'));
    assert.equal(await t('#names-offer-text'), 'Byta spårnamnen till svenska? Home → Hemma, Outside shop → Utanför affären');
    await p.screenshot({ path: OUT + '24-names-offer.png', fullPage: true });
    // Nothing changed yet.
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Home', 'Bilburen', 'Outside shop']);
    await p.tap('#names-offer-apply');
    assert.ok(await p.isHidden('#names-offer'));
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Hemma', 'Bilburen', 'Utanför affären']);
    // "Keep current" path, via Settings.
    await open(p, 'settings');
    await p.check('input[name="settings-lang"][value="en"]');
    await p.tap('#settings-save');
    assert.equal(await t('#names-offer-text'), 'Use English names for the places? Hemma → Home, Utanför affären → Outside shop');
    await home(p);
    await p.tap('#names-offer-keep');
    assert.ok(await p.isHidden('#names-offer'));
    assert.deepEqual(await p.locator('#context-picker .seg').allTextContents(), ['Hemma', 'Bilburen', 'Utanför affären']);
    await c.close();
  });

  await step('timer stays correct when switching to another app and back', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date('2026-10-01T09:00:00') });
    await gotoApp(p);
    await p.tap('#start-btn');
    const setHidden = (hidden) => p.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await setHidden(true);
    await p.clock.fastForward(12 * 60_000); // 12 min in another app / screen locked
    await setHidden(false);
    await p.clock.runFor(300);
    assert.equal((await p.textContent('#timer')).trim(), '12:00');
    await c.close();
  });

  await step('works offline after the first visit (service worker)', async () => {
    const c = await browser.newContext({ ...phone });
    const p = await c.newPage();
    watch(p);
    await gotoApp(p);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload();
    await p.waitForFunction(() => navigator.serviceWorker.controller != null);
    await c.setOffline(true);
    await p.reload();
    assert.equal((await p.textContent('h1')).trim(), 'Charlie · Home');
    await p.tap('#start-btn');
    assert.ok(await p.isVisible('#timer'));
    await c.close();
  });

  // ---------- v0.9: menu and pages, comment before rating, suggestion texts, record, getting ready ----------
  await step('menu: four separate pages, a clear way back, the phone\'s back gesture works', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await gotoApp(p);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    // The main screen no longer carries the long sections.
    for (const sel of ['#history', '#settings-form', '#backup-btn', '#help-calc']) assert.ok(await p.isHidden(sel), sel);
    assert.equal(await p.getAttribute('#menu-btn', 'aria-expanded'), 'false');
    assert.equal(await p.getAttribute('#menu-btn', 'aria-label'), 'Menu');
    await p.tap('#menu-btn');
    assert.equal(await p.getAttribute('#menu-btn', 'aria-expanded'), 'true');
    assert.deepEqual((await p.locator('#menu .menu-item').allTextContents()).map((x) => x.trim()),
      ['Main screen', 'Previous sessions', 'Settings', 'Your data', 'Help']);
    await p.keyboard.press('Escape');
    assert.ok(await p.isHidden('#menu'));
    // Tapping outside closes it too.
    await p.tap('#menu-btn');
    await p.tap('h1');
    assert.ok(await p.isHidden('#menu'));
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('alone-training:v2')).active), null);
    for (const [view, title] of [['history', 'Previous sessions'], ['settings', 'Settings'], ['data', 'Your data'], ['help', 'Help']]) {
      await open(p, view);
      assert.ok(await p.isHidden('#page-home'));
      assert.ok(await p.isHidden('#live-bar')); // nothing running
      assert.equal(await t(`#${view}-title`), title);
      assert.equal(await p.evaluate(() => document.activeElement.id), `${view}-title`);
      await p.locator(`#page-${view} .back-btn`).tap();
      assert.ok(await p.isVisible('#start-btn'));
    }
    // Reopening the app on the settings page shows the saved values.
    await open(p, 'settings');
    await p.reload();
    assert.equal(await p.inputValue('#settings-dog'), 'Charlie');
    assert.equal(await p.inputValue('#place-name-car'), 'Car');
    await p.locator('#page-settings .back-btn').tap();
    // The phone's own back gesture/button returns to the main screen.
    await open(p, 'help');
    await p.goBack();
    await p.waitForFunction(() => document.body.dataset.view === 'home');
    assert.ok(await p.isVisible('#start-btn'));
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await c.close();
  });

  await step('a running session is never lost while moving between pages (incl. reload); both results; comment first', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block', locale: 'sv-SE' });
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date('2026-10-10T09:00:00') });
    await gotoApp(p, { lang: 'sv', dog: 'Majken' });
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('alone-training:v2')));

    await p.tap('#start-btn');
    await p.clock.runFor(90_000);
    await p.screenshot({ path: OUT + '25-training-sv.png' });
    // The menu is there, but the timer and End are as big and clear as before.
    assert.ok((await p.locator('#end-btn').boundingBox()).height >= 120);
    await p.tap('#menu-btn');
    await p.screenshot({ path: OUT + '26-menu-sv.png' });
    await p.tap('#menu [data-nav="history"]');
    assert.equal(await t('#live-bar-text'), 'Majken ensam · 01:30');
    await p.reload(); // closing and reopening the app on another page
    await p.clock.runFor(10_000);
    assert.match(await t('#live-bar-text'), /^Majken ensam · 01:4\d$/);
    assert.ok((await stored()).active);
    await p.tap('#live-bar');
    assert.match(await t('#timer'), /^01:4\d$/);
    await p.tap('#end-btn');

    // Result waiting: still not lost when looking at another page.
    await open(p, 'help');
    assert.equal(await t('#live-bar-text'), 'Passet är avslutat – inte bedömt än');
    await p.tap('#live-bar');
    assert.ok(await p.isVisible('#view-result'));
    // Write the observation first, then choose the result.
    await p.fill('#result-comment', 'Pep lite i början, lade sig sedan.');
    await p.screenshot({ path: OUT + '27-result-comment-first-sv.png' });
    await open(p, 'data'); // the typed comment survives a detour
    await home(p);
    assert.equal(await p.inputValue('#result-comment'), 'Pep lite i början, lade sig sedan.');
    await p.tap('#good-btn');
    let s = await stored();
    assert.equal(s.sessions.at(-1).result, 'good');
    assert.equal(s.sessions.at(-1).comment, 'Pep lite i början, lade sig sedan.');
    assert.ok(s.sessions.at(-1).durationSec >= 100 && s.sessions.at(-1).durationSec < 110);

    // "Gick inte bra" with a comment.
    await p.clock.runFor(3_600_000);
    await p.tap('#start-btn');
    await p.clock.runFor(30_000);
    await p.tap('#end-btn');
    assert.equal(await p.inputValue('#result-comment'), ''); // a new session starts empty
    await p.fill('#result-comment', 'Skällde vid dörren.');
    await p.tap('#bad-btn');
    await p.tap('#onset-unknown');
    s = await stored();
    assert.equal(s.sessions.at(-1).result, 'bad');
    assert.equal(s.sessions.at(-1).comment, 'Skällde vid dörren.');

    // A discarded session is not saved – neither the session nor its comment.
    await p.clock.runFor(3_600_000);
    await p.tap('#start-btn');
    await p.clock.runFor(5_000);
    await p.tap('#end-btn');
    await p.fill('#result-comment', 'Fel start');
    await p.tap('#discard-btn');
    s = await stored();
    assert.equal(s.sessions.length, 2);
    assert.equal(s.pending, null);
    assert.ok(!JSON.stringify(s).includes('Fel start'));

    // The comment can still be edited later, from Previous sessions.
    await open(p, 'history');
    assert.equal(await t('#history li:first-child .note'), 'Skällde vid dörren.');
    await p.locator('#history .row').first().tap();
    assert.equal(await p.inputValue('#edit-comment'), 'Skällde vid dörren.');
    await p.fill('#edit-comment', 'Skällde vid dörren, lugnade sig efter en minut.');
    await p.tap('#edit-save');
    assert.equal(await t('#history li:first-child .note'), 'Skällde vid dörren, lugnade sig efter en minut.');
    assert.equal((await stored()).sessions.length, 2);
    await c.close();
  });

  await step('Swedish: a hard session followed by a good one – "nyligt", not "senaste"; record as history only', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block', locale: 'sv-SE' });
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date('2026-10-15T18:00:00') });
    await p.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const day = (d, h = 10) => new Date(2026, 9, 15 - d, h).getTime();
      const mk = (id, ctx, d, sec, result, extra = {}) => ({
        id, dogId: 'charlie', contextId: ctx, startedAt: day(d), endedAt: day(d) + sec * 1000, durationSec: sec, targetSec: null, result, ...extra,
      });
      const sessions = [
        mk('rec', 'home', 33, 7200, 'good'), mk('b', 'home', 32, 3600, 'good'), mk('c', 'home', 31, 3000, 'good'),
        mk('d', 'home', 3, 300, 'good'), mk('e', 'home', 2, 480, 'bad', { anxietyOnsetSec: 375 }),
        mk('f', 'home', 1, 600, 'good', { targetSec: 600, comment: 'Lugn hela tiden.' }),
        mk('car1', 'car', 20, 900, 'good'), mk('car2', 'car', 19, 900, 'good'),
      ];
      localStorage.setItem('alone-training:v2', JSON.stringify({
        schemaVersion: 2, lang: 'sv', onboarded: true, dogs: [{ id: 'charlie', name: 'Charlie' }],
        contexts: [{ id: 'home', name: 'Hemma' }, { id: 'car', name: 'Bilen' }, { id: 'outside-shop', name: 'Utanför affären' }],
        selectedContextId: 'home', active: null, pending: null, sessions,
      }));
    });
    await p.goto(APP);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    assert.equal(await t('#target-label'), 'Förslag i dag');
    assert.equal(await t('#target-value'), '5:00');
    const basis = await t('#target-basis');
    assert.equal(basis, 'Ett nyligt svårt pass gör att förslaget är kortare – under tiden då oron började i det passet.');
    assert.doesNotMatch(basis, /senaste/i);
    assert.equal(await t('#best-good'), 'Längsta pass som gått bra: 2 tim 00 min, 12 september');
    assert.equal(await t('#history-facts-title'), 'Historik · inte dagens mål');
    // Today's target stays the big number; the history lines are small.
    const size = (sel) => p.$eval(sel, (el) => parseFloat(getComputedStyle(el).fontSize));
    assert.ok((await size('#target-value')) > 3 * (await size('#best-good')));
    assert.ok(!/kapacitet|klarar/i.test(await t('#view-ready')));
    await p.screenshot({ path: OUT + '28-home-sv.png' });

    // The record never steers the suggestion: hide it ("don't count") → other record, same suggestion.
    await open(p, 'history');
    await p.locator('#history .row').last().tap(); // the 2-hour session, oldest
    await p.check('#edit-uncertain');
    await p.tap('#edit-save');
    await home(p);
    assert.equal(await t('#target-value'), '5:00');
    assert.equal(await t('#target-basis'), basis);
    assert.equal(await t('#best-good'), 'Längsta pass som gått bra: 1 tim 00 min, 13 september');

    // A target the user sets is told apart from the app's suggestion.
    await p.tap('#target-up');
    assert.equal(await t('#target-label'), 'Ditt eget mål');
    assert.equal(await t('#target-value'), '5:30');
    assert.equal(await t('#target-basis'), `Appens förslag i dag: 5:00. ${basis}`);
    assert.match(await t('#target-chips'), /Använd förslaget 5:00/);

    // After a break: no automatic target, the user picks a short start; the record is only history.
    await p.locator('#context-picker .seg', { hasText: 'Bilen' }).tap();
    assert.equal(await t('#target-label'), 'Inget automatiskt mål i dag');
    assert.equal(await t('#target-value'), 'Inget mål');
    assert.equal(await t('#target-basis'), 'Det var ett tag sedan. Välj en kort tid som känns lätt i dag.');
    assert.equal(await t('#best-good'), 'Längsta pass som gått bra: 15 min 00 s, 26 september');
    // No relevant session → no record line at all.
    await p.locator('#context-picker .seg', { hasText: 'Utanför affären' }).tap();
    assert.ok(await p.isHidden('#history-facts'));
    await c.close();
  });

  await step('"Getting ready at home": optional, easy to find, never logged or counted', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block', locale: 'sv-SE' });
    const p = await c.newPage();
    watch(p);
    await gotoApp(p, { lang: 'sv', dog: 'Majken' });
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    const raw = () => p.evaluate(() => localStorage.getItem('alone-training:v2'));
    assert.equal(await t('#prep-link'), 'Inte redo för ett tidsatt pass än? Se ”Förberedelser hemma”.');
    const before = await raw();
    await p.tap('#prep-link');
    assert.ok(await p.isVisible('#page-help'));
    assert.equal(await p.evaluate(() => document.getElementById('help-prep').open), true);
    assert.equal(await p.locator('#prep-list li').count(), 4);
    assert.match(await t('#help-prep'), /Res dig och sätt dig igen/);
    assert.match(await t('#help-prep'), /verkar lugn och om den kan återgå till lugn/);
    assert.match(await t('#help-prep'), /registreras inte som pass/);
    assert.doesNotMatch(await t('#help-prep'), /poäng|nivå|låses upp|klarat/i);
    await p.locator('#prep-list input').first().check();
    await p.locator('#prep-list input').nth(2).check();
    await p.screenshot({ path: OUT + '29-prep-sv.png', fullPage: true });
    // Nothing stored, nothing counted.
    assert.equal(await raw(), before);
    await home(p);
    assert.equal(await p.locator('.chart .bar').count(), 0);
    assert.equal(await t('#target-basis'), 'Inga pass loggade här än – välj en kort, lätt tid.');
    await p.reload();
    await open(p, 'help');
    await p.tap('#help-prep summary');
    assert.equal(await p.locator('#prep-list input:checked').count(), 0);
    // Once training has started, the hint on the main screen goes away; it stays under Help.
    await home(p);
    await p.tap('#start-btn');
    await p.tap('#end-btn');
    await p.tap('#good-btn');
    assert.ok(await p.isHidden('#prep-link'));
    assert.equal(await p.locator('#help-prep').count(), 1);
    await c.close();
  });

  await step('iOS app: moving between pages never ends the Live Activity', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block' });
    const p = await c.newPage();
    watch(p);
    await p.addInitScript(nativeMock);
    await gotoApp(p);
    const calls = () => p.evaluate(() => JSON.parse(sessionStorage.getItem('__calls') || '[]'));
    await p.tap('#start-btn');
    const n = (await calls()).length;
    assert.equal((await calls()).at(-1)[0], 'start');
    for (const view of ['history', 'settings', 'data', 'help', 'home']) await open(p, view);
    assert.equal((await calls()).length, n); // no end, no restart
    await p.tap('#end-btn');
    assert.deepEqual((await calls()).at(-1), ['end']);
    await c.close();
  });

  await step('chart: the latest 10 zoomed in, very long sessions cut off with their time; the whole course on its own sheet', async () => {
    const c = await browser.newContext({ ...phone, serviceWorkers: 'block', locale: 'sv-SE' });
    const p = await c.newPage();
    watch(p);
    await p.clock.install({ time: new Date('2026-10-15T10:44:00') });
    await p.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      // Like the reported phone: mostly 1–5 min, a few very long hard sessions.
      const plan = [
        [1, 60, 'good'], [1, 90, 'good'], [2, 75, 'good'], [2, 120, 'bad'], [3, 90, 'good'], [3, 100, 'good'], [4, 150, 'bad'],
        [4, 120, 'good'], [5, 110, 'good'], [5, 140, 'good'], [6, 300, 'bad'], [6, 120, 'good'], [7, 3600, 'bad'], [7, 7800, 'bad'],
        [8, 60, 'good'], [9, 70, 'good'], [9, 80, 'good'], [10, 75, 'good'], [11, 80, 'good'], [12, 1500, 'bad'],
        [13, 80, 'good'], [13, 3000, 'bad'], [14, 80, 'good'],
      ];
      const sessions = plan.map(([d, sec, result], i) => {
        const at = new Date(2026, 9, d, 9 + (i % 2) * 6).getTime();
        return { id: 'p' + i, dogId: 'charlie', contextId: 'home', startedAt: at, endedAt: at + sec * 1000, durationSec: sec, targetSec: null, result };
      });
      localStorage.setItem('alone-training:v2', JSON.stringify({ schemaVersion: 2, lang: 'sv', onboarded: true, dogs: [{ id: 'charlie', name: 'Charlie' }],
        contexts: [{ id: 'home', name: 'Ensam Hemma hela lägenheten' }, { id: 'car', name: 'Övning sovrummet' }, { id: 'outside-shop', name: 'Test' }],
        selectedContextId: 'home', active: null, pending: null, sessions }));
    });
    await p.goto(APP);
    const t = (sel) => p.textContent(sel).then((x) => x.trim());
    const before = await p.evaluate(() => localStorage.getItem('alone-training:v2'));
    assert.equal(await p.locator('#chart .bar').count(), 10);
    // The 2 h 10 min, 25 min and 50 min sessions are cut off and labelled, so the 1–2 minute ones are readable.
    assert.equal(await p.locator('#chart .bar.clipped').count(), 3);
    assert.deepEqual(await p.locator('#chart .clip-label').allTextContents(), ['↑2.2h', '↑25m', '↑50m']);
    const short = await p.locator('#chart .bar.good .mark').last().boundingBox();
    const plot = await p.locator('#chart svg').boundingBox();
    assert.ok(short.height > plot.height * 0.15, `a 1:20 bar is ${short.height}px high`);
    assert.match(await t('#chart-clip-note'), /^↑ Mycket längre pass är avkortade/);
    // Tapping a cut-off bar gives the exact time.
    await p.locator('#chart .bar.clipped').last().tap();
    assert.match(await t('#chart-detail'), /50 min 00 s · Gick inte bra/);
    await p.locator('#progress').screenshot({ path: OUT + '30-chart-zoomed-sv.png' });

    // The whole course: every session, with a smoothed line for times that went well.
    await p.tap('#overview-btn');
    assert.ok(await p.isVisible('#overview-dialog'));
    assert.equal(await t('#overview-place'), 'Ensam Hemma hela lägenheten');
    assert.equal(await p.locator('#overview-chart .dot').count(), 23);
    assert.equal(await p.locator('#overview-chart .trend').count(), 1);
    await p.screenshot({ path: OUT + '31-overview-sv.png' });
    await p.tap('[data-days="30"]');
    assert.equal(await p.getAttribute('[data-days="30"]', 'aria-pressed'), 'true');
    assert.equal(await p.locator('#overview-chart .dot').count(), 23);
    await p.tap('#overview-close');
    assert.ok(await p.isHidden('#overview-dialog'));
    // Only a view: nothing stored changes, today's suggestion is the same.
    assert.equal(await p.evaluate(() => localStorage.getItem('alone-training:v2')), before);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await c.close();
  });

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
