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
  createInitialState,
  setPrepDone,
  PREP_STEPS,
  MAX_CONTEXT_NAME,
  MAX_DOG_NAME,
  MAX_COMMENT,
  formatTimer,
  RESULTS,
} from './training.js';
import { loadState, saveState } from './store.js';
import { renderChart, renderOverview, hasClippedBars, resultText, MAX_BARS } from './chart.js';
import { stepUp, stepDown, formatTarget, MIN_TARGET_SEC } from './progression.js';
import { suggestTarget } from './suggestion.js';
import { explanationKey, longestGoodSession } from './explain.js';
import {
  buildBackup, parseBackup, mergeSessions, buildCsv, backupFileName, importSummary,
} from './backup.js';
import {
  t, tHtml, setLang, getLang, locale, formatDuration, listNames, escapeHtml, guessLang,
  LANGS, LANG_NAMES, DEFAULT_PLACE_NAMES, defaultNameOffer,
} from './i18n.js';
import { isNativeApp, startLiveActivity, endLiveActivity, shareFileNative } from './native.js';
import { liveActivityPayload, liveActivityStep } from './liveActivity.js';

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
  renderPrep();
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

// "Start here": practice steps with saved ticks. Only a checklist – never a session, never
// used by the chart or the suggestion, no points and nothing that unlocks.
function renderPrep() {
  $('prep-list').replaceChildren(
    ...PREP_STEPS.map((k) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'check';
      const box = Object.assign(document.createElement('input'), { type: 'checkbox' });
      box.dataset.step = k;
      label.append(box, Object.assign(document.createElement('span'), { textContent: t(k) }));
      li.append(label);
      return li;
    }),
  );
  renderPrepTicks();
}

function renderPrepTicks() {
  const done = new Set(state.prepDone ?? []);
  for (const box of $('prep-list').querySelectorAll('input[data-step]')) box.checked = done.has(box.dataset.step);
  $('prep-reset').hidden = done.size === 0;
}

$('prep-list').addEventListener('change', (e) => {
  const box = e.target.closest('input[data-step]');
  if (box) update(setPrepDone(state, box.dataset.step, box.checked));
});
$('prep-reset').addEventListener('click', () => update({ ...state, prepDone: [] }));

// ---------- pages and menu ----------
// The main screen keeps only what you need to train. Previous sessions, settings, data and
// help are separate pages. A page is only a view: a running session is in `state` and keeps
// running (and saving) whatever page is shown.

const PAGES = ['start', 'history', 'settings', 'data', 'help'];
const pageFromUrl = () => (PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
let view = pageFromUrl();
let menuOpen = false;
let pushedFromHome = false; // the page was opened from the main screen: Back = the browser's back
let historyCtx = null; // place shown on the history page (starts at the main screen's place)

function go(next) {
  menuOpen = false;
  if (next === view) return render();
  const from = view;
  view = next;
  if (next === 'history') historyCtx = contextId();
  if (next === 'settings') {
    fillSettingsForm();
    $('settings-status').textContent = '';
  }
  // Keep the address in step, so the phone's own back gesture/button works too.
  if (next === 'home') {
    if (pushedFromHome) history.back();
    else history.replaceState(null, '', location.pathname + location.search);
    pushedFromHome = false;
  } else if (from === 'home') {
    history.pushState(null, '', `#${next}`);
    pushedFromHome = true;
  } else {
    history.replaceState(null, '', `#${next}`);
  }
  render();
  window.scrollTo(0, 0);
  (next === 'home' ? $('menu-btn') : $(`${next}-title`)).focus({ preventScroll: true });
}

window.addEventListener('popstate', () => {
  const next = pageFromUrl();
  if (next === view) return;
  if (next === 'history') historyCtx = contextId();
  if (next === 'settings') fillSettingsForm();
  if (next === 'home') pushedFromHome = false;
  view = next;
  menuOpen = false;
  render();
});

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) return go(nav.dataset.nav);
  if (menuOpen && !e.target.closest('#menu, #menu-btn')) {
    menuOpen = false;
    render();
  }
});

$('menu-btn').addEventListener('click', () => {
  menuOpen = !menuOpen;
  render();
  if (menuOpen) ($('menu').querySelector('[aria-current="page"]') || $('menu').querySelector('button')).focus();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuOpen) {
    menuOpen = false;
    render();
    $('menu-btn').focus();
  }
});

$('prep-link').addEventListener('click', () => go('start'));

function renderPages() {
  $('page-home').hidden = view !== 'home';
  for (const p of PAGES) $(`page-${p}`).hidden = view !== p;
  document.body.dataset.view = view;
  $('menu').hidden = !menuOpen;
  $('menu-btn').setAttribute('aria-expanded', String(menuOpen));
  for (const b of $('menu').querySelectorAll('[data-nav]')) {
    if (b.dataset.nav === view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  renderLiveBar();
}

// On another page during a session: a clear way back. The session itself is never touched.
function renderLiveBar() {
  const bar = $('live-bar');
  // (After "Didn't go well" the session is already saved; only the optional question waits.)
  const busy = state.active || state.pending;
  bar.hidden = view === 'home' || !busy;
  if (bar.hidden) return;
  bar.classList.toggle('pending', !state.active);
  $('live-bar-text').textContent = state.active
    ? t('liveBarTraining', { dog: dogName(), time: formatTimer(elapsedSeconds(state.active, Date.now())) })
    : t('liveBarPending');
  $('live-bar-action').textContent = state.active ? t('liveBarBack') : t('liveBarBackResult');
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
    offerDefaultNames(getLang());
    update({ ...state, lang: getLang() });
  }),
);

// ---------- default place names after a language switch (offer only) ----------

let namesOffer = [];

function offerDefaultNames(lang) {
  namesOffer = defaultNameOffer(state.contexts, lang);
}

$('names-offer-apply').addEventListener('click', () => {
  const names = Object.fromEntries(state.contexts.map((c) => [c.id, c.name]));
  for (const o of namesOffer) names[o.id] = o.to;
  namesOffer = [];
  update(renameContexts(state, names));
});

$('names-offer-keep').addEventListener('click', () => {
  namesOffer = [];
  render();
});

// ---------- iOS Live Activity ----------
// Started with a session, ended when the session ends or is discarded; restored or cleaned
// up when the app opens. Does nothing in the PWA.

let liveSent = 'unknown';

function syncLiveActivity() {
  if (!isNativeApp()) return;
  const payload = liveActivityPayload(state);
  const step = liveActivityStep(liveSent, payload);
  if (step.action === 'start') {
    liveSent = payload;
    startLiveActivity(payload);
  } else if (step.action === 'end') {
    liveSent = null;
    endLiveActivity();
  }
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

// One main, plain-language explanation of the ACTUAL reason (see explain.js).
// Never "the dog can …" – the journal can't establish that.
function explanation(suggestion) {
  const { key, params } = explanationKey(suggestion);
  return key ? t(key, params) : '';
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

// Saved right away, so nothing is lost. The next screen shows the comment again (editable),
// and after "Didn't go well" also asks the optional worry question.
function rate(result) {
  const next = recordResult(syncPendingComment(), result);
  savedFor = next.sessions[next.sessions.length - 1]?.id ?? null;
  savedFilled = null;
  clearOnsetInputs();
  update(next);
}
$('good-btn').addEventListener('click', () => rate(RESULTS.GOOD));
$('bad-btn').addEventListener('click', () => rate(RESULTS.BAD));

function syncPendingComment() {
  return setPendingComment(state, $('result-comment').value);
}

// ---------- after rating: comment (editable) and, after "didn't go well", the worry question ----------

let savedFor = null; // id of the session just saved (memory only)
let savedFilled = null; // the comment box was filled for this session

$('saved-comment').addEventListener('input', () => {
  if (!savedFor) return;
  state = updateSession(state, savedFor, { comment: $('saved-comment').value });
  saveState(state);
});

$('saved-done').addEventListener('click', () => {
  savedFor = null;
  render();
});

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
  savedFor = null;
  render();
});

$('onset-save').addEventListener('click', () => {
  const session = state.sessions.find((x) => x.id === savedFor);
  const input = readMinSec('onset-min', 'onset-sec');
  if (input.error) return void ($('onset-error').textContent = input.error);
  if (!session || input.empty) {
    savedFor = null; // saving without a time = unknown
    return render();
  }
  if (!isValidOnset(input.value, session.durationSec)) {
    $('onset-error').textContent = t('onsetTooLong', { time: formatTarget(session.durationSec) });
    return;
  }
  savedFor = null;
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
  syncLiveActivity();

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
  if (mode !== 'ready' || !state.sessions.some((x) => x.id === savedFor)) savedFor = null;
  renderPages();
  const askOnset = mode === 'ready' && savedFor != null; // the "saved" screen
  $('view-onset').hidden = !askOnset;
  $('view-ready').hidden = mode !== 'ready' || askOnset;
  $('view-training').hidden = mode !== 'training';
  $('view-result').hidden = mode !== 'result';
  $('lang-banner').hidden = !(state.lang == null && mode === 'ready' && !askOnset);
  // Keep the offer only for places that still have the offered default name's counterpart.
  namesOffer = namesOffer.filter((o) => state.contexts.find((c) => c.id === o.id)?.name === o.from);
  $('names-offer').hidden = !(namesOffer.length && mode === 'ready' && !askOnset);
  $('names-offer-text').textContent = namesOffer.length
    ? t('namesOfferText', { list: namesOffer.map((o) => `${o.from} → ${o.to}`).join(', ') })
    : '';
  document.body.dataset.mode = mode;

  $('dog-name').textContent = dogName();
  const ctxName = contextName(contextId());
  for (const id of ['context-name', 'progress-context']) $(id).textContent = ctxName;
  $('empty').textContent = t('empty', { place: ctxName });

  clearInterval(tick);
  if (mode === 'ready') renderReady();
  if (askOnset) {
    const s = state.sessions.find((x) => x.id === savedFor);
    const isBad = s.result === RESULTS.BAD;
    $('onset-saved').textContent = t(isBad ? 'onsetSaved' : 'savedGood', { dur: formatDuration(s.durationSec) });
    $('onset-question').textContent = t('onsetQuestion', { dog: dogName() });
    $('onset-block').hidden = !isBad;
    $('onset-actions').hidden = !isBad;
    $('saved-done').hidden = isBad;
    if (savedFilled !== s.id) {
      $('saved-comment').value = s.comment ?? '';
      savedFilled = s.id;
    }
  }
  if (mode === 'training') {
    $('training-label').textContent = t('trainingLabel', { dog: dogName() });
    renderTimer();
    tick = setInterval(() => {
      renderTimer();
      renderLiveBar();
    }, 250);
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
  renderHistory();
  renderPrepTicks();
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
  // Keep the form in step with the data – but never while the user may be typing in it.
  if (view !== 'settings') fillSettingsForm();
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
  if (LANGS.includes(lang) && (lang !== state.lang)) {
    next = { ...next, lang };
    namesOffer = defaultNameOffer(next.contexts, lang);
  }
  const changed = JSON.stringify([next.dogs, next.contexts, next.lang]) !== JSON.stringify([state.dogs, state.contexts, state.lang]);
  setLang(next.lang ?? getLang());
  update(next);
  fillSettingsForm();
  $('settings-status').textContent = changed ? t('settingsSaved') : t('settingsNoChanges');
});

// Cancel: nothing is saved; back to the main screen.
$('settings-cancel').addEventListener('click', () => {
  fillSettingsForm();
  $('settings-status').textContent = '';
  go('home');
});

$('settings-form').addEventListener('input', () => ($('settings-error').textContent = ''));

// ---------- ready screen ----------

function renderReady() {
  fillPlaceButtons($('context-picker'), state.selectedContextId);

  const { suggestion, suggested, repeat, value } = currentTarget();
  const isSuggested = suggested != null && value === suggested;

  // The app's suggestion and a target the user set are always told apart.
  const own = !isSuggested && !(value == null && suggested == null);
  $('target-label').textContent = isSuggested
    ? t('targetSuggestion')
    : !own
      ? t('targetNoAuto')
      : value == null
        ? t('targetYoursNone')
        : t('targetYours');
  $('target-label').dataset.source = isSuggested ? 'app' : own ? 'user' : 'none';
  $('target-value').textContent = value == null ? t('targetNone') : formatTarget(value);
  $('target-value').setAttribute(
    'aria-label',
    t('targetAria', { value: value == null ? t('targetNone') : t('targetAriaValue', { time: formatTarget(value) }) }),
  );
  $('target-value').classList.toggle('none', value == null);
  $('target-down').disabled = value == null || value <= MIN_TARGET_SEC;
  $('target-edit').hidden = !targetEditorOpen;

  // When the user has set their own target, the line says what the APP suggests and why.
  const reason = explanation(suggestion);
  $('target-basis').textContent = own
    ? `${suggested == null ? t('appSuggestionNone') : t('appSuggestion', { time: formatTarget(suggested) })} ${reason}`
    : reason;
  $('target-basis').dataset.kind = suggestion.kind;

  // History, kept short and quiet below today's target. Neither number is a target, and
  // neither is used to compute one.
  // - Longest session marked "Went well" here (one single session, with its date).
  // - Earlier stable level (several sessions, before the current window): shown when above today.
  const best = longestGoodSession(sessionsFor(state, current()));
  $('best-good').hidden = !best;
  $('best-good').textContent = best ? t('bestGood', { dur: formatDuration(best.durationSec), date: longDate(best.startedAt) }) : '';
  const earlier = suggestion.earlierLevel;
  const showEarlier = earlier != null && (suggested == null || earlier > suggested);
  $('earlier-level').hidden = !showEarlier;
  $('earlier-level').textContent = showEarlier ? t('earlierLevel', { time: formatTarget(earlier) }) : '';
  $('history-facts').hidden = !best && !showEarlier;

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

// "12 Sep" (with the year when it isn't this year) – short, so the main screen fits.
function longDate(ms) {
  const d = new Date(ms);
  const opts = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(locale(), opts);
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

// Main screen: the chart for the selected place, and the way to its sessions.
function renderProgress() {
  const sessions = sessionsFor(state, current());
  const hasData = sessions.length > 0;

  $('chart').innerHTML = renderChart(sessions);
  const hiddenBars = sessions.length - MAX_BARS;
  $('chart-note').hidden = hiddenBars <= 0;
  $('chart-note').textContent =
    hiddenBars > 0 ? t('chartNote', { shown: MAX_BARS, total: sessions.length }) : '';
  $('chart-detail').textContent = ''; // filled when a bar is tapped (keeps the screen short)
  $('chart-clip-note').hidden = !hasClippedBars(sessions);
  $('overview-btn').hidden = sessions.length < 2;
  $('empty').hidden = hasData;
  document.querySelector('#progress .legend').hidden = !hasData;
  $('legend-target').hidden = !sessions.slice(-MAX_BARS).some((s) => s.targetSec);
  $('history-link').hidden = !hasData;
  $('history-link').textContent = hasData ? `${t('historyLink', { n: sessions.length })} ›` : '';
  // Only for someone who hasn't logged any session yet: easy to find, never in the way later.
  $('prep-link').hidden = state.sessions.some((s) => s.dogId === dogId());
}

// ---------- the whole course (overview sheet) ----------

const overviewDialog = $('overview-dialog');
let overviewDays = 'all';

function renderOverviewSheet() {
  const sessions = sessionsFor(state, current());
  const from = overviewDays === 'all' ? null : Date.now() - Number(overviewDays) * 86_400_000;
  const svg = renderOverview(sessions, { from });
  $('overview-chart').innerHTML = svg;
  $('overview-empty').hidden = Boolean(svg);
  $('overview-place').textContent = contextName(contextId());
  for (const b of $('overview-period').querySelectorAll('[data-days]')) {
    b.setAttribute('aria-pressed', String(b.dataset.days === overviewDays));
  }
}

$('overview-btn').addEventListener('click', () => {
  renderOverviewSheet();
  overviewDialog.showModal();
});
$('overview-period').addEventListener('click', (e) => {
  const b = e.target.closest('[data-days]');
  if (!b) return;
  overviewDays = b.dataset.days;
  renderOverviewSheet();
});
$('overview-close').addEventListener('click', () => overviewDialog.close());
overviewDialog.addEventListener('click', (e) => {
  if (e.target === overviewDialog) overviewDialog.close();
});

// History page: sessions per place, newest first. Read, edit or delete.
const historyContextId = () => (view === 'history' && historyCtx) || contextId();

function renderHistory() {
  const ctx = historyContextId();
  fillPlaceButtons($('history-picker'), ctx);
  const sessions = sessionsFor(state, { dogId: dogId(), contextId: ctx });
  const hasData = sessions.length > 0;
  $('history-empty').hidden = hasData;
  $('history-empty').textContent = hasData ? '' : t('historyEmpty', { place: contextName(ctx) });
  $('history-hint').hidden = !hasData;

  const showAll = showAllHistory[ctx];
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

$('history-picker').addEventListener('click', (e) => {
  const b = e.target.closest('[data-context]');
  if (!b) return;
  historyCtx = b.dataset.context;
  renderHistory();
});

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
  const ctx = historyContextId();
  showAllHistory[ctx] = !showAllHistory[ctx];
  renderHistory();
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
  // iOS app: write the file and open the share sheet ("Save to Files", AirDrop, mail …).
  if (isNativeApp()) {
    try {
      return await shareFileNative(fileName, text);
    } catch {
      status(t('dataReadError'));
      return false;
    }
  }
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

// ---------- start over: delete all data (after a clear confirmation) ----------

const resetDialog = $('reset-dialog');

$('reset-btn').addEventListener('click', () => {
  $('reset-understood').checked = false;
  $('reset-confirm').disabled = true;
  resetDialog.showModal();
});
$('reset-understood').addEventListener('change', () => ($('reset-confirm').disabled = !$('reset-understood').checked));
$('reset-cancel').addEventListener('click', () => resetDialog.close());
$('reset-backup').addEventListener('click', () => $('backup-btn').click());

$('reset-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!$('reset-understood').checked) return;
  // Older copies kept by earlier versions (before a restore, unreadable data, v0.1) go too.
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('alone-training:')) localStorage.removeItem(k);
  } catch {}
  // Everything that only lives on this screen is cleared as well.
  for (const k of Object.keys(draftTargets)) delete draftTargets[k];
  for (const k of Object.keys(showAllHistory)) delete showAllHistory[k];
  savedFor = null;
  namesOffer = [];
  historyCtx = null;
  pushedFromHome = false;
  welcomeLang = getLang(); // the welcome starts in the language used so far
  $('welcome-dog').value = '';
  $('welcome-error').textContent = '';
  status('');
  resetDialog.close();
  // A fresh start: the welcome screen, as on a new phone. (Saved over the old data – also in the
  // iOS app's own storage.) A running session ends, and so does its Live Activity.
  view = 'home';
  history.replaceState(null, '', location.pathname + location.search);
  update(createInitialState());
});

// ---------- import a backup: always a review first, nothing changes before "Import" ----------

const importDialog = $('import-dialog');
let pendingImport = null; // { parsed, mode: 'restore' | 'welcome' }

async function readBackupFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return null;
  status(t('dataReading'));
  try {
    const parsed = parseBackup(await file.text());
    status('');
    return parsed;
  } catch (err) {
    const msg = err?.code === 'not-backup' ? t('dataNotBackup') : t('dataReadError');
    status(msg);
    $('welcome-error').textContent = state.onboarded ? '' : msg;
    return null;
  }
}

$('restore-input').addEventListener('change', async (e) => {
  const parsed = await readBackupFile(e.target);
  if (parsed) openImport(parsed, 'restore');
});

$('welcome-import-input').addEventListener('change', async (e) => {
  const parsed = await readBackupFile(e.target);
  if (parsed) openImport(parsed, 'welcome');
});

const dateOnly = (ms) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

function openImport(parsed, mode) {
  pendingImport = { parsed, mode };
  const sum = importSummary(state, parsed);
  const items = [];
  items.push(sum.newCount === 0 ? t('importNone') : sum.newCount === 1 ? t('importNewOne') : t('importNewMany', { n: sum.newCount }));
  if (sum.newCount) items.push(t('importPeriod', { from: dateOnly(sum.firstAt), to: dateOnly(sum.lastAt) }));
  if (sum.commentCount) items.push(t('importComments', { n: sum.commentCount }));
  if (sum.existingCount) items.push(t('importExisting', { n: sum.existingCount }));
  $('import-summary').replaceChildren(...items.map((x) => Object.assign(document.createElement('li'), { textContent: x })));

  // Settings: on a brand-new phone they are simply taken from the backup (nothing to overwrite);
  // otherwise the differences are listed and only used if the user ticks the box.
  const box = $('import-settings');
  if (mode === 'welcome') {
    const names = parsed.contextNames ? Object.values(parsed.contextNames) : null;
    const show = parsed.dogName || parsed.lang || names;
    box.hidden = !show;
    $('import-settings-text').textContent = show
      ? t('importSettingsNew', {
          dog: parsed.dogName ?? state.dogs[0].name,
          lang: LANG_NAMES[parsed.lang ?? welcomeLang],
          places: listNames(names ?? Object.values(DEFAULT_PLACE_NAMES[parsed.lang ?? welcomeLang])),
        })
      : '';
    $('import-use-settings-field').hidden = true;
    $('import-use-settings').checked = true;
  } else {
    box.hidden = !sum.changes.length;
    $('import-use-settings-field').hidden = false;
    $('import-use-settings').checked = false;
    $('import-settings-text').textContent = sum.changes.length
      ? t('importSettingsDiffer', {
          list: sum.changes
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
  importDialog.showModal();
}

$('import-cancel').addEventListener('click', () => {
  pendingImport = null;
  importDialog.close();
  status(t('importCancelled'));
});

$('import-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!pendingImport) return importDialog.close();
  const { parsed, mode } = pendingImport;
  const useSettings = $('import-use-settings').checked;
  pendingImport = null;
  try {
    localStorage.setItem(`alone-training:before-restore-${Date.now()}`, JSON.stringify(state));
  } catch {}
  let next = mergeSessions(state, parsed.sessions);
  const { added, skipped } = next;
  next = next.state;
  // "Start here" ticks from the backup are added; none are removed.
  for (const k of parsed.prepDone ?? []) next = setPrepDone(next, k, true);
  if (mode === 'welcome') {
    const lang = parsed.lang ?? welcomeLang;
    next = completeOnboarding(next, {
      lang,
      dogName: parsed.dogName ?? next.dogs[0].name,
      placeNames: parsed.contextNames ?? DEFAULT_PLACE_NAMES[lang],
    });
    setLang(lang);
  } else if (useSettings) {
    if (parsed.dogName) next = renameDog(next, parsed.dogName);
    if (parsed.contextNames) next = renameContexts(next, parsed.contextNames);
    if (parsed.lang && next.lang) {
      next = { ...next, lang: parsed.lang };
      setLang(parsed.lang);
    }
  }
  importDialog.close();
  update(next);
  status(
    (added
      ? (added === 1 ? t('dataRestoredOne') : t('dataRestoredMany', { n: added })) + (skipped ? t('dataSkipped', { n: skipped }) : '')
      : t('dataNothingNew')) + (mode === 'restore' && useSettings ? ` ${t('importSettingsApplied')}` : ''),
  );
});

// Timer catches up instantly when you come back to the app.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    state = loadState();
    if (state.lang) setLang(state.lang);
    render();
  }
});

fillSettingsForm(); // also when the app opens directly on the settings page
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Clear an error message as soon as the user corrects the value.
$('edit-form').addEventListener('input', () => ($('edit-error').textContent = ''));
$('view-onset').addEventListener('input', () => ($('onset-error').textContent = ''));

// Comments: never more than MAX_COMMENT characters (also enforced when saving).
for (const id of ['result-comment', 'saved-comment', 'edit-comment']) $(id).maxLength = MAX_COMMENT;
