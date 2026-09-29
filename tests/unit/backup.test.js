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
  assert.deepEqual(sessions, state.sessions);
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
  assert.equal(lines[1], 'Date;Time;Place;Actual (s);Actual;Target (s);Target;Result');
  assert.equal(lines.length, 4);
  assert.match(lines[2], /^2026-09-01;\d\d:\d\d;Home;90;1:30;;;Went well$/);
  assert.match(lines[3], /;Outside shop;90;1:30;120;2:00;Didn't go well$/);
});

test('backup file name contains the date', () => {
  assert.match(backupFileName('json', Date.UTC(2026, 8, 29, 12)), /^alone-time-2026-09-29\.json$/);
});
