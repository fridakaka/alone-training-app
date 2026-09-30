// All user-visible interface text, in one place, for both languages.
// Rules:
// - Every key must exist in BOTH languages (checked by tests/unit/i18n.test.js).
// - Only interface text is translated. The user's own text (dog name, place names,
//   comments) is never translated and is always inserted as plain text.
// - A few strings contain simple HTML (<strong>) – those are only used via tHtml(),
//   which escapes every parameter.

export const LANGS = ['en', 'sv'];
export const LANG_NAMES = { en: 'English', sv: 'Svenska' };
const LOCALES = { en: 'en-US', sv: 'sv-SE' };

const en = {
  appEyebrow: 'Alone training',
  pickerAria: 'Where are you training?',

  // Ready screen
  targetSuggestion: 'Suggestion today',
  targetChoose: 'Choose a starting time',
  targetNone: 'No target',
  targetYours: 'Your target',
  targetAriaValue: 'Target {time}',
  targetAria: '{value}. Tap to type a time.',
  targetShorter: 'Shorter target',
  targetLonger: 'Longer target',
  targetTypeGroup: 'Type a target time',
  targetMinutesAria: 'Target minutes',
  targetSecondsAria: 'Target seconds',
  targetSet: 'Set time',
  targetErrMin: 'Enter at least 1 second, or choose No target.',
  timeErrFormat: 'Use whole minutes and 0–59 seconds.',
  chipUseSuggestion: 'Use suggestion {time}',
  chipRepeat: 'Repeat {time}',
  earlierLevel: "Earlier stable level: {time} (history, not today's target)",
  explainRaise: 'Several calm sessions on different days — small increase.',
  explainRepeat: 'Keep this time until it feels stable.',
  explainLimitedNone: 'Limited basis — choose a short time. One session counts once more sessions confirm it.',
  explainLimited: 'Limited basis — repeat {time}.',
  explainEasier: 'The last session was hard — shorter suggestion.',
  explainHardChoose: 'The last session was hard — choose a short, easy time.',
  explainWorried: 'Worry from the start. Choose an easier step before the next absence.',
  explainBreak: "It's been a while. Choose a short time that feels easy today.",
  explainTooLittle: 'Too little usable recent history — choose a short, easy time.',
  explainNone: 'No sessions logged here yet — choose a short, easy time.',
  start: 'Start training',

  // Training
  trainingLabel: '{dog} has been alone for',
  trainingTarget: 'Target {time}',
  trainingReached: 'Target {time} reached',
  end: 'End training',

  // Result
  resultFinished: 'Session finished',
  resultTargetSuffix: ' · target {time}',
  resultQuestion: 'How did it go?',
  good: 'Went well',
  bad: "Didn't go well",
  discard: 'Discard this session',
  commentLabel: 'Comment',
  commentOptional: '(optional)',
  commentPlaceholder: 'E.g. “He lay down after a while”',
  commentCount: '{n}/{max}',

  // Worry follow-up
  onsetSaved: "Saved · {dur} · didn't go well",
  onsetQuestion: 'Roughly when did {dog} start to get worried?',
  onsetHint: 'Optional. Minutes and seconds from the start.',
  minutesAria: 'Minutes',
  secondsAria: 'Seconds',
  onsetUnknown: "Don't know",
  onsetTooLong: "That's longer than the session ({time}).",

  // Units
  unitMin: 'min',
  unitSec: 's',
  unitHour: 'h',

  // Progress + history
  progressTitle: 'Progress',
  legendTarget: 'Target',
  chartAria: 'Session duration over time',
  chartTap: 'Tap a bar to see details.',
  chartNote: 'Showing the latest {shown} of {total} sessions.',
  empty: 'Your {place} sessions will appear here after your first training.',
  historyTitle: 'Previous sessions',
  historyHint: 'Tap a session to edit or delete it.',
  historyShowAll: 'Show all ({n})',
  historyShowFewer: 'Show fewer',
  historyTarget: 'target {time}',
  historyRowAria: 'Edit session: {when}, {dur}{target}, {result}',
  historyRowAriaTarget: ', target {time}',
  historyRowAriaComment: ', comment: {comment}',
  resultWorriedAt: "Didn't go well · worried at {time}",
  resultNotCounted: 'Went well · not counted',

  // Settings
  settingsTitle: 'Settings',
  settingsEdit: 'Edit',
  settingsHint: "Change your dog's name, the language and the three place names. History and time suggestions stay the same.",
  dogNameLabel: "Dog's name",
  languageLabel: 'Language',
  placeNamesLabel: 'Place names',
  placeN: 'Place {n}',
  settingsSave: 'Save settings',
  settingsSaved: 'Settings saved.',
  settingsNoChanges: 'No changes.',
  errPlaceEmpty: 'Every place needs a name.',
  errPlaceDuplicate: "Two places can't have the same name.",
  errPlaceTooLong: 'Names can be at most {max} characters.',
  errDogEmpty: "Enter your dog's name.",
  errDogTooLong: "The dog's name can be at most {max} characters.",
  cancel: 'Cancel',
  save: 'Save',
  listAnd: 'and',

  // Language banner (existing users)
  langBannerText: 'Choose language · Välj språk',

  // Data
  dataTitle: 'Your data',
  dataHint: 'Stored only on this phone. Save a backup now and then.',
  dataLast: 'Last backup: {date}.',
  dataNever: 'No backup saved yet.',
  dataBackup: 'Save backup',
  dataCsv: 'Export for Excel',
  dataRestore: 'Restore from backup',
  dataSaved: 'Backup saved ({n} sessions).',
  dataCsvDone: 'Excel file created.',
  dataReading: 'Reading backup…',
  dataRestoredOne: 'Restored 1 session.',
  dataRestoredMany: 'Restored {n} sessions.',
  dataSkipped: ' {n} were already here.',
  dataNothingNew: 'Nothing new in that backup – all its sessions are already here.',
  dataNotBackup: "This file isn't a backup from this app.",
  dataReadError: 'Could not read that file.',
  restoreDiffers: 'The backup has other settings: {list}. Your current settings were kept.',
  restoreItemPlace: '“{from}” instead of “{current}”',
  restoreItemDog: 'dog “{from}” instead of “{current}”',
  restoreItemLang: '{from} instead of {current}',
  restoreApply: 'Use settings from backup',
  restoreKeep: 'Keep my settings',
  restoreApplied: 'Settings from the backup are now used.',
  restoreKept: 'Your settings were kept.',

  // Edit sheet
  editTitle: 'Edit session',
  editPlace: 'Place',
  editResult: 'Result',
  editActual: 'Actual duration',
  editTarget: 'Target',
  editLeaveEmptyNone: '(leave empty for none)',
  editWorried: 'Worried after',
  editLeaveEmptyUnknown: "(leave empty if you don't know)",
  editUncertain: "Don't count as progress",
  editUncertainHint: '(unsure or logged wrong)',
  editComment: 'Comment',
  editDelete: 'Delete session',
  editDeleteConfirm: 'Tap again to delete',
  editWorryAfterEnd: "Worry can't start after the session ended.",

  // Welcome + intro (also under Help)
  welcomeTitle: 'Welcome to Alone Time',
  introLead: 'A simple journal for alone training.',
  introStep1: 'Choose a place and a time that feels right.',
  introStep2: 'Start the timer. When you are back, end the session and note how it went.',
  introStep3: 'See your history and an editable suggestion for next time.',
  introExampleTitle: 'Example',
  introExample: 'A short session with the door closed goes calmly: note “Went well”. Another day a longer try gets hard: note “Didn\'t go well” and make the next try easier. Let your dog\'s reaction guide the next step.',
  introNote: 'Every dog is different and gets used to being alone at its own pace. A good day does not guarantee the next one. The time suggestions are preliminary aids, not individual training advice.',
  welcomeDogLabel: "Your dog's name",
  welcomeDogPlaceholder: 'E.g. Charlie',
  welcomeStart: 'Get started',

  // Help
  helpTitle: 'Help',
  helpIntroSummary: 'About Alone Time',
  helpCalcSummary: 'How is the time suggestion calculated?',
  helpCalcLead: "Suggestions are based on recent sessions in this place. Earlier long sessions stay in your history, but don't automatically decide today's time. Every dog and every day is different. Adjust the time to how your dog actually reacts.",
  helpCalc1: 'Each place ({places}) has its own history and suggestions. Only the 5 most recent sessions from the last 7 days in the chosen place count. Several sessions on one day count together as one day.',
  helpCalc2: '<strong>Small increase</strong> (about +10 %) when a time has gone well at least twice, on different days, and the latest session confirmed it.',
  helpCalc3: '<strong>Limited basis</strong>: with few recent sessions the app suggests repeating a time that more than one session supports. One session on its own only counts up to the time you planned for it – one long session never decides on its own.',
  helpCalc4: 'If longer times go well again on different days, that longer time can be confirmed directly – no need to go through many small steps.',
  helpCalc5: "<strong>Shorter</strong> after a session that didn't go well: below the time when worry started, if you entered it. After worry from the start, or a hard session without a shorter basis, there is no automatic time until two good sessions have followed.",
  helpCalc6: '<strong>After a break</strong> (nothing logged in 7 days) there is no automatic time. Choose a short time that feels easy. The earlier stable level is shown as history only.',
  helpCalcFree: 'You can always change the time, or train without a target. The timer never stops by itself, and reaching the target never counts as "went well" automatically. Comments are only notes – they never affect the suggestion.',
  helpCalcNote: "The app only knows the sessions you log. It is a training journal: it can't tell how long your dog can safely be alone and does not replace an individual training plan. The rules are preliminary and adjustable.",
};

const sv = {
  appEyebrow: 'Ensamträning',
  pickerAria: 'Var tränar ni?',

  targetSuggestion: 'Förslag idag',
  targetChoose: 'Välj en starttid',
  targetNone: 'Inget mål',
  targetYours: 'Ditt mål',
  targetAriaValue: 'Mål {time}',
  targetAria: '{value}. Tryck för att skriva en tid.',
  targetShorter: 'Kortare mål',
  targetLonger: 'Längre mål',
  targetTypeGroup: 'Skriv en måltid',
  targetMinutesAria: 'Mål, minuter',
  targetSecondsAria: 'Mål, sekunder',
  targetSet: 'Använd tiden',
  targetErrMin: 'Ange minst 1 sekund, eller välj Inget mål.',
  timeErrFormat: 'Ange hela minuter och 0–59 sekunder.',
  chipUseSuggestion: 'Använd förslaget {time}',
  chipRepeat: 'Upprepa {time}',
  earlierLevel: 'Tidigare stabil nivå: {time} (historik, inte dagens mål)',
  explainRaise: 'Flera lugna pass på olika dagar – liten ökning.',
  explainRepeat: 'Behåll tiden tills den känns stabil.',
  explainLimitedNone: 'Begränsat underlag – välj en kort tid. Ett enskilt pass räknas när fler pass bekräftar det.',
  explainLimited: 'Begränsat underlag – upprepa {time}.',
  explainEasier: 'Senaste passet var svårt – kortare förslag.',
  explainHardChoose: 'Senaste passet var svårt – välj en kort, lätt tid.',
  explainWorried: 'Oro från början. Välj ett lättare steg före nästa frånvaro.',
  explainBreak: 'Det var ett tag sedan. Välj en kort tid som känns lätt idag.',
  explainTooLittle: 'För lite användbar historik nyligen – välj en kort, lätt tid.',
  explainNone: 'Inga pass loggade här än – välj en kort, lätt tid.',
  start: 'Starta träning',

  trainingLabel: '{dog} har varit ensam i',
  trainingTarget: 'Mål {time}',
  trainingReached: 'Målet {time} är nått',
  end: 'Avsluta träning',

  resultFinished: 'Passet är avslutat',
  resultTargetSuffix: ' · mål {time}',
  resultQuestion: 'Hur gick det?',
  good: 'Gick bra',
  bad: 'Gick inte bra',
  discard: 'Släng det här passet',
  commentLabel: 'Kommentar',
  commentOptional: '(frivillig)',
  commentPlaceholder: 'T.ex. ”Han lade sig efter en stund”',
  commentCount: '{n}/{max}',

  onsetSaved: 'Sparat · {dur} · gick inte bra',
  onsetQuestion: 'Ungefär när började {dog} bli orolig?',
  onsetHint: 'Frivilligt. Minuter och sekunder från start.',
  minutesAria: 'Minuter',
  secondsAria: 'Sekunder',
  onsetUnknown: 'Vet inte',
  onsetTooLong: 'Det är längre än passet ({time}).',

  unitMin: 'min',
  unitSec: 's',
  unitHour: 'tim',

  progressTitle: 'Förlopp',
  legendTarget: 'Mål',
  chartAria: 'Passlängd över tid',
  chartTap: 'Tryck på en stapel för detaljer.',
  chartNote: 'Visar de senaste {shown} av {total} pass.',
  empty: 'Dina pass i {place} visas här efter första träningen.',
  historyTitle: 'Tidigare pass',
  historyHint: 'Tryck på ett pass för att ändra eller ta bort det.',
  historyShowAll: 'Visa alla ({n})',
  historyShowFewer: 'Visa färre',
  historyTarget: 'mål {time}',
  historyRowAria: 'Ändra pass: {when}, {dur}{target}, {result}',
  historyRowAriaTarget: ', mål {time}',
  historyRowAriaComment: ', kommentar: {comment}',
  resultWorriedAt: 'Gick inte bra · orolig efter {time}',
  resultNotCounted: 'Gick bra · räknas inte',

  settingsTitle: 'Inställningar',
  settingsEdit: 'Ändra',
  settingsHint: 'Ändra hundens namn, språket och namnen på de tre spåren. Historik och tidsförslag påverkas inte.',
  dogNameLabel: 'Hundens namn',
  languageLabel: 'Språk',
  placeNamesLabel: 'Spårnamn',
  placeN: 'Spår {n}',
  settingsSave: 'Spara inställningar',
  settingsSaved: 'Inställningarna är sparade.',
  settingsNoChanges: 'Inga ändringar.',
  errPlaceEmpty: 'Varje spår behöver ett namn.',
  errPlaceDuplicate: 'Två spår kan inte ha samma namn.',
  errPlaceTooLong: 'Namn får vara högst {max} tecken.',
  errDogEmpty: 'Skriv hundens namn.',
  errDogTooLong: 'Hundens namn får vara högst {max} tecken.',
  cancel: 'Avbryt',
  save: 'Spara',
  listAnd: 'och',

  langBannerText: 'Välj språk · Choose language',

  dataTitle: 'Dina data',
  dataHint: 'Sparas bara i den här telefonen. Spara en säkerhetskopia då och då.',
  dataLast: 'Senaste säkerhetskopia: {date}.',
  dataNever: 'Ingen säkerhetskopia sparad än.',
  dataBackup: 'Spara säkerhetskopia',
  dataCsv: 'Exportera till Excel',
  dataRestore: 'Återställ från säkerhetskopia',
  dataSaved: 'Säkerhetskopian är sparad ({n} pass).',
  dataCsvDone: 'Excel-filen är skapad.',
  dataReading: 'Läser säkerhetskopian…',
  dataRestoredOne: 'Återställde 1 pass.',
  dataRestoredMany: 'Återställde {n} pass.',
  dataSkipped: ' {n} fanns redan.',
  dataNothingNew: 'Inget nytt i säkerhetskopian – alla pass finns redan här.',
  dataNotBackup: 'Filen är ingen säkerhetskopia från den här appen.',
  dataReadError: 'Kunde inte läsa filen.',
  restoreDiffers: 'Säkerhetskopian har andra inställningar: {list}. Dina nuvarande inställningar behölls.',
  restoreItemPlace: '”{from}” i stället för ”{current}”',
  restoreItemDog: 'hunden ”{from}” i stället för ”{current}”',
  restoreItemLang: '{from} i stället för {current}',
  restoreApply: 'Använd säkerhetskopians inställningar',
  restoreKeep: 'Behåll mina inställningar',
  restoreApplied: 'Säkerhetskopians inställningar används nu.',
  restoreKept: 'Dina inställningar behölls.',

  editTitle: 'Ändra pass',
  editPlace: 'Spår',
  editResult: 'Resultat',
  editActual: 'Faktisk tid',
  editTarget: 'Mål',
  editLeaveEmptyNone: '(lämna tomt för inget mål)',
  editWorried: 'Orolig efter',
  editLeaveEmptyUnknown: '(lämna tomt om du inte vet)',
  editUncertain: 'Räkna inte som framsteg',
  editUncertainHint: '(osäkert eller felregistrerat)',
  editComment: 'Kommentar',
  editDelete: 'Ta bort passet',
  editDeleteConfirm: 'Tryck igen för att ta bort',
  editWorryAfterEnd: 'Oron kan inte börja efter att passet slutade.',

  welcomeTitle: 'Välkommen till Alone Time',
  introLead: 'En enkel journal för ensamträning.',
  introStep1: 'Välj ett träningsspår och en tid som känns lämplig.',
  introStep2: 'Starta timern. När du är tillbaka avslutar du passet och noterar hur det gick.',
  introStep3: 'Se historiken och ett redigerbart förslag inför nästa pass.',
  introExampleTitle: 'Exempel',
  introExample: 'Ett kort pass med stängd dörr går lugnt: notera ”Gick bra”. En annan dag blir ett längre försök svårt: notera ”Gick inte bra” och gör nästa försök lättare. Låt hundens reaktion styra nästa steg.',
  introNote: 'Alla hundar är olika och vänjer sig olika snabbt vid att vara ensamma. En bra dag garanterar inte nästa. Tidsförslagen är preliminära hjälpmedel, inte individuella träningsråd.',
  welcomeDogLabel: 'Hundens namn',
  welcomeDogPlaceholder: 'T.ex. Charlie',
  welcomeStart: 'Kom igång',

  helpTitle: 'Hjälp',
  helpIntroSummary: 'Om Alone Time',
  helpCalcSummary: 'Hur räknas tidsförslaget?',
  helpCalcLead: 'Förslagen bygger på nyliga pass i det här spåret. Tidigare långa pass finns kvar i historiken, men avgör inte automatiskt dagens tid. Alla hundar och dagar är olika. Anpassa tiden efter hur hunden faktiskt reagerar.',
  helpCalc1: 'Varje spår ({places}) har egen historik och egna förslag. Bara de 5 senaste passen från de senaste 7 dagarna i det valda spåret räknas. Flera pass samma dag räknas tillsammans som en dag.',
  helpCalc2: '<strong>Liten ökning</strong> (cirka +10 %) när en tid har gått bra minst två gånger, på olika dagar, och det senaste passet bekräftade den.',
  helpCalc3: '<strong>Begränsat underlag</strong>: med få nyliga pass föreslår appen att upprepa en tid som mer än ett pass stöder. Ett ensamt pass räknas bara upp till den tid du planerade – ett långt pass avgör aldrig ensamt.',
  helpCalc4: 'Om längre tider går bra igen på olika dagar kan den längre tiden bekräftas direkt – utan många små steg.',
  helpCalc5: '<strong>Kortare</strong> efter ett pass som inte gick bra: under tiden då oron började, om du angav den. Efter oro från början, eller ett svårt pass utan kortare underlag, ges ingen automatisk tid förrän två bra pass har följt.',
  helpCalc6: '<strong>Efter ett uppehåll</strong> (inga pass på 7 dagar) ges ingen automatisk tid. Välj en kort tid som känns lätt. Den tidigare stabila nivån visas bara som historik.',
  helpCalcFree: 'Du kan alltid ändra tiden eller träna utan mål. Timern stannar aldrig av sig själv, och ett nått mål räknas aldrig automatiskt som ”gick bra”. Kommentarer är bara anteckningar – de påverkar aldrig förslaget.',
  helpCalcNote: 'Appen känner bara till de pass du loggar. Den är en träningsjournal: den kan inte avgöra hur länge din hund säkert kan vara ensam och ersätter inte en individuell träningsplan. Reglerna är preliminära och justerbara.',
};

export const STRINGS = { en, sv };

// Default place names for NEW users, in the language chosen at first start.
// Existing names (default or renamed) are never changed by a language switch.
export const DEFAULT_PLACE_NAMES = {
  en: { home: 'Home', car: 'Car', 'outside-shop': 'Outside shop' },
  sv: { home: 'Hemma', car: 'Bilen', 'outside-shop': 'Utanför affären' },
};

let current = 'en';

export function setLang(lang) {
  current = LANGS.includes(lang) ? lang : 'en';
  return current;
}

export function getLang() {
  return current;
}

export function locale(lang = current) {
  return LOCALES[lang] ?? LOCALES.en;
}

// Best guess before the user has chosen (first start only).
export function guessLang(navLang = globalThis.navigator?.language) {
  return String(navLang || '').toLowerCase().startsWith('sv') ? 'sv' : 'en';
}

export function t(key, params = {}, lang = current) {
  const str = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

// For the few dictionary strings with <strong>: parameters are always escaped.
export function tHtml(key, params = {}, lang = current) {
  const safe = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, escapeHtml(v)]));
  return t(key, safe, lang);
}

// "3 min 05 s", "1 h 02 min" / "1 tim 02 min", "45 s".
export function formatDuration(totalSec, lang = current) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const u = (k) => t(k, {}, lang);
  if (h > 0) return `${h} ${u('unitHour')} ${String(m).padStart(2, '0')} ${u('unitMin')}`;
  if (m > 0) return `${m} ${u('unitMin')} ${String(s).padStart(2, '0')} ${u('unitSec')}`;
  return `${s} ${u('unitSec')}`;
}

export function listNames(names, lang = current) {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${t('listAnd', {}, lang)} ${names[names.length - 1]}`;
}
