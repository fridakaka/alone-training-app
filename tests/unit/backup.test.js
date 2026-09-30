import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, mergeSessions, buildCsv, backupFileName } from '../../src/backup.js';
import { createInitialState } from '../../src/training.js';

const sess = (id, extra = {}) => ({
  id, dogId: 'charlie', contextId: 'home', startedAt: Date.UTC(2026, 8, 1, 8) + Number(id.slice(1)) * 1000,
  endedAt: 0, durationSec: 90, targetSec: null, result: 'good', ...extra,
});

test('backup round-trip restores all sessions exactly', () => {
  const state = { ...createInitialState(), sessions: [sess('s1'), sess('s2', { contextId: 'car', targetSec: 120, result: 'bad' })] };
  const { sessions } = parseBackup(buildBackup(state));
  // Older sessions get the v0.4 fields as "unknown" / "counted" – nothing else changes.
  assert.deepEqual(sessions, state.sessions.map((s) => ({ ...s, anxietyOnsetSec: null, uncertain: false, comment: null })));
});

test('backup keeps time until worry and "don\'t count"', () => {
  const state = {
    ...createInitialState(),
    sessions: [sess('s1', { result: 'bad', anxietyOnsetSec: 30 }), sess('s2', { uncertain: true })],
  };
  const { sessions } = parseBackup(buildBackup(state));
  assert.equal(sessions[0].anxietyOnsetSec, 30);
  assert.equal(sessions[1].uncertain, true);
  const { state: merged } = mergeSessions(createInitialState(), sessions);
  assert.equal(merged.sessions[0].anxietyOnsetSec, 30);
});

test('backup: invalid worry times are read as unknown, never as 0', () => {
  const file = JSON.stringify({ sessions: [
    sess('s1', { result: 'bad', anxietyOnsetSec: 999 }), // after the end (90 s)
    sess('s2', { result: 'bad', anxietyOnsetSec: -4 }),
    sess('s3', { result: 'bad' }),
    sess('s4', { result: 'good', anxietyOnsetSec: 20 }), // only meaningful for "didn't go well"
  ] });
  assert.deepEqual(parseBackup(file).sessions.map((s) => s.anxietyOnsetSec), [null, null, null, null]);
});

test('existing v0.3 backup files still restore', () => {
  const v03 = JSON.stringify({
    app: 'alone-time', exportedAt: '2026-09-29T10:00:00.000Z', schemaVersion: 2,
    sessions: [{ id: 'old', dogId: 'charlie', contextId: 'car', startedAt: 1, endedAt: 60001, durationSec: 60, targetSec: 45, result: 'good' }],
  });
  const [s] = parseBackup(v03).sessions;
  assert.equal(s.contextId, 'car');
  assert.equal(s.targetSec, 45);
  assert.equal(s.anxietyOnsetSec, null);
  assert.equal(s.uncertain, false);
});

test('restore merges: existing sessions are kept, only new ones are added', () => {
  const phone = { ...createInitialState(), sessions: [sess('s1'), sess('s2')] };
  const file = [sess('s2', { durationSec: 999 }), sess('s3')];
  const { state, added, skipped } = mergeSessions(phone, file);
  assert.equal(added, 1);
  assert.equal(skipped, 1);
  assert.deepEqual(state.sessions.map((s) => s.id), ['s1', 's2', 's3']);
  assert.equal(state.sessions[1].durationSec, 90); // phone copy wins
});

test('restore accepts raw v0.1 data and puts it in Home', () => {
  const v1 = JSON.stringify({ schemaVersion: 1, sessions: [{ id: 'a', dogId: 'charlie', startedAt: 1, endedAt: 61001, durationSec: 60, result: 'bad' }] });
  const { sessions } = parseBackup(v1);
  assert.equal(sessions[0].contextId, 'home');
  assert.equal(sessions[0].targetSec, null);
});

test('unknown places from a file go to Home', () => {
  const { state } = mergeSessions(createInitialState(), [sess('s1', { contextId: 'beach' })]);
  assert.equal(state.sessions[0].contextId, 'home');
});

test('invalid files and sessions are rejected safely', () => {
  assert.throws(() => parseBackup('not json'), /isn't a backup/);
  assert.throws(() => parseBackup('{"hello":1}'), /isn't a backup/);
  const { sessions } = parseBackup(JSON.stringify({ sessions: [sess('s9'), { id: 'x' }, { ...sess('y'), result: 'meh' }, null] }));
  assert.deepEqual(sessions.map((s) => s.id), ['s9']);
});

test('Excel export has one row per session, oldest first, semicolon separated', () => {
  const state = { ...createInitialState(), sessions: [sess('s2', { contextId: 'outside-shop', targetSec: 120, result: 'bad' }), sess('s1')] };
  const lines = buildCsv(state).trim().split('\r\n');
  assert.equal(lines[0], 'sep=;');
  assert.equal(lines[1], 'Date;Time;Place;Actual (s);Actual;Target (s);Target;Result;Worried after (s);Worried after;Counted for suggestions;Place ID;Comment');
  assert.equal(lines.length, 4);
  assert.match(lines[2], /^2026-09-01;\d\d:\d\d;Home;90;1:30;;;Went well;;;Yes;home;$/);
  assert.match(lines[3], /;Outside shop;90;1:30;120;2:00;Didn't go well;;;Yes;outside-shop;$/);
  const withNew = { ...state, sessions: [sess('s3', { result: 'bad', anxietyOnsetSec: 45 }), sess('s4', { uncertain: true })] };
  const [, , a, b] = buildCsv(withNew).trim().split('\r\n');
  assert.match(a, /;Didn't go well;45;0:45;Yes;home;$/);
  assert.match(b, /;Went well;;;No;home;$/);
});

test('backup file name contains the date', () => {
  assert.match(backupFileName('json', Date.UTC(2026, 8, 29, 12)), /^alone-time-2026-09-29\.json$/);
});

// ---------- v0.6: place names ----------
import { renameContexts } from '../../src/training.js';
import { nameChanges } from '../../src/backup.js';

const RENAMED = { home: 'Sovrummet', car: 'Bilburen', 'outside-shop': 'Hela lägenheten' };

test('Excel export uses the names shown in the app, plus the stable place ID', () => {
  const state = renameContexts({ ...createInitialState(), sessions: [sess('s1', { contextId: 'car' })] }, RENAMED);
  const [, , row] = buildCsv(state).trim().split('\r\n');
  assert.match(row, /;Bilburen;90;1:30;/);
  assert.match(row, /;car;$/);
});

test('new backups contain the place names, and restore reads them back', () => {
  const state = renameContexts({ ...createInitialState(), sessions: [sess('s1', { contextId: 'car' })] }, RENAMED);
  const { sessions, contextNames } = parseBackup(buildBackup(state));
  assert.deepEqual(contextNames, RENAMED);
  assert.equal(sessions[0].contextId, 'car'); // sessions keep the id, not the name
});

test('old backups without place names: nothing to change, current names are kept', () => {
  const old = JSON.stringify({ sessions: [sess('s1', { contextId: 'car' })] });
  const { contextNames, sessions } = parseBackup(old);
  assert.equal(contextNames, null);
  const phone = renameContexts(createInitialState(), RENAMED);
  assert.deepEqual(nameChanges(phone, contextNames), []);
  const { state } = mergeSessions(phone, sessions);
  assert.deepEqual(state.contexts.map((c) => c.name), ['Sovrummet', 'Bilburen', 'Hela lägenheten']);
});

test('backup with default names does not silently overwrite renamed places – differences are reported', () => {
  const defaults = parseBackup(buildBackup(createInitialState())).contextNames;
  const phone = renameContexts(createInitialState(), RENAMED);
  const { state } = mergeSessions(phone, []);
  assert.equal(state.contexts[1].name, 'Bilburen');
  assert.deepEqual(nameChanges(phone, defaults).map((c) => [c.id, c.current, c.fromBackup]), [
    ['home', 'Sovrummet', 'Home'], ['car', 'Bilburen', 'Car'], ['outside-shop', 'Hela lägenheten', 'Outside shop'],
  ]);
  assert.deepEqual(nameChanges(phone, RENAMED), []);
});

test('backups with incomplete or invalid names are treated as having no names', () => {
  const partial = JSON.stringify({ contexts: [{ id: 'home', name: 'X' }], sessions: [] });
  assert.equal(parseBackup(partial).contextNames, null);
  const dup = JSON.stringify({ contexts: [{ id: 'home', name: 'A' }, { id: 'car', name: 'a' }, { id: 'outside-shop', name: 'B' }], sessions: [] });
  assert.deepEqual(nameChanges(createInitialState(), parseBackup(dup).contextNames), []);
});

// ---------- v0.7: comments, dog name, language ----------
import { renameDog } from '../../src/training.js';
import { settingsChanges } from '../../src/backup.js';

test('comments survive backup and restore; old backups have none', () => {
  const text = 'Grannhunden skällde.\nHan lade sig efter en stund – "lugn" ; å ä ö';
  const state = { ...createInitialState(), sessions: [sess('s1', { comment: text })] };
  const { sessions } = parseBackup(buildBackup(state));
  assert.equal(sessions[0].comment, text);
  assert.equal(parseBackup(JSON.stringify({ sessions: [sess('s1')] })).sessions[0].comment, null);
  // Invalid comment values are dropped, long ones cut to the limit.
  const odd = parseBackup(JSON.stringify({ sessions: [sess('s1', { comment: 42 }), sess('s2', { comment: 'x'.repeat(900) })] }));
  assert.equal(odd.sessions[0].comment, null);
  assert.equal(odd.sessions[1].comment.length, 500);
});

test('Excel: comment column with Swedish letters, quotes, ; and line breaks escaped', () => {
  const state = { ...createInitialState(), sessions: [sess('s1', { comment: 'Rad 1\nRad "två"; åäö' })] };
  const csv = buildCsv(state);
  assert.ok(csv.includes(';home;"Rad 1\nRad ""två""; åäö"\r\n'));
});

test('Excel: text that looks like a formula is not run as a formula', () => {
  for (const bad of ['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)']) {
    const csv = buildCsv({ ...createInitialState(), sessions: [sess('s1', { comment: bad })] });
    const cell = csv.trim().split('\r\n')[2].split(';home;')[1];
    assert.ok(/^"?'/.test(cell), `${bad} → ${cell}`);
  }
  // Place names are user text too.
  const renamed = renameContexts({ ...createInitialState(), sessions: [sess('s1')] }, { home: '=Hem', car: 'Car', 'outside-shop': 'Shop' });
  assert.match(buildCsv(renamed), /;'=Hem;90;/);
});

test('backup carries dog name and language; restore reports differences but never applies them by itself', () => {
  const src = { ...renameDog(createInitialState(), 'Majken'), lang: 'sv' };
  const parsed = parseBackup(buildBackup(src));
  assert.equal(parsed.dogName, 'Majken');
  assert.equal(parsed.lang, 'sv');
  const phone = { ...createInitialState(), lang: 'en' }; // Charlie, English
  const { state } = mergeSessions(phone, parsed.sessions);
  assert.equal(state.dogs[0].name, 'Charlie');
  assert.equal(state.lang, 'en');
  assert.deepEqual(settingsChanges(phone, parsed).map((c) => c.kind), ['dog', 'lang']);
});

test('old backups without dog name or language change nothing', () => {
  const old = parseBackup(JSON.stringify({ sessions: [sess('s1')] }));
  assert.equal(old.dogName, null);
  assert.equal(old.lang, null);
  const phone = { ...renameDog(createInitialState(), 'Majken'), lang: 'sv' };
  assert.deepEqual(settingsChanges(phone, old), []);
  // A backup with the default dog name only differs if the names differ.
  assert.deepEqual(settingsChanges(createInitialState(), parseBackup(buildBackup(createInitialState()))), []);
});
