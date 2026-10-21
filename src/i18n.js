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
  targetNoAuto: 'No automatic target today',
  targetNone: 'No target',
  targetYours: 'Your own target',
  targetYoursNone: 'No target (your choice)',
  appSuggestion: "The app's suggestion today: {time}.",
  appSuggestionNone: 'No automatic target today.',
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
  earlierLevel: 'Earlier stable level (several sessions): {time}',
  bestGood: 'Longest session that went well: {dur}, {date}',
  historyFacts: "History · not today's target",
  explainRaise: 'This time has gone well twice — small increase.',
  explainRepeat: 'Repeat this time until it has gone well twice.',
  explainRepeatOnce: 'It went well once — once more before it goes up.',
  explainShorter: "The latest session was shorter – that doesn't lower the suggestion.",
  explainBack: 'Back at the level from before the hard session.',
  explainFollow: 'The latest sessions were shorter than the suggestion — the suggestion follows them.',
  explainRecover: 'On the way back after a recent hard session — step {n} of {of} towards {time}.',
  explainLimitedNone: 'Limited basis — choose a short time. One session counts once more sessions confirm it.',
  explainLimited: 'Limited basis — repeat {time}.',
  explainEasierLatest: "The latest session didn't go well, so the suggestion is shorter.",
  explainEasierLatestOnset: "The latest session didn't go well — the suggestion is below the time when worry started.",
  explainEasierRecent: 'A recent hard session makes the suggestion shorter.',
  explainEasierRecentOnset: 'A recent hard session makes the suggestion shorter — below the time when worry started in that session.',
  explainHardChooseLatest: "The latest session didn't go well — choose a short, easy time.",
  explainHardChooseRecent: 'A recent hard session still limits the suggestion — choose a short, easy time.',
  explainWorriedLatest: 'Worry from the start in the latest session. Choose an easier step before the next absence.',
  explainWorriedRecent: 'A recent session with worry from the start still limits the suggestion. Choose a short, easy step.',
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
  savedGood: 'Saved · {dur} · went well',
  savedCommentHint: 'You can add or change the comment now – or later under Previous sessions.',
  done: 'Done',
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
  chartNote: 'Latest {shown} of {total}',
  chartClipNote: '↑ Long sessions are cut off so the short ones show.',
  overviewOpen: 'Show the whole course',
  overviewTitle: 'The whole course',
  overviewAria: 'All sessions over time',
  overviewPeriodAria: 'Period',
  overview30: '30 days',
  overview90: '3 months',
  overviewAll: 'All',
  overviewEmpty: 'No sessions in this period.',
  overviewLegendLine: 'Typical time that went well',
  overviewLegendGood: 'Longest that went well',
  overviewLegendBad: "Shortest that didn't",
  overviewNote: "The line shows the middle value of the latest 5 sessions that went well. For each day you see the longest session that went well and the shortest one that didn't.",
  close: 'Close',
  empty: 'Your {place} sessions will appear here after your first training.',
  historyTitle: 'Previous sessions',
  historyHint: 'Tap a session to read, edit or delete it.',
  historyEmpty: 'No sessions in {place} yet.',
  historyLink: 'Previous sessions ({n})',
  historyPickerAria: 'Show sessions for',
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

  // Menu and pages
  menuOpen: 'Menu',
  menuAria: 'Menu',
  navHome: 'Main screen',
  back: 'Back',
  liveBarTraining: '{dog} alone · {time}',
  liveBarPending: 'Session finished – not rated yet',
  liveBarBack: 'Back to the timer',
  liveBarBackResult: 'Back',

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
  restoreItemPlace: '“{from}” instead of “{current}”',
  restoreItemDog: 'dog “{from}” instead of “{current}”',
  restoreItemLang: '{from} instead of {current}',


  // Start over
  resetTitle: 'Start over',
  resetHint: 'For example with a new dog. Deletes everything in the app on this phone.',
  resetOpen: 'Delete all data…',
  resetConfirmTitle: 'Delete all data?',
  resetConfirmText: "Everything in the app is deleted from this phone: all sessions and comments, the dog's name, the place names and the ticks under Start here. It can't be undone.",
  resetBackupHint: 'Save a backup first if you may want the history back.',
  resetUnderstood: 'I understand that everything is deleted',
  resetConfirm: 'Delete everything',

  // Import review (before anything changes)
  importTitle: 'Import backup',
  importNewOne: '1 new session will be added',
  importNewMany: '{n} new sessions will be added',
  importNone: 'No new sessions in this backup.',
  importExisting: '{n} sessions are already here and stay as they are',
  importPeriod: 'Sessions from {from} to {to}',
  importComments: '{n} of them with a comment',
  importSettingsDiffer: 'The backup has other settings: {list}.',
  importSettingsNew: 'From the backup: dog “{dog}”, language {lang}, places {places}.',
  importUseSettings: "Also use the backup's dog name, language and place names",
  importSafe: 'Nothing on this phone is deleted. Sessions that are already here stay as they are.',
  importConfirm: 'Import',
  importCancelled: 'Import cancelled. Nothing was changed.',
  importSettingsApplied: 'Settings from the backup are now used.',
  welcomeImportHint: 'Used Alone Time before? Import your backup file instead (e.g. from the Files app).',
  welcomeImport: 'Import backup',
  namesOfferText: 'Use English names for the places? {list}',
  namesOfferApply: 'Use these names',
  namesOfferKeep: 'Keep current',

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
  prepLink: 'Completely untrained dog? Start here ›',
  startMenu: 'Untrained dog? Start here',
  startTitle: 'Completely untrained dog? Start here',
  startLead: "Is your dog not used to being alone at all? Start with these small steps before timed sessions.",
  startHowTitle: 'How it works',
  startHow1: 'Your dog gets used to it in steps so small that it can stay calm all the time. What you build is calm – not time.',
  startHow2: 'Start with something that is easy for your dog and repeat it, preferably a few short moments a day.',
  startHow3: 'When your dog seems relaxed, take a small step further. If it seems worried – whines, follows you, pants or can’t settle – go back to an easier step.',
  startHow4: 'Finish while your dog is still calm, and keep leaving and coming back low-key.',
  startStepsTitle: 'Steps to practise',
  startStepsHint: 'Tick what you have practised. Skip, repeat or change the order depending on how your dog reacts.',
  prepStep1: 'Stand up and sit down again.',
  prepStep2: 'Walk a few steps away and come back.',
  prepStep3: 'Leave the room for a moment and come back.',
  prepStep4: 'Close a door between you for a few seconds.',
  prepStep5: 'Do everyday departure cues – pick up your keys, put on your jacket – without leaving.',
  prepStep6: 'Open and close the front door without going out.',
  prepStep7: 'Go out of the front door and come straight back.',
  prepStep8: 'Start a first timed session in the app with a very short time, a few seconds.',
  startObserve: 'Notice whether your dog seems calm, and whether it can settle again afterwards – lying still is not the only sign.',
  startSaved: 'The ticks are saved on this phone (and in the backup). They do not affect sessions, the chart or the time suggestion.',
  startNote: 'A simple aid – not individual training advice. If your dog is very worried, get help from a dog trainer or a vet.',
  startReset: 'Remove all ticks',
  helpCalcRecord: "The longest session that went well is shown as history. It is one single session and never raises today's suggestion. The earlier stable level is something else: a time that several sessions on different days supported in the past.",
  helpCalcLead: "Suggestions follow your sessions in this place, one after another. Earlier long sessions stay in your history, but don't automatically decide today's time. Every dog and every day is different. Adjust the time to how your dog actually reacts.",
  helpCalc1: 'Each place ({places}) has its own history and suggestion. It builds on the typical level: the longest time that at least 3 of the latest 10 good sessions reached – single very long or very short sessions don\'t move it.',
  helpCalc2: '<strong>Small increase</strong> (about +10 %) when the two latest sessions went well at that level – also on the same day.',
  helpCalc3: '<strong>Ended early?</strong> A session that went well but ended before the suggestion never lowers it. One or two long sessions never decide on their own: a longer time counts once 3 of the latest 10 reached it.',
  helpCalc4: 'If a longer time goes well three times, the level moves there directly – no need to go through many small steps. When older sessions drop out of the latest 10, the level follows the newer ones.',
  helpCalc5: "<strong>After a session that didn't go well</strong> the suggestion is lower: below the time when worry started, if you entered it. Then every good session at the suggested time is a step back up – at most 3 steps back to the level from before. After worry from the start, or without a shorter basis, there is no automatic time until two good sessions have followed.",
  helpCalc6: '<strong>After a break</strong> (nothing logged in 7 days) there is no automatic time. Choose a short time that feels easy. The earlier stable level is shown as history only.',
  helpCalcFree: 'You can always change the time, or train without a target. The timer never stops by itself, and reaching the target never counts as "went well" automatically. Comments are only notes – they never affect the suggestion.',
  helpCalcNote: "The app only knows the sessions you log. It is a training journal: it can't tell how long your dog can safely be alone and does not replace an individual training plan. The rules are preliminary and adjustable.",
};

const sv = {
  appEyebrow: 'Ensamträning',
  pickerAria: 'Var tränar ni?',

  targetSuggestion: 'Förslag i dag',
  targetNoAuto: 'Inget automatiskt mål i dag',
  targetNone: 'Inget mål',
  targetYours: 'Ditt eget mål',
  targetYoursNone: 'Inget mål (ditt val)',
  appSuggestion: 'Appens förslag i dag: {time}.',
  appSuggestionNone: 'Inget automatiskt mål i dag.',
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
  earlierLevel: 'Tidigare stabil nivå (flera pass): {time}',
  bestGood: 'Längsta pass som gått bra: {dur}, {date}',
  historyFacts: 'Historik · inte dagens mål',
  explainRaise: 'Tiden har gått bra två gånger – liten ökning.',
  explainRepeat: 'Upprepa tiden tills den har gått bra två gånger.',
  explainRepeatOnce: 'Det gick bra en gång – en gång till innan tiden ökar.',
  explainShorter: 'Senaste passet blev kortare – det sänker inte förslaget.',
  explainBack: 'Tillbaka på nivån från före det svåra passet.',
  explainFollow: 'De senaste passen var kortare än förslaget – förslaget följer dem.',
  explainRecover: 'På väg tillbaka efter ett nyligt svårt pass – steg {n} av {of} mot {time}.',
  explainLimitedNone: 'Begränsat underlag – välj en kort tid. Ett enskilt pass räknas när fler pass bekräftar det.',
  explainLimited: 'Begränsat underlag – upprepa {time}.',
  explainEasierLatest: 'Senaste passet gick inte bra, därför är förslaget kortare.',
  explainEasierLatestOnset: 'Senaste passet gick inte bra – förslaget ligger under tiden då oron började.',
  explainEasierRecent: 'Ett nyligt svårt pass gör att förslaget är kortare.',
  explainEasierRecentOnset: 'Ett nyligt svårt pass gör att förslaget är kortare – under tiden då oron började i det passet.',
  explainHardChooseLatest: 'Senaste passet gick inte bra – välj en kort, lätt tid.',
  explainHardChooseRecent: 'Ett nyligt svårt pass begränsar fortfarande förslaget – välj en kort, lätt tid.',
  explainWorriedLatest: 'Oro från början i senaste passet. Välj ett lättare steg före nästa frånvaro.',
  explainWorriedRecent: 'Ett nyligt pass med oro från början begränsar fortfarande förslaget. Välj ett kort, lätt steg.',
  explainBreak: 'Det var ett tag sedan. Välj en kort tid som känns lätt i dag.',
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
  savedGood: 'Sparat · {dur} · gick bra',
  savedCommentHint: 'Du kan skriva eller ändra kommentaren nu – eller senare under Tidigare pass.',
  done: 'Klar',
  onsetTooLong: 'Det är längre än passet ({time}).',

  unitMin: 'min',
  unitSec: 's',
  unitHour: 'tim',

  progressTitle: 'Förlopp',
  legendTarget: 'Mål',
  chartAria: 'Passlängd över tid',
  chartTap: 'Tryck på en stapel för detaljer.',
  chartNote: 'Senaste {shown} av {total}',
  chartClipNote: '↑ Långa pass är avkortade så att de korta syns.',
  overviewOpen: 'Visa hela förloppet',
  overviewTitle: 'Hela förloppet',
  overviewAria: 'Alla pass över tid',
  overviewPeriodAria: 'Period',
  overview30: '30 dagar',
  overview90: '3 månader',
  overviewAll: 'Allt',
  overviewEmpty: 'Inga pass under perioden.',
  overviewLegendLine: 'Typisk tid som gått bra',
  overviewLegendGood: 'Längsta som gick bra',
  overviewLegendBad: 'Kortaste som inte gick bra',
  overviewNote: 'Linjen visar mittvärdet av de 5 senaste passen som gått bra. För varje dag ser du det längsta passet som gick bra och det kortaste som inte gick bra.',
  close: 'Stäng',
  empty: 'Dina pass i {place} visas här efter första träningen.',
  historyTitle: 'Tidigare pass',
  historyHint: 'Tryck på ett pass för att läsa, ändra eller ta bort det.',
  historyEmpty: 'Inga pass i {place} än.',
  historyLink: 'Tidigare pass ({n})',
  historyPickerAria: 'Visa pass för',
  historyShowAll: 'Visa alla ({n})',
  historyShowFewer: 'Visa färre',
  historyTarget: 'mål {time}',
  historyRowAria: 'Ändra pass: {when}, {dur}{target}, {result}',
  historyRowAriaTarget: ', mål {time}',
  historyRowAriaComment: ', kommentar: {comment}',
  resultWorriedAt: 'Gick inte bra · orolig efter {time}',
  resultNotCounted: 'Gick bra · räknas inte',

  settingsTitle: 'Inställningar',
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

  menuOpen: 'Meny',
  menuAria: 'Meny',
  navHome: 'Startsidan',
  back: 'Tillbaka',
  liveBarTraining: '{dog} ensam · {time}',
  liveBarPending: 'Passet är avslutat – inte bedömt än',
  liveBarBack: 'Tillbaka till timern',
  liveBarBackResult: 'Tillbaka',

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
  restoreItemPlace: '”{from}” i stället för ”{current}”',
  restoreItemDog: 'hunden ”{from}” i stället för ”{current}”',
  restoreItemLang: '{from} i stället för {current}',

  resetTitle: 'Börja om',
  resetHint: 'Till exempel med en ny hund. Raderar allt i appen på den här telefonen.',
  resetOpen: 'Radera all data…',
  resetConfirmTitle: 'Radera all data?',
  resetConfirmText: 'Allt i appen raderas från den här telefonen: alla pass och kommentarer, hundens namn, spårnamnen och bockarna under Börja här. Det går inte att ångra.',
  resetBackupHint: 'Spara en säkerhetskopia först om du kan vilja ha historiken kvar.',
  resetUnderstood: 'Jag förstår att allt raderas',
  resetConfirm: 'Radera allt',

  importTitle: 'Importera säkerhetskopia',
  importNewOne: '1 nytt pass läggs till',
  importNewMany: '{n} nya pass läggs till',
  importNone: 'Inga nya pass i säkerhetskopian.',
  importExisting: '{n} pass finns redan och lämnas som de är',
  importPeriod: 'Pass från {from} till {to}',
  importComments: '{n} av dem med kommentar',
  importSettingsDiffer: 'Säkerhetskopian har andra inställningar: {list}.',
  importSettingsNew: 'Från säkerhetskopian: hunden ”{dog}”, språket {lang}, spåren {places}.',
  importUseSettings: 'Använd också säkerhetskopians hundnamn, språk och spårnamn',
  importSafe: 'Inget i telefonen raderas. Pass som redan finns lämnas som de är.',
  importConfirm: 'Importera',
  importCancelled: 'Importen avbröts. Inget ändrades.',
  importSettingsApplied: 'Säkerhetskopians inställningar används nu.',
  welcomeImportHint: 'Har du använt Alone Time förut? Importera din säkerhetskopia i stället (t.ex. från appen Filer).',
  welcomeImport: 'Importera säkerhetskopia',
  namesOfferText: 'Byta spårnamnen till svenska? {list}',
  namesOfferApply: 'Använd de här namnen',
  namesOfferKeep: 'Behåll nuvarande',

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
  prepLink: 'Helt otränad hund? Börja här ›',
  startMenu: 'Otränad hund? Börja här',
  startTitle: 'Helt otränad hund? Börja här',
  startLead: 'Är hunden inte alls van vid att vara ensam? Börja med de här små stegen innan tidsatta pass.',
  startHowTitle: 'Så fungerar det',
  startHow1: 'Hunden vänjer sig i så små steg att den hela tiden kan vara lugn. Det är lugnet som byggs upp – inte tiden.',
  startHow2: 'Börja med något som är lätt för just din hund och upprepa det, gärna några korta stunder om dagen.',
  startHow3: 'När hunden verkar avslappnad tar du ett litet steg vidare. Verkar den orolig – piper, följer efter, flämtar eller inte kan slappna av – gå tillbaka till ett lättare steg.',
  startHow4: 'Avsluta medan hunden fortfarande är lugn, och gör det odramatiskt när du går och kommer tillbaka.',
  startStepsTitle: 'Steg att öva på',
  startStepsHint: 'Bocka för det ni har övat på. Hoppa över, upprepa eller byt ordning efter hur hunden reagerar.',
  prepStep1: 'Res dig och sätt dig igen.',
  prepStep2: 'Gå några steg bort och kom tillbaka.',
  prepStep3: 'Gå ut ur rummet en kort stund och kom tillbaka.',
  prepStep4: 'Stäng en dörr mellan er i några sekunder.',
  prepStep5: 'Gör vardagliga avresesignaler – ta nycklarna, sätt på jackan – utan att gå.',
  prepStep6: 'Öppna och stäng ytterdörren utan att gå ut.',
  prepStep7: 'Gå ut genom ytterdörren och kom tillbaka direkt.',
  prepStep8: 'Starta ett första tidsatt pass i appen med en mycket kort tid, några sekunder.',
  startObserve: 'Titta efter om hunden verkar lugn och om den kan återgå till lugn efteråt – att den ligger kvar är inte det enda tecknet.',
  startSaved: 'Bockarna sparas i telefonen (och i säkerhetskopian). De påverkar inte pass, graf eller tidsförslag.',
  startNote: 'Ett enkelt stöd – inte individuella träningsråd. Vid stark oro: ta hjälp av en hundinstruktör eller veterinär.',
  startReset: 'Ta bort alla bockar',
  helpCalcRecord: 'Längsta pass som gått bra visas som historik. Det är ett enskilt pass och höjer aldrig dagens förslag. Tidigare stabil nivå är något annat: en tid som flera pass på olika dagar stödde tidigare.',
  helpCalcLead: 'Förslagen följer passen i det här spåret, ett efter ett. Tidigare långa pass finns kvar i historiken, men avgör inte automatiskt dagens tid. Alla hundar och dagar är olika. Anpassa tiden efter hur hunden faktiskt reagerar.',
  helpCalc1: 'Varje spår ({places}) har egen historik och eget förslag. Det bygger på den typiska nivån: den längsta tid som minst 3 av de 10 senaste bra passen nådde – enstaka mycket långa eller korta pass flyttar den inte.',
  helpCalc2: '<strong>Liten ökning</strong> (cirka +10 %) när de två senaste passen gick bra på den nivån – även samma dag.',
  helpCalc3: '<strong>Avslutat tidigt?</strong> Ett pass som gick bra men avslutades före förslaget sänker aldrig förslaget. Ett eller två långa pass avgör aldrig ensamma: en längre tid räknas när 3 av de 10 senaste har nått den.',
  helpCalc4: 'Om en längre tid går bra tre gånger flyttas nivån dit direkt – utan många små steg. När äldre pass faller bort ur de 10 senaste följer nivån de nyare.',
  helpCalc5: '<strong>Efter ett pass som inte gick bra</strong> blir förslaget lägre: under tiden då oron började, om du angav den. Sedan är varje bra pass på den föreslagna tiden ett steg tillbaka uppåt – högst 3 steg tillbaka till nivån från före. Efter oro från början, eller utan kortare underlag, ges ingen automatisk tid förrän två bra pass har följt.',
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

// Places that still have the untouched default name of ANOTHER language get an offer for
// the default name in `lang` (e.g. Home → Hemma). Names the user chose are never included.
// Returns [{ id, from, to }].
export function defaultNameOffer(contexts, lang) {
  const target = DEFAULT_PLACE_NAMES[lang];
  if (!target) return [];
  return contexts
    .filter((c) => target[c.id] && c.name !== target[c.id])
    .filter((c) => Object.entries(DEFAULT_PLACE_NAMES).some(([l, names]) => l !== lang && names[c.id] === c.name))
    .map((c) => ({ id: c.id, from: c.name, to: target[c.id] }));
}
