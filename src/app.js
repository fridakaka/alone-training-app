// Connects the screen to the logic. Holds no rules of its own.

import {
  startSession,
  endSession,
  recordResult,
  discardPending,
  elapsedSeconds,
  sessionsFor,
  selectContext,
  updateSession,
  deleteSession,
  formatTimer,
  formatDuration,
  RESULTS,
} from './training.js';
import { loadState, saveState } from './store.js';
import { renderChart, MAX_BARS } from './chart.js';
import {
  suggestDetailed,
  plusTenLast,
  repeatLast,
  lastSession,
  stepUp,
  stepDown,
  formatTarget,
  MIN_TARGET_SEC,
} from './progression.js';
import { buildBackup, parseBackup, mergeSessions, buildCsv, backupFileName } from './backup.js';

const $ = (id) => document.getElementById(id);

let state = loadState();

// Still one dog. The context comes from the picker (remembered in state).
const dogId = () => state.dogs[0].id;
const contextId = () =>
  state.active?.contextId ?? state.pending?.contextId ?? state.selectedContextId;
const current = () => ({ dogId: dogId(), contextId: contextId() });
const contextName = (id) => state.contexts.find((c) => c.id === id)?.name ?? id;

// Target chosen on the ready screen, per context. Not saved: if nothing was
// touched the suggestion is used. `undefined` = use suggestion, `null` = no target.
const draftTargets = {};

function update(next) {
  state = next;
  saveState(state);
  render();
}

// ---------- actions ----------

$('start-btn').addEventListener('click', () => {
  const targetSec = currentTarget().value;
  delete draftTargets[contextId()];
  update(startSession(state, { ...current(), targetSec, now: Date.now() }));
});

$('context-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-context]');
  if (btn) update(selectContext(state, btn.dataset.context));
});

$('target-up').addEventListener('click', () => setDraft(stepUp(currentTarget().value)));
$('target-down').addEventListener('click', () => setDraft(stepDown(currentTarget().value)));
$('target-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-target]');
  if (!chip) return;
  const v = chip.dataset.target;
  setDraft(v === 'none' ? null : v === 'suggested' ? undefined : Number(v));
});

function setDraft(value) {
  if (value === undefined) delete draftTargets[contextId()];
  else draftTargets[contextId()] = value;
  render();
}

// What the ready screen currently offers for the selected context.
function currentTarget() {
  const sessions = sessionsFor(state, current());
  const detail = suggestDetailed(sessions);
  const suggested = detail?.sec ?? null;
  const ctx = contextId();
  const value = ctx in draftTargets ? draftTargets[ctx] : suggested;
  return {
    sessions,
    suggested,
    reason: detail?.reason,
    repeat: repeatLast(sessions),
    plus: plusTenLast(sessions),
    value,
  };
}

$('end-btn').addEventListener('click', () => {
  update(endSession(state, Date.now()));
});

$('good-btn').addEventListener('click', () => update(recordResult(state, RESULTS.GOOD)));
$('bad-btn').addEventListener('click', () => update(recordResult(state, RESULTS.BAD)));
$('discard-btn').addEventListener('click', () => update(discardPending(state)));

// Tap a bar to see its details.
$('chart').addEventListener('click', (e) => showBarDetail(e.target.closest('.bar')));
$('chart').addEventListener('focusin', (e) => showBarDetail(e.target.closest('.bar')));

function showBarDetail(bar) {
  const chart = $('chart');
  chart.querySelectorAll('.bar.selected').forEach((b) => b.classList.remove('selected'));
  if (!bar) return;
  bar.classList.add('selected');
  $('chart-detail').textContent = bar.getAttribute('aria-label');
}

// ---------- rendering ----------

let tick = null;

function render() {
  const mode = state.active ? 'training' : state.pending ? 'result' : 'ready';
  $('view-ready').hidden = mode !== 'ready';
  $('view-training').hidden = mode !== 'training';
  $('view-result').hidden = mode !== 'result';
  document.body.dataset.mode = mode;

  $('dog-name').textContent = state.dogs[0].name;
  const ctxName = contextName(contextId());
  for (const id of ['context-name', 'progress-context', 'history-context', 'empty-context']) {
    $(id).textContent = ctxName;
  }

  clearInterval(tick);
  if (mode === 'ready') renderReady();
  if (mode === 'training') {
    renderTimer();
    tick = setInterval(renderTimer, 250);
  }
  if (mode === 'result') {
    $('result-duration').textContent = formatDuration(state.pending.durationSec);
    $('result-target').textContent = state.pending.targetSec
      ? ` · target ${formatTarget(state.pending.targetSec)}`
      : '';
  }

  renderProgress();
  renderData();
}

function renderReady() {
  const picker = $('context-picker');
  if (!picker.children.length) {
    picker.innerHTML = state.contexts
      .map((c) => `<button type="button" class="seg" data-context="${c.id}">${c.name}</button>`)
      .join('');
  }
  for (const btn of picker.children) {
    btn.setAttribute('aria-pressed', String(btn.dataset.context === state.selectedContextId));
  }

  const { sessions, suggested, reason, repeat, plus, value } = currentTarget();
  const last = lastSession(sessions);
  const isSuggested = suggested != null && value === suggested;

  $('target-label').textContent = isSuggested
    ? 'Suggested today'
    : value == null
      ? suggested == null
        ? 'No suggestion yet'
        : 'Target'
      : 'Your target';
  $('target-value').textContent = value == null ? 'No target' : formatTarget(value);
  $('target-value').classList.toggle('none', value == null);
  $('target-down').disabled = value == null || value <= MIN_TARGET_SEC;

  $('target-basis').textContent = last
    ? `Last ${contextName(contextId())} session: ${formatDuration(last.durationSec)}, ${
        last.result === RESULTS.GOOD ? 'went well' : "didn't go well"
      }${isSuggested ? REASON_TEXT[reason] : ''}`
    : `A suggestion appears after your first ${contextName(contextId())} session.`;

  const chips = [];
  if (suggested != null && value !== suggested) {
    chips.push(['suggested', `Use suggestion ${formatTarget(suggested)}`]);
  }
  if (repeat != null && value !== repeat && repeat !== suggested) {
    chips.push([repeat, `Repeat ${formatTarget(repeat)}`]);
  }
  if (plus != null && value !== plus && plus !== suggested) {
    chips.push([plus, `+10% ${formatTarget(plus)}`]);
  }
  if (value != null) chips.push(['none', 'No target']);
  $('target-chips').innerHTML = chips
    .map(([v, label]) => `<button type="button" class="chip" data-target="${v}">${label}</button>`)
    .join('');
}

const REASON_TEXT = {
  up: ' · +10%',
  down: ' · −10%',
  consolidate: ' · first good after a setback, same again',
  early: ' · ended before target, same target',
};

function renderTimer() {
  const elapsed = elapsedSeconds(state.active, Date.now());
  $('timer').textContent = formatTimer(elapsed);
  const target = state.active.targetSec;
  const line = $('training-target');
  line.hidden = !target;
  if (target) {
    const reached = elapsed >= target;
    line.textContent = `Target ${formatTarget(target)}${reached ? ' reached' : ''}`;
    line.classList.toggle('reached', reached);
  }
}

function renderProgress() {
  const sessions = sessionsFor(state, current());
  const hasData = sessions.length > 0;

  $('chart').innerHTML = renderChart(sessions);
  const hiddenBars = sessions.length - MAX_BARS;
  $('chart-note').hidden = hiddenBars <= 0;
  $('chart-note').textContent =
    hiddenBars > 0 ? `Showing the latest ${MAX_BARS} of ${sessions.length} sessions.` : '';
  $('chart-detail').textContent = hasData ? 'Tap a bar to see details.' : '';
  $('empty').hidden = hasData;
  document.querySelector('#progress .legend').hidden = !hasData;
  $('legend-target').hidden = !sessions.slice(-MAX_BARS).some((s) => s.targetSec);
  $('history-section').hidden = !hasData;

  const showAll = showAllHistory[contextId()];
  const newestFirst = sessions.slice().reverse();
  const visible = showAll ? newestFirst : newestFirst.slice(0, HISTORY_PREVIEW);
  const more = $('history-more');
  more.hidden = sessions.length <= HISTORY_PREVIEW;
  more.textContent = showAll ? 'Show fewer' : `Show all (${sessions.length})`;
  const editable = !state.active && !state.pending;

  $('history').innerHTML = visible
    .map((s) => {
      const good = s.result === RESULTS.GOOD;
      const when = new Date(s.startedAt).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `
      <li>
        <button type="button" class="row" data-id="${s.id}" ${editable ? '' : 'disabled'}
          aria-label="Edit session: ${when}, ${formatDuration(s.durationSec)}${
            s.targetSec ? `, target ${formatTarget(s.targetSec)}` : ''
          }, ${good ? 'went well' : "didn't go well"}">
          <span class="when">${when}</span>
          <span class="dur">${formatDuration(s.durationSec)}</span>
          ${s.targetSec ? `<span class="planned">target ${formatTarget(s.targetSec)}</span>` : ''}
          <span class="tag ${s.result}"><i class="swatch ${s.result}"></i>${good ? 'Went well' : "Didn't go well"}</span>
        </button>
      </li>`;
    })
    .join('');
}

function renderData() {
  $('last-backup').textContent = state.lastBackupAt
    ? `Last backup: ${new Date(state.lastBackupAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}.`
    : 'No backup saved yet.';
}

// ---------- history: show all ----------

const HISTORY_PREVIEW = 10;
const showAllHistory = {};

$('history-more').addEventListener('click', () => {
  showAllHistory[contextId()] = !showAllHistory[contextId()];
  renderProgress();
});

// ---------- edit / delete a session ----------

const dialog = $('edit-dialog');
let editing = null; // { id, result, contextId }
let deleteArmed = false;

$('history').addEventListener('click', (e) => {
  const row = e.target.closest('.row[data-id]');
  if (row) openEditor(row.dataset.id);
});

function openEditor(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s || state.active || state.pending) return;
  editing = { id, result: s.result, contextId: s.contextId };
  deleteArmed = false;
  $('edit-when').textContent = new Date(s.startedAt).toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  $('edit-context').innerHTML = state.contexts
    .map((c) => `<button type="button" class="seg" data-context="${c.id}">${c.name}</button>`)
    .join('');
  $('edit-dur-min').value = Math.floor(s.durationSec / 60);
  $('edit-dur-sec').value = s.durationSec % 60;
  $('edit-tgt-min').value = s.targetSec ? Math.floor(s.targetSec / 60) : '';
  $('edit-tgt-sec').value = s.targetSec ? s.targetSec % 60 : '';
  renderEditor();
  dialog.showModal();
}

function renderEditor() {
  for (const b of $('edit-context').children) {
    b.setAttribute('aria-pressed', String(b.dataset.context === editing.contextId));
  }
  for (const b of dialog.querySelectorAll('[data-result]')) {
    b.setAttribute('aria-pressed', String(b.dataset.result === editing.result));
  }
  $('edit-delete').textContent = deleteArmed ? 'Tap again to delete' : 'Delete session';
  $('edit-delete').classList.toggle('armed', deleteArmed);
}

$('edit-context').addEventListener('click', (e) => {
  const b = e.target.closest('[data-context]');
  if (b) {
    editing.contextId = b.dataset.context;
    renderEditor();
  }
});

dialog.querySelectorAll('[data-result]').forEach((b) =>
  b.addEventListener('click', () => {
    editing.result = b.dataset.result;
    renderEditor();
  }),
);

const num = (id) => {
  const v = parseInt($(id).value, 10);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

$('edit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const durationSec = num('edit-dur-min') * 60 + Math.min(59, num('edit-dur-sec'));
  const targetSec = num('edit-tgt-min') * 60 + Math.min(59, num('edit-tgt-sec'));
  update(
    updateSession(state, editing.id, {
      result: editing.result,
      contextId: editing.contextId,
      durationSec,
      targetSec: targetSec || null,
    }),
  );
  dialog.close();
});

$('edit-cancel').addEventListener('click', () => dialog.close());

$('edit-delete').addEventListener('click', () => {
  if (!deleteArmed) {
    deleteArmed = true;
    renderEditor();
    return;
  }
  update(deleteSession(state, editing.id));
  dialog.close();
});

// Tap outside the sheet closes it.
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});

// ---------- backup / export / restore ----------

async function shareOrDownload(text, fileName, type) {
  const file = new File([text], fileName, { type });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return true;
    } catch (err) {
      if (err?.name === 'AbortError') return false; // user closed the share sheet
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

function status(msg) {
  $('data-status').textContent = msg;
}

$('backup-btn').addEventListener('click', async () => {
  const done = await shareOrDownload(buildBackup(state), backupFileName('json'), 'application/json');
  if (done) {
    update({ ...state, lastBackupAt: Date.now() });
    status(`Backup saved (${state.sessions.length} sessions).`);
  }
});

$('csv-btn').addEventListener('click', async () => {
  if (await shareOrDownload(buildCsv(state), backupFileName('csv'), 'text/csv')) {
    status('Excel file created.');
  }
});

$('restore-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  status('Reading backup…');
  try {
    const { sessions } = parseBackup(await file.text());
    try {
      localStorage.setItem(`alone-training:before-restore-${Date.now()}`, JSON.stringify(state));
    } catch {}
    const { state: merged, added, skipped } = mergeSessions(state, sessions);
    update(merged);
    status(
      added
        ? `Restored ${added} session${added === 1 ? '' : 's'}.${skipped ? ` ${skipped} were already here.` : ''}`
        : 'Nothing new in that backup – all its sessions are already here.',
    );
  } catch (err) {
    status(err.message || 'Could not read that file.');
  }
});

// Timer catches up instantly when you come back to the app.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    state = loadState();
    render();
  }
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
