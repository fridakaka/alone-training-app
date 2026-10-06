import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STRINGS, LANGS, t, tHtml, formatDuration, listNames, guessLang, DEFAULT_PLACE_NAMES, escapeHtml,
} from '../../src/i18n.js';

test('every text exists in both languages, non-empty', () => {
  const en = Object.keys(STRINGS.en).sort();
  const sv = Object.keys(STRINGS.sv).sort();
  assert.deepEqual(sv, en, 'the two languages must have exactly the same keys');
  for (const lang of LANGS) for (const [k, v] of Object.entries(STRINGS[lang])) assert.ok(v.trim(), `${lang}.${k} is empty`);
});

test('placeholders like {dog} are the same in both languages', () => {
  const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of Object.keys(STRINGS.en)) assert.equal(ph(STRINGS.sv[k]), ph(STRINGS.en[k]), k);
});

test('every data-i18n key used in index.html exists', async () => {
  const html = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
  const keys = [...html.matchAll(/data-i18n(?:-html|-aria|-placeholder)?="(\w+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 40);
  for (const k of keys) assert.ok(k in STRINGS.en, `missing key ${k}`);
});

test('every t("…") key used in the code exists', async () => {
  for (const f of ['app.js', 'chart.js']) {
    const code = await readFile(new URL(`../../src/${f}`, import.meta.url), 'utf8');
    for (const m of code.matchAll(/\bt(?:Html)?\('(\w+)'/g)) assert.ok(m[1] in STRINGS.en, `${f}: ${m[1]}`);
  }
});

test('translation, units and lists', () => {
  assert.equal(t('trainingLabel', { dog: 'Majken' }, 'sv'), 'Majken har varit ensam i');
  assert.equal(t('trainingLabel', { dog: 'Majken' }, 'en'), 'Majken has been alone for');
  assert.equal(formatDuration(3720, 'sv'), '1 tim 02 min');
  assert.equal(formatDuration(185, 'sv'), '3 min 05 s');
  assert.equal(formatDuration(3720, 'en'), '1 h 02 min');
  assert.equal(listNames(['Hemma', 'Bilen', 'Utanför affären'], 'sv'), 'Hemma, Bilen och Utanför affären');
  assert.equal(guessLang('sv-SE'), 'sv');
  assert.equal(guessLang('en-GB'), 'en');
  assert.equal(guessLang(undefined), 'en');
  assert.deepEqual(Object.keys(DEFAULT_PLACE_NAMES.sv), ['home', 'car', 'outside-shop']);
});

test('user text inserted into HTML strings is escaped', () => {
  assert.equal(escapeHtml('<b>"x" & \'y\''), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;');
  assert.ok(!tHtml('helpCalc1', { places: '<img src=x>' }).includes('<img'));
});

// ---------- v0.8: offer default names after a language switch ----------
import { defaultNameOffer } from '../../src/i18n.js';

test('switching to Swedish offers Swedish names only for untouched English defaults', () => {
  const ctx = (home, car, shop) => [{ id: 'home', name: home }, { id: 'car', name: car }, { id: 'outside-shop', name: shop }];
  assert.deepEqual(defaultNameOffer(ctx('Home', 'Car', 'Outside shop'), 'sv'), [
    { id: 'home', from: 'Home', to: 'Hemma' },
    { id: 'car', from: 'Car', to: 'Bilen' },
    { id: 'outside-shop', from: 'Outside shop', to: 'Utanför affären' },
  ]);
  // Own names are never offered for change.
  assert.deepEqual(defaultNameOffer(ctx('Sovrummet', 'Bilburen', 'Hallen'), 'sv'), []);
  assert.deepEqual(defaultNameOffer(ctx('Home', 'Bilburen', 'Outside shop'), 'sv').map((o) => o.id), ['home', 'outside-shop']);
  // Already Swedish, or switching to English with Swedish defaults.
  assert.deepEqual(defaultNameOffer(ctx('Hemma', 'Bilen', 'Utanför affären'), 'sv'), []);
  assert.deepEqual(defaultNameOffer(ctx('Hemma', 'Bilen', 'Utanför affären'), 'en').map((o) => o.to), ['Home', 'Car', 'Outside shop']);
  // A default name of another place id doesn't count ("Car" used for home).
  assert.deepEqual(defaultNameOffer(ctx('Car', 'Home', 'Outside shop'), 'sv').map((o) => o.id), ['outside-shop']);
});
