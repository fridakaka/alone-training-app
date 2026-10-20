# Time suggestion model (v0.11)

Code: `src/suggestion.js` (pure, deterministic, reference time `now` injected).
Tests: `tests/unit/suggestion.test.js` and `tests/unit/explain.test.js`.

The app is mainly a **timer and training journal**. The time suggestion is a cautious starting
point that can always be changed or ignored. It is **not** medical or behavioural advice, not a
validated training method, and not a statement of what a dog can manage. All numbers are
**preliminary, adjustable product rules**, collected in `SUGGESTION_SETTINGS`.

## What changed in v0.11 (and why)

Reported from real use: advancing was too slow, a good session that was ended early for other
reasons *lowered* the next suggestion, and after one hard session it took as long to get back as
it took to get there the first time. v0.10 looked only at the 5 newest sessions of the last 7 days
and required support on two different days – with many short sessions per day that window lost the
level after a few sessions.

v0.11 instead carries a **current level** forward, session by session, in each place (since the
latest break of 7 days):

| Event | What happens |
|---|---|
| Good session at the suggestion (≥ 95 %) | Counts as a confirmation. **Two confirmations → +10 %** (rounded down), also on the same day |
| Good session that ended earlier | **Neutral** – never lowers the suggestion ("The latest session was shorter – that doesn't lower the suggestion.") |
| **Three** good sessions in a row that ended earlier | The level follows them (the longest time at least two of them support), so an old level isn't kept forever |
| Two good sessions longer than the level | The level moves to the time they both support, directly |
| Session that didn't go well | Lower: 80 % of the worry time (if entered, always below it), else 80 % of a clearly shorter time that went well, else **no automatic time** until 2 good sessions have followed. Worry within 10 s → no automatic time |
| Good sessions after a setback | **Back to the level from before** in at most **3 steps** (each confirmed session one third of the way, never more than doubling in one step) – then normal +10 % steps |
| 7 days without sessions | Start over, no automatic time. The earlier stable level is shown as history only |

The rules that protect against extreme values are kept: one single session never sets a level
(it only anchors its *planned* time), one long session can't make the suggestion jump, the
end time of a hard session is never treated as tolerated, and the earlier stable level is never a
target, a share of one or a floor.

## Earlier stable level (history only)

The longest time that ≥ 2 good sessions on ≥ 2 different days (within 7 days of each other)
supported, **before** the last 7 days. Shown below today's target as history. Never a target,
never a share of a target, never a hidden floor.

## Relevant sessions

- *Didn't go well*: always relevant, however short.
- *Went well*: always relevant, also 1–2 s, unless the user marked it **"don't count as progress"**.
  Mis-taps are handled by the user (discard, edit, delete, "don't count") – not by a length filter.

## Explanation texts name the actual reason (v0.9, extended in v0.11)

`suggestTarget` also returns `hard`: `latest` when the latest session itself didn't go well (rule 3), or
`recent` when an earlier hard session in the window still limits the suggestion because fewer than 2 good
sessions have followed it (end of rule 4). The text follows that cause (`src/explain.js`):

| Cause | Example (English / Swedish) |
|---|---|
| `latest`, worry time known | "The latest session didn't go well — the suggestion is below the time when worry started." / "Senaste passet gick inte bra – förslaget ligger under tiden då oron började." |
| `recent`, shorter time | "A recent hard session makes the suggestion shorter." / "Ett nyligt svårt pass gör att förslaget är kortare." |
| `recent`, no basis | "A recent hard session still limits the suggestion — choose a short, easy time." / "Ett nyligt svårt pass begränsar fortfarande förslaget – välj en kort, lätt tid." |
| `recent`, worry from the start | "A recent session with worry from the start still limits the suggestion. …" / "Ett nyligt pass med oro från början begränsar fortfarande förslaget. …" |
| On the way back (v0.11) | "On the way back after a recent hard session — step 1 of 3 towards 1:00." / "På väg tillbaka efter ett nyligt svårt pass – steg 1 av 3 mot 1:00." |
| Ended earlier (v0.11) | "The latest session was shorter – that doesn't lower the suggestion." / "Senaste passet blev kortare – det sänker inte förslaget." |

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
| 4 | 5 min, then 2 h, same day | level 5:00 → **5:30**; 2 h not offered as Repeat |
| 5 | 4 × 5 min on different days + 1 × 2 h | **5:30** (level 5:00) |
| 6 | after the break: 10 s, then 5 min on two days | level **5:00** directly → 5:30 |
| 7 | 1 min, 1 min, then 20 min | **1:05**; 20 min not offered (one long session supports nothing more) |
| 8 | 3 × 5 min, then hard (unknown) | no time; with worry at 200 s → 2:30 |
| 9 | 10 min, 10 min, then 1 h hard with worry at 30 s | **0:24** |
| 10 | 20 min × 2, hard (worry 10 min), then 3 s × 2 | **8:00** – below the worry time; very short sessions neither lower nor lift it |
| 11 | good 1 s and 2 s on two days | level 1 s → 0:01 |
| 12 | "don't count" 1 h session | ignored; 5 min level stays |
| 13 | edit/delete | recalculated from the journal |
| 14 | other place | never used |
| 15 | backup/restore | all fields kept (incl. worry time, "don't count") |
| 16 | timer | survives reload; planned and actual time saved |
| 17 | reported: built up to ~1:30 in one day, then good 1:05 (ended early) | **same suggestion as before** |
| 18 | reported: level 1:00, hard at 1:00 (unknown worry), then 20, 20, 22, 30, 60 s | none → 0:20 → 0:30 → 0:45 → **1:00** (back in 3 steps) |
| 19 | level 11:00, worry at 4:00, then following the suggestions | 3:00 → 5:30 → 8:00 → **11:00** → 11:00 → 12:00 |
| 20 | three good sessions in a row far below the suggestion | the suggestion follows them |

## What the app cannot know

- Only logged sessions exist for the app. "No sessions logged" ≠ "the dog hasn't been alone".
- It does not know *why* a session went well or not, or why a break happened.
- The worry time is the user's rough estimate.
- Preliminary parameters to review with real use: 7 days / 5 sessions, 0.8 recency, "2 sessions on
  2 days", 90 % support tolerance, +10 % raise (+20 % step cap), 80 % below worry, 10 s "from the start",
  2 good sessions to lift a hard-session limit, 1.5 × Repeat limit, "a single session only anchors its plan".
