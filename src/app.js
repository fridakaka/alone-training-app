// Connects the screen to the logic. Holds no rules of its own.

import {
  startSession,
  endSession,
  recordResult,
  discardPending,
  elapsedSeconds,
  sessionsFor,
  selectContext,
  formatTimer,
  formatDuration,
  RESULTS,
} from './training.js';
import { loadState, saveState } from './store.js';
import { renderChart, MAX_BARS } from './chart.js';
import {
  suggestNext,
  repeatLast,
  lastSession,
  stepUp,
  stepDown,
  formatTarget,
  MIN_TARGET_SEC,
} from './progression.js';

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
  const suggested = suggestNext(sessions);
  const ctx = contextId();
  const value = ctx in draftTargets ? draftTargets[ctx] : suggested;
  return { sessions, suggested, repeat: repeatLast(sessions), value };
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

  const { sessions, suggested, repeat, value } = currentTarget();
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
      }${isSuggested ? (last.result === RESULTS.GOOD ? ' · +10%' : ' · −10%') : ''}`
    : `A suggestion appears after your first ${contextName(contextId())} session.`;

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
  $('chart-detail').textContent = hasData ? 'Tap a bar to see details.' : '';
  $('empty').hidden = hasData;
  document.querySelector('#progress .legend').hidden = !hasData;
  $('legend-target').hidden = !sessions.slice(-MAX_BARS).some((s) => s.targetSec);
  $('history-section').hidden = !hasData;

  $('history').innerHTML = sessions
    .slice()
    .reverse()
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
      <li class="row">
        <span class="when">${when}</span>
        <span class="dur">${formatDuration(s.durationSec)}</span>
        ${s.targetSec ? `<span class="planned">target ${formatTarget(s.targetSec)}</span>` : ''}
        <span class="tag ${s.result}"><i class="swatch ${s.result}"></i>${good ? 'Went well' : "Didn't go well"}</span>
      </li>`;
    })
    .join('');
}

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
