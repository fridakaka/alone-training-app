# Version 0.2 – implementation plan

> **Note (v0.4):** the suggestion rules in this file are replaced by [SUGGESTION-MODEL.md](SUGGESTION-MODEL.md). Kept for history.

Incremental on top of v0.1. Same files, same look, same one-screen flow.
Nothing is redesigned; the pieces below are added around what exists.

## What I found in v0.1
- `src/training.js` – pure rules (start/end/rate, formatting). Sessions already carry `contextId`.
- `src/store.js` – saves everything as one JSON blob under the localStorage key `alone-training:v1`,
  `schemaVersion: 1`. If the version is not 1 it falls back to an empty state.
- `src/chart.js` – SVG bars, solid = went well, striped = didn't.
- `src/app.js` – wires buttons; uses the first dog and first context.
- Tests: 16 unit tests (`node:test`) + a phone-sized Playwright click-through.

## 1. Contexts: Home, Car, Outside shop
- Three contexts in state: `home`, `car`, `outside-shop`.
- A **segmented control** (three buttons in one row) above the Start button.
  The last chosen context is remembered, so the usual flow is still **one tap on Start**
  (or two taps when switching place).
- The **same selection also filters the progress graph and history.** One control, not two:
  when you're looking at Car you see Car's suggestion, Car's graph and Car's history.
- Hidden during a running session (the context can't change mid-session).

## 2. Suggested next duration – `src/progression.js` (new, pure functions)
Based on the **actual duration** of the **most recent completed session in that context**
(not the target – what Charlie actually managed is what counts).

| Last result | Raw suggestion |
|---|---|
| Went well | actual × 1.10 |
| Didn't go well | actual × 0.90 |

**Rounding** – round the raw value to the nearest step for its size:

| Raw suggestion | Rounded to nearest |
|---|---|
| under 1 min | 5 s |
| 1 – 5 min | 15 s |
| 5 – 15 min | 30 s |
| 15 – 60 min | 1 min |
| 1 h or more | 5 min |

**Guard rails**
- After *Went well* the suggestion is always at least one step **longer** than the last
  session (rounded). Otherwise a 10 s session would round back to 10 s and never grow.
- After *Didn't go well* it is always at least one step **shorter**.
- Never below 5 s.
- No sessions yet in a context → no suggestion ("No target").

## 3. Target is a suggestion only
- Ready screen shows `Suggested today: 4:30` with **−** and **+** buttons (one step each,
  same step sizes as above) and two quiet chips:
  - **Repeat 4:00** – only after a *Went well* session: the last duration rounded, to consolidate.
  - **No target** – start without a target.
- If changed, the label switches to `Your target` with a *Use suggestion* chip to go back.
- **Start training** starts with whatever is shown. The timer is untouched: it counts up until
  *End training*. While training, a small line shows `Target 4:30`, which becomes
  `Target 4:30 reached` – nothing else happens (no sound, no auto-stop).

## 4. Target vs actual
Each saved session gets `targetSec` (number or `null`) next to the existing
`durationSec` (actual). Shown:
- result screen: `4 min 42 s · target 4:30`
- history rows: small muted `target 4:30` under the actual duration
- graph: a thin horizontal tick over each bar at the target height (legend: "Target")

## 5. Migration of v0.1 data (important – real data exists)
- v0.2 saves under a **new key** `alone-training:v2`, `schemaVersion: 2`.
- On first launch of v0.2: if there is no v2 data, read `alone-training:v1`, copy every
  session, set `contextId: "home"` where missing, `targetSec: null`, and keep any running or
  unrated session.
- **The v1 key is never modified or deleted.** It stays as a backup, and if an old cached
  v0.1 copy of the app were ever to load, it still finds its own data intact.
- Corrupt v2 data is copied aside (`alone-training:corrupt-<time>`) before falling back
  to v1, so nothing is silently overwritten.

## 6. Files touched
- `src/progression.js` (new): suggestion, rounding, steps, repeat value
- `src/training.js`: contexts, `targetSec` on start/end/record, selected context
- `src/store.js`: v2 key + migration
- `src/chart.js`: target ticks, target in bar details
- `src/app.js`, `index.html`, `styles.css`: selector, target controls, history text
- `sw.js`: new cache name + new file
- tests: new `progression.test.js`, migration tests, expanded e2e

## Not doing (scope)
Accounts, sync, AI, notifications, multiple dogs, advice, scoring, editing past sessions.
