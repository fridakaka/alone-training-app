# Time suggestion model (v0.4)

Code: `src/suggestion.js` (pure, deterministic, `now` injected). Tests: `tests/unit/suggestion.test.js`.

The app is a **training journal**. The time suggestion ("tidsförslag") is a starting point the
user can always change or ignore. It is **not** an estimate of how long a dog can safely be
alone, and it does not replace an individual training plan. All numbers below are
**preliminary product rules**, collected in `SUGGESTION_SETTINGS`, not validated training advice.

## Data used

Per session (all stored already, nothing computed is stored):

| Field | Meaning |
|---|---|
| `contextId` | Home / Car / Outside shop – each is calculated **separately**, nothing is borrowed between them |
| `startedAt` | when it started (used for the 7-day window and "different days") |
| `durationSec` | **actual** time (not the target) |
| `targetSec` | planned time – shown, but never used as a cap or as evidence |
| `result` | went well / didn't go well (always the user's answer; reaching the target never sets it) |
| `anxietyOnsetSec` | *new, optional*: roughly when worry started. Missing/`null` = **unknown**, never 0 |
| `uncertain` | *new, optional*: "don't count as progress" (only for went well) |

Older sessions and backups without the new fields keep working (unknown / counted).
The suggestion is always re-derived from history, so editing, deleting and restoring
automatically give a correct new suggestion, and changing the algorithm never rewrites history.

## Step by step

1. **Relevant sessions** in the chosen context:
   - *Didn't go well*: always relevant, however short.
   - *Went well*: relevant unless marked "don't count", or shorter than 3 s (mis-tap).
2. **Window**: relevant sessions from the last **7 days**, at most the **5 newest**.
3. **Weights**: newest weight 1, then ×0.8 per step back (1, 0.8, 0.64 …). Sessions on the same
   calendar day **share** that day's weight (5 sessions in one day ≠ 5 days of training).
4. **Decision**, first match wins:

| # | Situation | Suggestion | Explanation shown |
|---|---|---|---|
| a | Nothing logged in this context | none – user chooses | "No sessions logged here yet — choose an easy starting time." |
| b | Nothing relevant in the last 7 days (break) | 50 % of the level **established before the break**; if there was none, or the break followed a hard session: user chooses | "Careful return after a break — confirm with easier sessions." / "Break since the last logged session — choose an easy starting time." |
| c | The latest *didn't go well* in the window is still **in force** (see below) | worry time known: **80 % of it** (always below it). Worry within 10 s: **no time** (not built from older successes). Unknown: 80 % of the weighted median of earlier good sessions **clearly shorter** (< 90 %) than the hard one; if none: user chooses | "Shorter after the last session." / "Worry started right away last time — choose a very easy start." / "The last session was hard — choose an easy starting time." |
| d | Fewer than 2 relevant sessions in the window | as (b) if there is older history, else user chooses | "Too little recent history — choose an easy starting time." |
| e | A level is **established** and the latest session went well at ≥ 90 % of it | **small raise**: +10 % of the level, rounded **down** | "Several calm sessions at a similar time." |
| f | A level is established, latest session didn't confirm it | the level | "Keep this time until it feels stable." |
| g | No level established yet (e.g. all on one day) | weighted median of good times, rounded down | "Keep this time until it feels stable." |

**Established level** = the longest time D such that "went well" sessions of at least 90 % of D
occurred **at least 2 times, on at least 2 different days**, with recency weight ≥ 1.0.
Only sessions **after** the most recent hard session count.

**A hard session stays in force** until **2** good sessions have followed it, each at least
50 % of the easier suggestion (so a couple of 10-second repeats don't cancel a real difficulty).

## How long good sessions count – without becoming the new base

A long good session is **support** for every level up to 111 % of its length, but one session
can never establish a level on its own (needs ≥ 2 sessions on ≥ 2 days). Example: four good
5-min sessions + one good 2-hour session → level 5:00, suggestion 5:30. Not 28 min (the mean), not 2 h.
Raises are capped at +10 % of the *level*, whatever the latest session was.
The actual time counts even when it was longer than planned.

## How hard sessions and breaks override old successes

- The latest hard session is checked **before** any level, so older good sessions cannot hide it.
- The level is only calculated from sessions **after** the latest hard session.
- A known worry time is used instead of the end time: 10 min with worry after 30 s → 0:24.
- After 7 days without sessions, older history is kept and shown, but not used as current
  ability. No invented "loss per rest day": a fixed cautious restart, or the user chooses.

## Rounding

Suggestions are rounded **down** on a grid that is finer at short times:
< 30 s: 1 s · < 2 min: 5 s · < 5 min: 15 s · < 15 min: 30 s · < 1 h: 1 min · above: 5 min.
If rounding down leaves no increase, one grid step is allowed only if it is ≤ +20 %
(e.g. 5 s → 6 s, 10 s → 11 s, 30 s → 35 s); otherwise the level is repeated.
The − / + buttons keep their coarser steps (5 s / 15 s / 30 s / 1 min / 5 min).

## Buttons next to the suggestion

- **Repeat** (last good time): only when the latest relevant session went well, not after a
  hard session or a break, and not more than 1.5× the suggestion (an extreme session is not offered).
- **Use suggestion**, **No target**, **− / +**: unchanged.

## What the app cannot know

- Only logged sessions exist for the app. "No sessions logged" is not the same as
  "the dog hasn't been alone".
- It can't tell *why* a session went well or badly, or whether the result was logged correctly
  (the user can edit, delete or mark "don't count").
- The worry time is the user's rough estimate.
- Preliminary parameters worth revisiting with real use: window (7 days / 5 sessions), recency
  decay 0.8, "2 sessions on 2 days", +10 % raise, 80 % below worry, 10 s "right away",
  2 recovery sessions, 50 % return after a break, 1.5× limit for Repeat.
