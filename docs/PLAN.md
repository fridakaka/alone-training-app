# Version 0.1 – implementation plan

## Goal
A working alone-training tracker for Charlie that runs on a phone,
as quickly as reasonably possible.

## Technology (in plain language)

**A web app that you install on your phone's home screen** (a "Progressive Web App").
It is a website, but once you choose "Add to Home Screen" it opens full-screen with
its own icon, like a normal app, and works without internet.

Why this instead of an App Store app:
- No App Store / Google Play review, no developer account, no fees.
- Works on both iPhone and Android from the same code.
- Updating the app = updating the website. Your phone picks it up automatically.

**Plain HTML, CSS and JavaScript – no framework, no build step.**
- HTML = the structure of the screen, CSS = how it looks, JavaScript = what happens when you tap.
- No framework (like React) means fewer moving parts to learn and nothing to "compile".
  The files in the repo are exactly the files the phone runs.

**Data is stored on the phone itself** (the browser's `localStorage`).
- Nothing leaves your phone. No accounts, no server.
- Trade-off: if you delete the app / clear browser data, the history is gone.
  That's acceptable for a prototype; a cloud backup can come later.

**The timer stores the start time, not a ticking counter.**
The app saves "training started at 14:02:10" and always shows *now minus start time*.
So if the phone locks, you switch apps, or the app is closed, the timer is still correct
when you come back.

**Hosting: GitHub Pages** (free). It publishes the files in this repository as a website.

**Tests:**
- Small automated tests for the logic (durations, saving, graph data) using Node's built-in test runner.
- An end-to-end test that opens the app in a real (headless) browser on a phone-sized
  screen and clicks through start → end → "went well" → checks history and graph.

## Structure (so later features fit in)

```
index.html              the single screen
styles.css              look & feel (light + dark mode)
src/app.js              connects buttons and screen updates
src/store.js            reads/writes data on the phone
src/training.js         pure logic: start, end, durations, formatting
src/chart.js            draws the graph (SVG)
sw.js, manifest.webmanifest, icon.svg   make it installable + offline
tests/                  automated tests
```

The saved data already has room for more dogs, contexts and notes:

```js
{
  schemaVersion: 1,
  dogs:     [{ id: "charlie", name: "Charlie" }],
  contexts: [{ id: "home", name: "Home" }],
  active:   null | { dogId, contextId, startedAt },
  sessions: [{ id, dogId, contextId, startedAt, endedAt, durationSec, result: "good" | "bad" }]
}
```

Adding "Car" later is adding a row to `contexts` plus a picker. Adding notes is one
more field on a session. Suggested next duration becomes a pure function over `sessions`.
None of that UI is built now.

## Screen flow (one screen, three states)

1. **Ready** – "Charlie · Home", one big *Start training* button, then the graph and history.
2. **Training** – huge timer, *End training* button.
3. **How did it go?** – *Went well* / *Didn't go well* (plus a quiet *Discard* for accidental starts).
   Saving returns to Ready.

## Steps
1. Plan (this file) ✔
2. Data + logic modules with unit tests
3. Screen, styles, graph
4. Installable/offline bits (manifest, icon, service worker)
5. End-to-end test in a phone-sized browser, screenshots
6. GitHub Pages deploy workflow + instructions for getting it onto the phone
