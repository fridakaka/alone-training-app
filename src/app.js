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
  setAnxietyOnset,
  isValidOnset,
  formatTimer,
  formatDuration,
  RESULTS,
} from './training.js';
import { loadState, saveState } from './store.js';
import { renderChart, resultText, MAX_BARS } from './chart.js';
import { stepUp, stepDown, formatTarget, MIN_TARGET_SEC } from './progression.js';
import { suggestTarget, KINDS } from './suggestion.js';
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
  if (!btn) return;
  targetEditorOpen = false;
  update(selectContext(state, btn.dataset.context));
});

$('target-up').addEventListener('click', () => {
  const v = currentTarget().value;
  // From "no target" the app doesn't guess a time: it asks for one.
  if (v == null) openTargetEditor();
  else setDraft(stepUp(v));
});
$('target-value').addEventListener('click', () => openTargetEditor());

// ---------- typing a target time directly ----------

let targetEditorOpen = false;

function openTargetEditor() {
  const v = currentTarget().value;
  $('target-min').value = v ? Math.floor(v / 60) : '';
  $('target-sec').value = v ? v % 60 : '';
  $('target-error').textContent = '';
  targetEditorOpen = true;
  render();
  $(v && v >= 60 ? 'target-min' : 'target-sec').focus();
}

function closeTargetEditor() {
  targetEditorOpen = false;
  render();
  $('target-value').focus();
}

function applyTargetEditor() {
  const input = readMinSec('target-min', 'target-sec');
  if (input.error) return void ($('target-error').textContent = input.error);
  if (input.empty || input.value < MIN_TARGET_SEC) {
    $('target-error').textContent = 'Enter at least 1 second, or choose No target.';
    return;
  }
  draftTargets[contextId()] = input.value;
  closeTargetEditor();
}

$('target-set').addEventListener('click', applyTargetEditor);
$('target-edit-cancel').addEventListener('click', closeTargetEditor);
$('target-edit').addEventListener('keydown', (e) => {
  // preventDefault: otherwise the same Enter "clicks" the time button that gets focus next.
  if (e.key === 'Enter') {
    e.preventDefault();
    applyTargetEditor();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    closeTargetEditor();
  }
});
$('target-edit').addEventListener('input', () => ($('target-error').textContent = ''));
$('target-down').addEventListener('click', () => setDraft(stepDown(currentTarget().value)));
$('target-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-target]');
  if (!chip) return;
  const v = chip.dataset.target;
  setDraft(v === 'none' ? null : v === 'suggested' ? undefined : Number(v));
});

function setDraft(value) {
  targetEditorOpen = false;
  if (value === undefined) delete draftTargets[contextId()];
  else draftTargets[contextId()] = value;
  render();
}

// What the ready screen currently offers for the selected context.
// The suggestion is always derived from the history – never stored.
function currentTarget() {
  const suggestion = suggestTarget(sessionsFor(state, current()), { now: Date.now() });
  const ctx = contextId();
  const value = ctx in draftTargets ? draftTargets[ctx] : suggestion.sec;
  return { suggestion, suggested: suggestion.sec, repeat: suggestion.repeatSec, value };
}

// One main, plain-language explanation per kind of suggestion.
// Never "the dog can …" – the journal can't establish that.
const EXPLANATION = {
  [KINDS.RAISE]: 'Several calm sessions on different days — small increase.',
  [KINDS.REPEAT]: 'Keep this time until it feels stable.',
  [KINDS.LIMITED]: (sec) => `Limited basis — repeat ${formatTarget(sec)}.`,
  [KINDS.EASIER]: 'The last session was hard — shorter suggestion.',
  [KINDS.HARD_CHOOSE]: 'The last session was hard — choose a short, easy time.',
  [KINDS.WORRIED_AT_ONCE]: 'Worry from the start. Choose an easier step before the next absence.',
  [KINDS.BREAK]: "It's been a while. Choose a short time that feels easy today.",
  [KINDS.TOO_LITTLE]: 'Too little usable recent history — choose a short, easy time.',
  [KINDS.NONE]: 'No sessions logged here yet — choose a short, easy time.',
};

$('end-btn').addEventListener('click', () => {
  update(endSession(state, Date.now()));
});

$('good-btn').addEventListener('click', () => update(recordResult(state, RESULTS.GOOD)));
$('bad-btn').addEventListener('click', () => {
  // Saved right away, so nothing is lost; the follow-up question is optional.
  const next = recordResult(state, RESULTS.BAD);
  onsetFor = next.sessions[next.sessions.length - 1]?.id ?? null;
  clearOnsetInputs();
  update(next);
});

// ---------- optional follow-up: when did worry start? ----------

let onsetFor = null; // id of the session just saved as "didn't go well" (memory only)

const readMinSec = (minId, secId) => {
  const mRaw = $(minId).value.trim();
  const sRaw = $(secId).value.trim();
  if (mRaw === '' && sRaw === '') return { empty: true };
  const m = Number(mRaw || 0);
  const sec = Number(sRaw || 0);
  if (!Number.isInteger(m) || !Number.isInteger(sec) || m < 0 || sec < 0 || sec > 59) {
    return { error: 'Use whole minutes and 0–59 seconds.' };
  }
  return { value: m * 60 + sec };
};

function clearOnsetInputs() {
  $('onset-min').value = '';
  $('onset-sec').value = '';
  $('onset-error').textContent = '';
}

$('onset-unknown').addEventListener('click', () => {
  onsetFor = null;
  render();
});

$('onset-save').addEventListener('click', () => {
  const session = state.sessions.find((x) => x.id === onsetFor);
  const input = readMinSec('onset-min', 'onset-sec');
  if (input.error) return void ($('onset-error').textContent = input.error);
  if (!session || input.empty) {
    onsetFor = null; // saving without a time = unknown
    return render();
  }
  if (!isValidOnset(input.value, session.durationSec)) {
    $('onset-error').textContent = `That's longer than the session (${formatTarget(session.durationSec)}).`;
    return;
  }
  onsetFor = null;
  update(setAnxietyOnset(state, session.id, input.value));
});
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
  if (mode !== 'ready' || !state.sessions.some((x) => x.id === onsetFor)) onsetFor = null;
  const askOnset = mode === 'ready' && onsetFor != null;
  $('view-onset').hidden = !askOnset;
  $('view-ready').hidden = mode !== 'ready' || askOnset;
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
  if (askOnset) {
    const s = state.sessions.find((x) => x.id === onsetFor);
    $('onset-duration').textContent = formatDuration(s.durationSec);
    $('onset-dog').textContent = state.dogs[0].name;
  }
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

  const { suggestion, suggested, repeat, value } = currentTarget();
  const isSuggested = suggested != null && value === suggested;

  $('target-label').textContent = isSuggested
    ? 'Suggestion today'
    : value == null
      ? suggested == null
        ? 'Choose a starting time'
        : 'No target'
      : 'Your target';
  $('target-value').textContent = value == null ? 'No target' : formatTarget(value);
  $('target-value').setAttribute(
    'aria-label',
    `${value == null ? 'No target' : `Target ${formatTarget(value)}`}. Tap to type a time.`,
  );
  $('target-value').classList.toggle('none', value == null);
  $('target-down').disabled = value == null || value <= MIN_TARGET_SEC;
  $('target-edit').hidden = !targetEditorOpen;

  const explain = EXPLANATION[suggestion.kind];
  $('target-basis').textContent = typeof explain === 'function' ? explain(suggestion.sec) : explain ?? '';
  $('target-basis').dataset.kind = suggestion.kind;

  // Earlier stable level: history only, shown when it is above today's suggestion.
  const earlier = suggestion.earlierLevel;
  const showEarlier = earlier != null && (suggested == null || earlier > suggested);
  $('earlier-level').hidden = !showEarlier;
  $('earlier-level').textContent = showEarlier
    ? `Earlier stable level: ${formatTarget(earlier)} (history, not today's target)`
    : '';

  const chips = [];
  if (suggested != null && value !== suggested) {
    chips.push(['suggested', `Use suggestion ${formatTarget(suggested)}`]);
  }
  if (repeat != null && value !== repeat && repeat !== suggested) {
    chips.push([repeat, `Repeat ${formatTarget(repeat)}`]);
  }
  if (value != null) chips.push(['none', 'No target']);
  $('target-chips').innerHTML = chips
    .map(([v, label]) => `<button type="button" class="chip" data-target="${v}">${label}</button>`)
    .join('');
}

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
          }, ${resultText(s).toLowerCase()}">
          <span class="when">${when}</span>
          <span class="dur">${formatDuration(s.durationSec)}</span>
          ${s.targetSec ? `<span class="planned">target ${formatTarget(s.targetSec)}</span>` : ''}
          <span class="tag ${s.result}"><i class="swatch ${s.result}"></i>${resultText(s)}</span>
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
  const hasOnset = Number.isFinite(s.anxietyOnsetSec);
  $('edit-onset-min').value = hasOnset ? Math.floor(s.anxietyOnsetSec / 60) : '';
  $('edit-onset-sec').value = hasOnset ? s.anxietyOnsetSec % 60 : '';
  $('edit-uncertain').checked = s.uncertain === true;
  $('edit-error').textContent = '';
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
  $('edit-onset-field').hidden = editing.result !== RESULTS.BAD;
  $('edit-uncertain-field').hidden = editing.result !== RESULTS.GOOD;
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
  const changes = {
    result: editing.result,
    contextId: editing.contextId,
    durationSec,
    targetSec: targetSec || null,
  };
  if (editing.result === RESULTS.BAD) {
    const onset = readMinSec('edit-onset-min', 'edit-onset-sec');
    if (onset.error) return void ($('edit-error').textContent = onset.error);
    if (!onset.empty && !isValidOnset(onset.value, durationSec)) {
      $('edit-error').textContent = 'Worry can\'t start after the session ended.';
      return;
    }
    changes.anxietyOnsetSec = onset.empty ? null : onset.value;
  } else {
    changes.uncertain = $('edit-uncertain').checked;
  }
  update(updateSession(state, editing.id, changes));
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

// Clear an error message as soon as the user corrects the value.
$('edit-form').addEventListener('input', () => ($('edit-error').textContent = ''));
$('view-onset').addEventListener('input', () => ($('onset-error').textContent = ''));
