# Alone Time – dog alone-training tracker (v0.12)

A calm, phone-first app for tracking Charlie's alone training in three places:
**Home**, **Car** and **Outside shop**.

Pick the place (remembered from last time) → tap **Start training** → come back and tap
**End training** → answer **Went well / Didn't go well**. Every session is saved with date,
place, target and actual duration, and result. Each place has its own graph, history and
suggested next duration.

<p>
<img src="docs/screenshots/28-home-sv.png" width="220" alt="Main screen: today's suggestion, its reason, and the longest good session as history">
<img src="docs/screenshots/26-menu-sv.png" width="220" alt="Menu during a running session">
<img src="docs/screenshots/27-result-comment-first-sv.png" width="220" alt="Result screen: comment first, then the result">
</p>

## Time suggestion

Suggestions are based on recent sessions in this place (last 7 days, max 5 sessions).
Earlier long sessions stay in the history and are shown as "earlier stable level", but don't
automatically decide today's time. A small increase (about +10 %) only after a time has gone
well on different days; with a limited basis the app suggests repeating a time that more than
one session supports; after a hard session it suggests less (below the worry time, if given);
after a break it shows no automatic time. You can always type a time (from 1 second), use − / +,
or train without a target.

Full rules and preliminary parameters: [docs/SUGGESTION-MODEL.md](docs/SUGGESTION-MODEL.md).
The app is a training journal – not advice, and it can't tell how long a dog can be alone.

## Typical level; target in the Dynamic Island (v0.12)

- The suggestion builds on the **typical level**: the longest time that at least 3 of the latest
  10 good sessions reached. One or two extreme sessions (very long or very short) no longer move it,
  and after a hard session the way back leads to that typical level – not to a few long sessions
  from long ago. See [docs/SUGGESTION-MODEL.md](docs/SUGGESTION-MODEL.md).
- iPhone: the compact Live Activity (Dynamic Island, while in another app) shows the target next
  to the running time.

## Faster, fairer progress; one screen; "Start here" (v0.11)

- **Time suggestion follows a current level** session by session (details in
  [docs/SUGGESTION-MODEL.md](docs/SUGGESTION-MODEL.md)): two good sessions at the time → +10 %,
  also on the same day; a good session that was ended early **never lowers** the suggestion
  (three in a row do make it follow); after a hard session the suggestion drops, and good sessions
  then lead **back to the earlier level in at most 3 steps**.
- **Main screen fits one iPhone screen** (tested at 390 × 763, with long place names and history lines).
- **After rating** (went well or not) the comment is shown again and can be written or changed.
- **"Untrained dog? Start here"** right below the main screen in the menu: how gradual
  alone training works, and 8 small practice steps whose ticks are saved (also in the backup).
  The ticks never affect sessions, the chart or the suggestion.

<p>
<img src="docs/screenshots/32-fits-one-screen-sv.png" width="220" alt="Main screen on one iPhone screen">
<img src="docs/screenshots/33-saved-comment-sv.png" width="220" alt="Comment after rating">
<img src="docs/screenshots/29-start-here-sv.png" width="220" alt="Start here for an untrained dog">
</p>

## Readable chart (v0.10)

- The main screen shows the **latest 10 sessions**, zoomed in on where the training is. A session
  more than 3 × the typical (median) time is **cut off** with its real time written above (↑50m),
  so one very long session no longer squashes the short ones. Tap a bar for the exact time.
- **Show the whole course** opens every session in the place (30 days / 3 months / all) on a
  log scale – 10 s and 2 h both fit – with a line for the typical time that went well
  (median of the latest 5 good sessions). Only a view: nothing is stored or used by the suggestion.

<p>
<img src="docs/screenshots/30-chart-zoomed-sv.png" width="260" alt="Zoomed chart with cut-off long sessions">
<img src="docs/screenshots/31-overview-sv.png" width="220" alt="The whole course with a smoothed line">
</p>

## Shorter main screen, menu, honest suggestion texts (v0.9)

- **Main screen**: dog, place, today's suggestion, Start training and the progress chart – nothing
  else. The **☰ menu** opens separate pages: *Previous sessions* (per place: read, edit, delete),
  *Settings*, *Your data* and *Help*, each with a *Back* button (the phone's back gesture works too).
  A running session is never touched by navigation: on another page a bar shows the running
  time and leads back to the timer (or to the waiting result).
- **Result screen**: the optional comment comes **before** *Went well* / *Didn't go well*.
- **Suggestion texts name the actual reason**: "The latest session didn't go well …" only when it
  really was the latest; an earlier hard session that still limits the suggestion is "a recent hard
  session". A target the user sets is labelled *Your own target*, with the app's suggestion shown
  next to it. No automatic target → "No automatic target today".
- **Longest session that went well** (with its date) is shown below today's target as history –
  one single session, never a target, never used by the calculation (tested). It is a different thing
  from the *earlier stable level*, which needs several sessions.
- **Help → Getting ready at home (optional)**: a few example exercises with tick boxes for the
  moment. Nothing is saved or counted (no sessions, chart, history or suggestion).
- The iOS app gets the same changes after `npm run ios:sync` (see docs/IOS.md).

## iPhone app (prototype, v0.8)

A small iOS app built from the same code with Capacitor: works offline, stores data in iOS
storage, and shows a real **Live Activity** (lock screen + Dynamic Island) with the running timer.
Step-by-step guide in Swedish: [docs/IOS.md](docs/IOS.md). The PWA keeps working as before.

- Importing a backup now always shows a review first (sessions to add, settings that differ);
  nothing changes before *Import*. New phones can import from the welcome screen.
- Switching language offers the other language's default place names – only for places that
  still have an untouched default name (Home → Hemma). Own names are never changed.

## Dog name, language, introduction, comments (v0.7)

- **First start** (new users only): choose Svenska/English, enter the dog's name, and read a
  very short introduction (also under *Help → About Alone Time*). Existing data never shows it:
  "Charlie" and all sessions stay until the user changes them.
- **Language**: all interface text is in `src/i18n.js` (English + Swedish, same keys – checked by
  a test). Existing users who haven't chosen see a small optional choice on the main screen (never
  during a session). Changed later under *Settings*. Dates use the chosen language.
- **Default place names**: new users get them in the language chosen at first start
  (Hemma / Bilen / Utanför affären, or Home / Car / Outside shop). After that the names are the
  user's own text: switching language never renames places – default or renamed.
- **Dog name**: *Settings*. Only the label changes; the dog's internal id stays (`charlie`), so no
  session moves.
- **Comment**: optional text on the result screen, saved with *Went well* / *Didn't go well*
  (max 500 characters). Shown shortened in the history, in full when a session is opened, and
  editable/removable there. Comments are never used by the time suggestion.

## App icon

Master artwork: `alone-time-app-icon-1024.png`. Sizes are made with `npm run icons` into
`icons/alone-time-{32,180,192,512}.png` (new file names so browsers don't keep a cached old icon).
**iPhone:** the home-screen icon of an already installed app is not updated automatically by iOS.
To see the new icon, remove Alone Time from the home screen and add it again from Safari
(*Share → Add to Home Screen*). Your data is kept: it belongs to the website, not the icon.

## Place names

The three places (Home, Car, Outside shop) can be renamed under **Place names** further down
the page. Each place keeps a fixed internal id (`home`, `car`, `outside-shop`); sessions point
to the id, so a rename only changes the label – history and suggestions stay with the place.
Names are trimmed, must be unique and non-empty, max 30 characters.

## Editing and backup

- After *Didn't go well* the app asks (optionally) roughly when worry started – or tap *Don't know*.
- Tap a session in *Previous sessions* to change its place, result, duration, target, worry time,
  mark it "don't count as progress", or delete it.
- **Your data** (bottom of the screen): *Save backup* (a file you can keep in Files/iCloud/mail),
  *Export for Excel* (shown place names, a stable *Place ID* column and a *Comment* column;
  text that looks like a formula is prefixed with ' so Excel shows it as text), and *Restore from backup*
  (adds sessions from a backup; never removes any). Backups include your place names. Restoring
  never changes your settings by itself: if the backup's dog name, language or place names differ,
  the app shows them and lets you choose *Use settings from backup* or *Keep my settings*. Backups
  also contain comments. Older backups without these fields change nothing.

## Get it on your phone

1. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
   Choose the branch (`main` once this is merged) and folder `/ (root)`, then **Save**.
2. After a minute the app is live at `https://fridakaka.github.io/alone-training-app/`.
3. Open that link on your phone:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.
4. Open it from the home-screen icon. It runs full-screen and works offline.

Your data is stored **only on that phone**, in that browser. Deleting the app
or clearing Safari/Chrome website data deletes the history.

## How it's built (short version)

See [docs/PLAN.md](docs/PLAN.md) for the plain-language explanation and
[docs/PLAN-v0.2.md](docs/PLAN-v0.2.md) / [docs/PLAN-v0.3.md](docs/PLAN-v0.3.md) for what each version added.

| File | What it does |
|---|---|
| `index.html` | The screen |
| `styles.css` | Look & feel, light and dark mode |
| `src/app.js` | Connects buttons to logic and redraws the screen |
| `src/training.js` | The rules: start, end, rate, places, durations (no screen code) |
| `src/suggestion.js` | Time suggestion model (see docs/SUGGESTION-MODEL.md) |
| `src/explain.js` | Which reason text to show, and the longest good session (history only) |
| `src/progression.js` | Rounding, −/+ steps and time formatting |
| `src/backup.js` | Backup file, restore (merge) and Excel export |
| `src/store.js` | Saves/loads data on the phone, upgrades v0.1 data |
| `src/chart.js` | Draws the graph |
| `sw.js`, `manifest.webmanifest`, `icons/` | Make it installable and work offline |
| `src/i18n.js` | All interface text, English and Swedish |
| `src/boot.js`, `src/native.js`, `src/liveActivity.js` | iOS app: native storage, Live Activity, files (no effect in the PWA) |
| `native/ios/`, `ios/` | Swift code for the Live Activity, and the Capacitor iOS project |

## For development

Needs [Node.js](https://nodejs.org) 20+.

```sh
npm install        # once
npm start          # open http://localhost:8080
npm test           # logic tests
npm run test:e2e   # clicks through the real app in a phone-sized browser, saves screenshots to test-results/
```

## Your data and upgrades

v0.2 stores data under a new key (`alone-training:v2`). On first launch it copies all
v0.1 sessions into **Home**. The original v0.1 data is left untouched on the phone as a backup.

## Not built yet (on purpose)

Multiple dogs, automatic cloud backup, a "mixed" result.
