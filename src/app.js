// Connects the screen to the logic. Holds no rules of its own.
// All interface text comes from i18n.js; the user's own text is always inserted as plain text.

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
  renameContexts,
  validateContextNames,
  renameDog,
  validateDogName,
  setPendingComment,
  completeOnboarding,
  MAX_CONTEXT_NAME,
  MAX_DOG_NAME,
  MAX_COMMENT,
  formatTimer,
  RESULTS,
} from './training.js';
import { loadState, saveState } from './store.js';
import { renderChart, resultText, MAX_BARS } from './chart.js';
import { stepUp, stepDown, formatTarget, MIN_TARGET_SEC } from './progression.js';
import { suggestTarget, KINDS } from './suggestion.js';
import {
  buildBackup, parseBackup, mergeSessions, buildCsv, backupFileName, settingsChanges,
} from './backup.js';
import {
  t, tHtml, setLang, getLang, locale, formatDuration, listNames, escapeHtml, guessLang,
  LANGS, LANG_NAMES, DEFAULT_PLACE_NAMES,
} from './i18n.js';

const $ = (id) => document.getElementById(id);

let state = loadState();
// New users: guess from the phone until they choose. Existing users without a choice: English
// (what the app has always shown) until they pick one in the small language banner.
setLang(state.lang ?? (state.onboarded ? 'en' : guessLang()));

// Still one dog. The context comes from the picker (remembered in state).
const dogId = () => state.dogs[0].id;
const dogName = () => state.dogs[0].name;
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

// ---------- static text (translated) ----------

function applyStaticText() {
  document.documentElement.lang = getLang();
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = tHtml(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  renderIntro($('welcome-intro'));
  renderIntro($('help-intro-body'));
  appliedLang = getLang();
}
let appliedLang = null;

// The short introduction: shown once on the welcome screen, and always under Help.
function renderIntro(box) {
  const p = (key, cls) => Object.assign(document.createElement('p'), { textContent: t(key), className: cls || '' });
  const steps = document.createElement('ol');
  steps.className = 'intro-steps';
  for (const k of ['introStep1', 'introStep2', 'introStep3']) {
    steps.append(Object.assign(document.createElement('li'), { textContent: t(k) }));
  }
  const example = document.createElement('p');
  example.className = 'intro-example';
  example.append(Object.assign(document.createElement('strong'), { textContent: `${t('introExampleTitle')}: ` }), t('introExample'));
  box.replaceChildren(p('introLead', 'intro-lead'), steps, example, p('introNote', 'intro-note'));
}

// ---------- first start ----------

let welcomeLang = getLang();

document.querySelectorAll('[data-welcome-lang]').forEach((b) =>
  b.addEventListener('click', () => {
    welcomeLang = setLang(b.dataset.welcomeLang);
    render();
  }),
);

$('welcome-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('welcome-dog').value;
  const err = validateDogName(name);
  if (err) {
    $('welcome-error').textContent = dogError(err);
    $('welcome-dog').focus();
    return;
  }
  // New users get the default place names in the language they chose. From now on the names
  // are theirs: a later language switch never renames them.
  update(completeOnboarding(state, { lang: welcomeLang, dogName: name, placeNames: DEFAULT_PLACE_NAMES[welcomeLang] }));
  $('start-btn').focus();
});
$('welcome-form').addEventListener('input', () => ($('welcome-error').textContent = ''));

function dogError(code) {
  return code === 'tooLong' ? t('errDogTooLong', { max: MAX_DOG_NAME }) : t('errDogEmpty');
}

function placeError(code) {
  if (code === 'tooLong') return t('errPlaceTooLong', { max: MAX_CONTEXT_NAME });
  if (code === 'duplicate') return t('errPlaceDuplicate');
  return t('errPlaceEmpty');
}

// ---------- language banner (existing users, optional) ----------

document.querySelectorAll('[data-banner-lang]').forEach((b) =>
  b.addEventListener('click', () => {
    setLang(b.dataset.bannerLang);
    update({ ...state, lang: getLang() });
  }),
);

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
    $('target-error').textContent = t('targetErrMin');
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
function explanation(kind, sec) {
  switch (kind) {
    case KINDS.RAISE: return t('explainRaise');
    case KINDS.REPEAT: return t('explainRepeat');
    case KINDS.LIMITED: return sec == null ? t('explainLimitedNone') : t('explainLimited', { time: formatTarget(sec) });
    case KINDS.EASIER: return t('explainEasier');
    case KINDS.HARD_CHOOSE: return t('explainHardChoose');
    case KINDS.WORRIED_AT_ONCE: return t('explainWorried');
    case KINDS.BREAK: return t('explainBreak');
    case KINDS.TOO_LITTLE: return t('explainTooLittle');
    case KINDS.NONE: return t('explainNone');
    default: return '';
  }
}

$('end-btn').addEventListener('click', () => {
  update(endSession(state, Date.now()));
});

// The comment typed on the result screen is kept with the pending session (survives a reload)
// and saved together with whichever result is chosen. Saving without a comment is fine.
$('result-comment').addEventListener('input', () => {
  state = setPendingComment(state, $('result-comment').value);
  saveState(state);
});

$('good-btn').addEventListener('click', () => update(recordResult(syncPendingComment(), RESULTS.GOOD)));
$('bad-btn').addEventListener('click', () => {
  // Saved right away, so nothing is lost; the follow-up question is optional.
  const next = recordResult(syncPendingComment(), RESULTS.BAD);
  onsetFor = next.sessions[next.sessions.length - 1]?.id ?? null;
  clearOnsetInputs();
  update(next);
});

function syncPendingComment() {
  return setPendingComment(state, $('result-comment').value);
}

// ---------- optional follow-up: when did worry start? ----------

let onsetFor = null; // id of the session just saved as "didn't go well" (memory only)

const readMinSec = (minId, secId) => {
  const mRaw = $(minId).value.trim();
  const sRaw = $(secId).value.trim();
  if (mRaw === '' && sRaw === '') return { empty: true };
  const m = Number(mRaw || 0);
  const sec = Number(sRaw || 0);
  if (!Number.isInteger(m) || !Number.isInteger(sec) || m < 0 || sec < 0 || sec > 59) {
    return { error: t('timeErrFormat') };
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
    $('onset-error').textContent = t('onsetTooLong', { time: formatTarget(session.durationSec) });
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
let lastMode = null;

function render() {
  if (appliedLang !== getLang()) applyStaticText();

  // First start: only the welcome screen.
  const welcome = !state.onboarded;
  $('welcome').hidden = !welcome;
  $('app').hidden = welcome;
  document.body.dataset.welcome = String(welcome);
  if (welcome) {
    for (const b of document.querySelectorAll('[data-welcome-lang]')) {
      b.setAttribute('aria-pressed', String(b.dataset.welcomeLang === welcomeLang));
    }
    return;
  }

  const mode = state.active ? 'training' : state.pending ? 'result' : 'ready';
  if (mode !== 'ready' || !state.sessions.some((x) => x.id === onsetFor)) onsetFor = null;
  const askOnset = mode === 'ready' && onsetFor != null;
  $('view-onset').hidden = !askOnset;
  $('view-ready').hidden = mode !== 'ready' || askOnset;
  $('view-training').hidden = mode !== 'training';
  $('view-result').hidden = mode !== 'result';
  $('lang-banner').hidden = !(state.lang == null && mode === 'ready' && !askOnset);
  document.body.dataset.mode = mode;

  $('dog-name').textContent = dogName();
  const ctxName = contextName(contextId());
  for (const id of ['context-name', 'progress-context', 'history-context']) $(id).textContent = ctxName;
  $('empty').textContent = t('empty', { place: ctxName });

  clearInterval(tick);
  if (mode === 'ready') renderReady();
  if (askOnset) {
    const s = state.sessions.find((x) => x.id === onsetFor);
    $('onset-saved').textContent = t('onsetSaved', { dur: formatDuration(s.durationSec) });
    $('onset-question').textContent = t('onsetQuestion', { dog: dogName() });
  }
  if (mode === 'training') {
    $('training-label').textContent = t('trainingLabel', { dog: dogName() });
    renderTimer();
    tick = setInterval(renderTimer, 250);
  }
  if (mode === 'result') {
    $('result-duration').textContent = formatDuration(state.pending.durationSec);
    $('result-target').textContent = state.pending.targetSec
      ? t('resultTargetSuffix', { time: formatTarget(state.pending.targetSec) })
      : '';
    // Fill the comment box when the result screen appears (e.g. after a reload).
    if (lastMode !== 'result') $('result-comment').value = state.pending.comment ?? '';
  }
  lastMode = mode;

  renderProgress();
  renderData();
  renderSettingsInfo();
}

// Place buttons are built with textContent: names are the user's own text.
// Buttons are created once and only their labels / pressed state are updated.
function fillPlaceButtons(container, selectedId) {
  if (container.children.length !== state.contexts.length) {
    container.replaceChildren(
      ...state.contexts.map((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'seg';
        b.dataset.context = c.id;
        return b;
      }),
    );
  }
  [...container.children].forEach((b, i) => {
    const c = state.contexts[i];
    b.dataset.context = c.id;
    if (b.textContent !== c.name) b.textContent = c.name;
    b.setAttribute('aria-pressed', String(c.id === selectedId));
  });
}

function renderSettingsInfo() {
  $('help-calc-1').innerHTML = tHtml('helpCalc1', { places: listNames(state.contexts.map((c) => c.name)) });
  if (!$('settings-details').open) fillSettingsForm();
}

// ---------- settings: dog name, language, place names ----------

function fillSettingsForm() {
  $('settings-dog').value = dogName();
  for (const r of document.querySelectorAll('input[name="settings-lang"]')) r.checked = r.value === getLang();
  const box = $('places-fields');
  if (!box.children.length) {
    box.replaceChildren(
      ...state.contexts.map((c) => {
        const label = document.createElement('label');
        label.className = 'place-field';
        const title = document.createElement('span');
        title.className = 'place-field-label';
        title.dataset.placeIndex = String(state.contexts.indexOf(c) + 1);
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `place-name-${c.id}`;
        input.dataset.context = c.id;
        input.maxLength = MAX_CONTEXT_NAME + 10; // allow pasting a bit extra; validation explains
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('enterkeyhint', 'done');
        label.append(title, input);
        return label;
      }),
    );
  }
  for (const el of box.querySelectorAll('[data-place-index]')) el.textContent = t('placeN', { n: el.dataset.placeIndex });
  for (const c of state.contexts) $(`place-name-${c.id}`).value = c.name;
  $('settings-error').textContent = '';
}

// Fill the form synchronously when opening. (The "toggle" event fires later and could
// overwrite what the user has already started typing.)
$('settings-details').querySelector('summary').addEventListener('click', () => {
  if (!$('settings-details').open) {
    fillSettingsForm();
    $('settings-status').textContent = '';
  }
});

$('settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const dogErr = validateDogName($('settings-dog').value);
  if (dogErr) return void ($('settings-error').textContent = dogError(dogErr));
  const names = Object.fromEntries(state.contexts.map((c) => [c.id, $(`place-name-${c.id}`).value]));
  const placeErr = validateContextNames(state, names);
  if (placeErr) return void ($('settings-error').textContent = placeError(placeErr));
  const lang = document.querySelector('input[name="settings-lang"]:checked')?.value ?? getLang();

  // Only labels and the interface language change. Ids, sessions and suggestions stay.
  // A language switch never renames places – the names are the user's own text.
  let next = renameContexts(renameDog(state, $('settings-dog').value), names);
  if (LANGS.includes(lang) && (lang !== state.lang)) next = { ...next, lang };
  const changed = JSON.stringify([next.dogs, next.contexts, next.lang]) !== JSON.stringify([state.dogs, state.contexts, state.lang]);
  setLang(next.lang ?? getLang());
  update(next);
  $('settings-details').open = false;
  fillSettingsForm();
  $('settings-status').textContent = changed ? t('settingsSaved') : t('settingsNoChanges');
});

$('settings-cancel').addEventListener('click', () => {
  fillSettingsForm();
  $('settings-details').open = false;
  $('settings-status').textContent = '';
});

$('settings-form').addEventListener('input', () => ($('settings-error').textContent = ''));

// ---------- ready screen ----------

function renderReady() {
  fillPlaceButtons($('context-picker'), state.selectedContextId);

  const { suggestion, suggested, repeat, value } = currentTarget();
  const isSuggested = suggested != null && value === suggested;

  $('target-label').textContent = isSuggested
    ? t('targetSuggestion')
    : value == null
      ? suggested == null
        ? t('targetChoose')
        : t('targetNone')
      : t('targetYours');
  $('target-value').textContent = value == null ? t('targetNone') : formatTarget(value);
  $('target-value').setAttribute(
    'aria-label',
    t('targetAria', { value: value == null ? t('targetNone') : t('targetAriaValue', { time: formatTarget(value) }) }),
  );
  $('target-value').classList.toggle('none', value == null);
  $('target-down').disabled = value == null || value <= MIN_TARGET_SEC;
  $('target-edit').hidden = !targetEditorOpen;

  $('target-basis').textContent = explanation(suggestion.kind, suggestion.sec);
  $('target-basis').dataset.kind = suggestion.kind;

  // Earlier stable level: history only, shown when it is above today's suggestion.
  const earlier = suggestion.earlierLevel;
  const showEarlier = earlier != null && (suggested == null || earlier > suggested);
  $('earlier-level').hidden = !showEarlier;
  $('earlier-level').textContent = showEarlier ? t('earlierLevel', { time: formatTarget(earlier) }) : '';

  const chips = [];
  if (suggested != null && value !== suggested) {
    chips.push(['suggested', t('chipUseSuggestion', { time: formatTarget(suggested) })]);
  }
  if (repeat != null && value !== repeat && repeat !== suggested) {
    chips.push([repeat, t('chipRepeat', { time: formatTarget(repeat) })]);
  }
  if (value != null) chips.push(['none', t('targetNone')]);
  $('target-chips').innerHTML = chips
    .map(([v, label]) => `<button type="button" class="chip" data-target="${v}">${escapeHtml(label)}</button>`)
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
    line.textContent = t(reached ? 'trainingReached' : 'trainingTarget', { time: formatTarget(target) });
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
    hiddenBars > 0 ? t('chartNote', { shown: MAX_BARS, total: sessions.length }) : '';
  $('chart-detail').textContent = hasData ? t('chartTap') : '';
  $('empty').hidden = hasData;
  document.querySelector('#progress .legend').hidden = !hasData;
  $('legend-target').hidden = !sessions.slice(-MAX_BARS).some((s) => s.targetSec);
  $('history-section').hidden = !hasData;

  const showAll = showAllHistory[contextId()];
  const newestFirst = sessions.slice().reverse();
  const visible = showAll ? newestFirst : newestFirst.slice(0, HISTORY_PREVIEW);
  const more = $('history-more');
  more.hidden = sessions.length <= HISTORY_PREVIEW;
  more.textContent = showAll ? t('historyShowFewer') : t('historyShowAll', { n: sessions.length });
  const editable = !state.active && !state.pending;

  // Everything below goes into HTML, so every piece of text is escaped.
  $('history').innerHTML = visible
    .map((s) => {
      const when = new Date(s.startedAt).toLocaleString(locale(), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
      const aria = t('historyRowAria', {
        when,
        dur: formatDuration(s.durationSec),
        target: s.targetSec ? t('historyRowAriaTarget', { time: formatTarget(s.targetSec) }) : '',
        result: resultText(s),
      }) + (s.comment ? t('historyRowAriaComment', { comment: s.comment }) : '');
      return `
      <li>
        <button type="button" class="row" data-id="${escapeHtml(s.id)}" ${editable ? '' : 'disabled'}
          aria-label="${escapeHtml(aria)}">
          <span class="when">${escapeHtml(when)}</span>
          <span class="dur">${escapeHtml(formatDuration(s.durationSec))}</span>
          ${s.targetSec ? `<span class="planned">${escapeHtml(t('historyTarget', { time: formatTarget(s.targetSec) }))}</span>` : ''}
          <span class="tag ${s.result}"><i class="swatch ${s.result}"></i>${escapeHtml(resultText(s))}</span>
          ${s.comment ? `<span class="note">${escapeHtml(s.comment)}</span>` : ''}
        </button>
      </li>`;
    })
    .join('');
}

function renderData() {
  $('last-backup').textContent = state.lastBackupAt
    ? t('dataLast', {
        date: new Date(state.lastBackupAt).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }),
      })
    : t('dataNever');
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
  $('edit-when').textContent = new Date(s.startedAt).toLocaleString(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  $('edit-context').replaceChildren();
  $('edit-dur-min').value = Math.floor(s.durationSec / 60);
  $('edit-dur-sec').value = s.durationSec % 60;
  $('edit-tgt-min').value = s.targetSec ? Math.floor(s.targetSec / 60) : '';
  $('edit-tgt-sec').value = s.targetSec ? s.targetSec % 60 : '';
  const hasOnset = Number.isFinite(s.anxietyOnsetSec);
  $('edit-onset-min').value = hasOnset ? Math.floor(s.anxietyOnsetSec / 60) : '';
  $('edit-onset-sec').value = hasOnset ? s.anxietyOnsetSec % 60 : '';
  $('edit-uncertain').checked = s.uncertain === true;
  $('edit-comment').value = s.comment ?? '';
  $('edit-error').textContent = '';
  renderEditor();
  dialog.showModal();
}

function renderEditor() {
  fillPlaceButtons($('edit-context'), editing.contextId);
  for (const b of dialog.querySelectorAll('[data-result]')) {
    b.setAttribute('aria-pressed', String(b.dataset.result === editing.result));
  }
  $('edit-onset-field').hidden = editing.result !== RESULTS.BAD;
  $('edit-uncertain-field').hidden = editing.result !== RESULTS.GOOD;
  $('edit-delete').textContent = deleteArmed ? t('editDeleteConfirm') : t('editDelete');
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
    comment: $('edit-comment').value, // empty = removed
  };
  if (editing.result === RESULTS.BAD) {
    const onset = readMinSec('edit-onset-min', 'edit-onset-sec');
    if (onset.error) return void ($('edit-error').textContent = onset.error);
    if (!onset.empty && !isValidOnset(onset.value, durationSec)) {
      $('edit-error').textContent = t('editWorryAfterEnd');
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
    status(t('dataSaved', { n: state.sessions.length }));
  }
});

$('csv-btn').addEventListener('click', async () => {
  if (await shareOrDownload(buildCsv(state), backupFileName('csv'), 'text/csv')) {
    status(t('dataCsvDone'));
  }
});

$('restore-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  status(t('dataReading'));
  try {
    const parsed = parseBackup(await file.text());
    try {
      localStorage.setItem(`alone-training:before-restore-${Date.now()}`, JSON.stringify(state));
    } catch {}
    const { state: merged, added, skipped } = mergeSessions(state, parsed.sessions);
    update(merged);
    status(
      added
        ? (added === 1 ? t('dataRestoredOne') : t('dataRestoredMany', { n: added })) +
            (skipped ? t('dataSkipped', { n: skipped }) : '')
        : t('dataNothingNew'),
    );
    offerBackupSettings(parsed);
  } catch (err) {
    status(err?.code === 'not-backup' ? t('dataNotBackup') : t('dataReadError'));
  }
});

// Restoring never changes dog name, language or place names by itself. If the backup
// has other values, show them and let the user choose. Backups without them change nothing.
let pendingBackup = null;

function offerBackupSettings(parsed) {
  const changes = settingsChanges(state, parsed);
  pendingBackup = changes.length ? parsed : null;
  $('restore-names').hidden = !changes.length;
  $('restore-names-text').textContent = changes.length
    ? t('restoreDiffers', {
        list: changes
          .map((c) =>
            c.kind === 'dog'
              ? t('restoreItemDog', { from: c.fromBackup, current: c.current })
              : c.kind === 'lang'
                ? t('restoreItemLang', { from: LANG_NAMES[c.fromBackup], current: LANG_NAMES[c.current] })
                : t('restoreItemPlace', { from: c.fromBackup, current: c.current }),
          )
          .join(', '),
      })
    : '';
}

$('restore-names-apply').addEventListener('click', () => {
  if (pendingBackup) {
    let next = state;
    if (pendingBackup.dogName) next = renameDog(next, pendingBackup.dogName);
    if (pendingBackup.contextNames) next = renameContexts(next, pendingBackup.contextNames);
    if (pendingBackup.lang && state.lang) next = { ...next, lang: pendingBackup.lang };
    setLang(next.lang ?? getLang());
    update(next);
  }
  offerBackupSettings(null);
  status(t('restoreApplied'));
});

$('restore-names-keep').addEventListener('click', () => {
  offerBackupSettings(null);
  status(t('restoreKept'));
});

// Timer catches up instantly when you come back to the app.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    state = loadState();
    if (state.lang) setLang(state.lang);
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

// Comments: never more than MAX_COMMENT characters (also enforced when saving).
for (const id of ['result-comment', 'edit-comment']) $(id).maxLength = MAX_COMMENT;
