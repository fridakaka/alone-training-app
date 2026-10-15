# Time suggestion model (v0.5.1)

Code: `src/suggestion.js` (pure, deterministic, reference time `now` injected).
Tests: `tests/unit/suggestion.test.js` (regression cases 1–16 below).

The app is mainly a **timer and training journal**. The time suggestion is a cautious starting
point that can always be changed or ignored. It is **not** medical or behavioural advice, not a
validated training method, and not a statement of what a dog can manage. All numbers are
**preliminary, adjustable product rules**, collected in `SUGGESTION_SETTINGS`.

## Two separate ideas

| | What it is | Used for |
|---|---|---|
| **Current basis** | Relevant sessions in the same place from the last **7 days**, at most the **5 newest** | Today's suggestion – nothing else decides it |
| **Earlier stable level** | The longest time that ≥ 2 good sessions on ≥ 2 different days (within 7 days of each other) supported, **before** the current window | Shown as history only ("Earlier stable level: … (history, not today's target)"). Never a target, never a share of a target, never a hidden floor |

The window size (7 days / 5 sessions) is an adjustable product choice, not a biological limit.

## Relevant sessions

- *Didn't go well*: always relevant, however short.
- *Went well*: always relevant, also 1–2 s, unless the user marked it **"don't count as progress"**.
  Mis-taps are handled by the user (discard, edit, delete, "don't count") – not by a length filter.
- Recency weights: newest 1, then × 0.8 per step back; sessions on the same calendar day share that day's weight.

## Decision (current basis only)

1. **Nothing logged in this place** → no time. "No sessions logged here yet — choose a short, easy time."
2. **Nothing relevant in the last 7 days** (break) → no time.
   "It's been a while. Choose a short time that feels easy today." The earlier stable level is shown as history.
   (If sessions exist but are all marked "don't count": "Too little usable recent history …")
3. **Latest session didn't go well, nothing good since** →
   - worry time known: **80 % of the worry time**, rounded down (always below it);
     worry within **10 s** → **no positive time**: "Worry from the start in the latest session. Choose an easier step before the next absence."
   - worry time unknown: the end time is **not** treated as tolerated. If the current window has earlier good
     sessions **clearly shorter** (< 90 %) than the hard one: 80 % of their *supported* time. Otherwise no time.
     "The latest session didn't go well — the suggestion is below the time when worry started." /
     "The latest session didn't go well, so the suggestion is shorter." / "… choose a short, easy time."
4. **Good sessions since the latest hard session** (or no hard session in the window). Only these count:
   - **Established current level** = the longest time D that ≥ 2 good sessions reached (≥ 90 % of D) on
     **≥ 2 different days**, with recency weight ≥ 1.0.
     - latest session went well at ≥ 90 % of it → **small increase: +10 %, rounded down**
       ("This time went well on different days and the latest session confirmed it — small increase.")
     - otherwise → the level ("This time went well on different days, but the latest session was shorter — same time again.")
   - **Limited basis** (no established level) → **anchor**: the longest time supported by **≥ 2** good
     sessions (any days). A **single** good session is confirmed by nothing else, so on its own it can
     only anchor its **planned** time (the smaller of plan and actual). Without a plan: **no automatic
     target** – the session is kept and counts as soon as another session supports it.
     "Limited basis — repeat 0:10." / "Limited basis — choose a short time. One session counts once more sessions confirm it."
   - While fewer than **2** good sessions have followed a hard session, rule 3 still applies:
     a numeric limit caps the result; **"no time" (worry from the start, or no shorter basis) is also a
     limit** and keeps the suggestion empty until 2 good sessions have followed.

## Explanation texts name the actual reason (v0.9)

`suggestTarget` also returns `hard`: `latest` when the latest session itself didn't go well (rule 3), or
`recent` when an earlier hard session in the window still limits the suggestion because fewer than 2 good
sessions have followed it (end of rule 4). The text follows that cause (`src/explain.js`):

| Cause | Example (English / Swedish) |
|---|---|
| `latest`, worry time known | "The latest session didn't go well — the suggestion is below the time when worry started." / "Senaste passet gick inte bra – förslaget ligger under tiden då oron började." |
| `recent`, shorter time | "A recent hard session makes the suggestion shorter." / "Ett nyligt svårt pass gör att förslaget är kortare." |
| `recent`, no basis | "A recent hard session still limits the suggestion — choose a short, easy time." / "Ett nyligt svårt pass begränsar fortfarande förslaget – välj en kort, lätt tid." |
| `recent`, worry from the start | "A recent session with worry from the start still limits the suggestion. …" / "Ett nyligt pass med oro från början begränsar fortfarande förslaget. …" |

"Latest" is never used when the latest session went well (tested in both languages). No suggestion →
the label reads "No automatic target today". When the user sets their own target, the label reads
"Your own target" and the line below starts with "The app's suggestion today: 5:00." followed by the reason.

## Longest session that went well (history only)

Shown below today's target: the longest session in this place marked *Went well* (not marked
"don't count"), with its date. It is **one single session** – not the earlier stable level (which needs
several sessions on different days), never a target, never a floor, and it is not an input to
`suggestTarget` at all (computed separately in `src/explain.js`; tests check that adding or hiding a
long record never changes the suggestion). No such session → no line.

## Extreme values (applies to every path)

- A time only counts when **more than one** session supports it (anchor, level, earlier level). A single
  session can only anchor its planned time; unplanned, it sets no target. So 5 min + 2 h the same day →
  **5:00**, and one unplanned 2 h session → **no target**.
- No medians or means that can pick the newest extreme value.
- **Repeat** (latest good time) is offered only next to an actual suggestion, after a session that went well,
  never after a hard session or a break, and never above 1.5 × the suggestion.
- The logged actual time is always stored unchanged. Limits apply to the calculation only.

## Faster return can be followed, not assumed

- The app's own increases from a confirmed current level stay at about **+10 %**.
- The user can always choose a longer time (− / +, or type a time).
- A longer good session is a positive observation, not a new level by itself.
- When **≥ 2 current good sessions on different days** support a longer time, the current level moves
  **directly** to that time – even if it was far above the previous suggestion (no 10 → 11 → 12 s ladder).
- The earlier stable level gives **no** multiplier or shortcut.
- A later hard session is checked first and cannot be outweighed by earlier good sessions.

## Recovery after a hard session

Only good sessions **after** the latest hard session count. Two very short good sessions support that
short time and lift the cap – they never restore an older, longer level ("recovered" does not mean "back to before").

## Rounding

Suggestions are rounded **down**: < 30 s: 1 s · < 2 min: 5 s · < 5 min: 15 s · < 15 min: 30 s · < 1 h: 1 min · above: 5 min.
If rounding leaves no increase, one grid step is allowed only when it is ≤ +20 %
(1 s → 1 s, 5 s → 6 s, 10 s → 11 s, 30 s → 35 s, 60 s → 65 s).
Manual − / + steps: 1 s below 10 s, then 5 s / 15 s / 30 s / 1 min / 5 min. Manual targets from **1 s**.
From "No target", **+** opens time entry instead of guessing a time. Tapping the time also opens it.

## Regression cases (tests)

| # | History | Result |
|---|---|---|
| 1 | 3 × 2 h good, 16–14 days ago | no time (break); earlier stable level 2:00:00 shown as history |
| 2 | same + new good 10 s, planned 10 s | **0:10** – "Limited basis — repeat 0:10." (unplanned: no target) |
| 2b | same + worry at 0 s + one good 2 h, no plan | no target, no Repeat (limit stays until 2 good sessions) |
| 2c | same + one good 2 h, no plan | no target, no Repeat; with a 10 s plan → 0:10 |
| 2d | hard (unknown worry) + one good 2 h | no target, no Repeat |
| 3 | same + worry at 0 s | no time – "Worry from the start…" |
| 4 | 5 min, then 2 h, same day | **5:00**; Repeat not offered |
| 5 | 4 × 5 min on different days + 1 × 2 h | **5:30** (level 5:00) |
| 6 | after the break: 10 s, then 5 min on two days | level **5:00** directly → 5:30 |
| 7 | 1 min, 1 min, then 20 min | level 1:00 → 1:05; 20 min not offered |
| 8 | 3 × 5 min, then hard (unknown) | no time; with worry at 200 s → 2:30 |
| 9 | 10 min, 10 min, then 1 h hard with worry at 30 s | **0:24** |
| 10 | 20 min × 2, hard (worry 10 min), then 3 s × 2 on two days | **0:03** (old level not restored) |
| 11 | good 1 s and 2 s on two days | level 1 s → 0:01 |
| 12 | "don't count" 1 h session | ignored; 5 min level stays |
| 13 | edit/delete | recalculated from the journal |
| 14 | other place | never used |
| 15 | backup/restore | all fields kept (incl. worry time, "don't count") |
| 16 | timer | survives reload; planned and actual time saved |

## What the app cannot know

- Only logged sessions exist for the app. "No sessions logged" ≠ "the dog hasn't been alone".
- It does not know *why* a session went well or not, or why a break happened.
- The worry time is the user's rough estimate.
- Preliminary parameters to review with real use: 7 days / 5 sessions, 0.8 recency, "2 sessions on
  2 days", 90 % support tolerance, +10 % raise (+20 % step cap), 80 % below worry, 10 s "from the start",
  2 good sessions to lift a hard-session limit, 1.5 × Repeat limit, "a single session only anchors its plan".
