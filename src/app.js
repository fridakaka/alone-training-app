// Connects the screen to the logic. Holds no rules of its own.

import {
  startSession,
  endSession,
  recordResult,
  discardPending,
  elapsedSeconds,
  sessionsFor,
  formatTimer,
  formatDuration,
  RESULTS,
} from './training.js';
import { loadState, saveState } from './store.js';
import { renderChart } from './chart.js';

const $ = (id) => document.getElementById(id);

let state = loadState();

// v0.1: exactly one dog and one context. Later this becomes a user choice.
const current = { dogId: state.dogs[0].id, contextId: state.contexts[0].id };

function update(next) {
  state = next;
  saveState(state);
  render();
}

// ---------- actions ----------

$('start-btn').addEventListener('click', () => {
  update(startSession(state, { ...current, now: Date.now() }));
});

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

  $('dog-name').textContent = state.dogs.find((d) => d.id === current.dogId).name;
  $('context-name').textContent = state.contexts.find((c) => c.id === current.contextId).name;

  clearInterval(tick);
  if (mode === 'training') {
    renderTimer();
    tick = setInterval(renderTimer, 250);
  }
  if (mode === 'result') {
    $('result-duration').textContent = formatDuration(state.pending.durationSec);
  }

  renderProgress();
}

function renderTimer() {
  $('timer').textContent = formatTimer(elapsedSeconds(state.active, Date.now()));
}

function renderProgress() {
  const sessions = sessionsFor(state, current);
  const hasData = sessions.length > 0;

  $('chart').innerHTML = renderChart(sessions);
  $('chart-detail').textContent = hasData ? 'Tap a bar to see details.' : '';
  $('empty').hidden = hasData;
  document.querySelector('#progress .legend').hidden = !hasData;
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
