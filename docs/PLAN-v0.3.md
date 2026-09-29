# Version 0.3 – implementation plan

> **Note (v0.4):** the suggestion rules in this file are replaced by [SUGGESTION-MODEL.md](SUGGESTION-MODEL.md). Kept for history.

Implements the six "future" items listed after v0.2. Incremental: same look, same flow.

## 1. Edit or delete a saved session
- Tap a row in *Previous sessions* → a sheet opens (`<dialog>`) with:
  place, result (Went well / Didn't go well), actual duration (min + s), target (min + s, empty = none).
- **Save** / **Cancel**. **Delete session** needs a second tap ("Tap again to delete").
- Logic: `updateSession()` and `deleteSession()` in `src/training.js` (validated, pure).

## 2. Backup / export
New card at the bottom: **Your data**.
- **Save backup** – a `.json` file with everything. On iPhone this opens the share sheet
  (save to Files, AirDrop, mail…). On a computer it downloads.
- **Export for Excel** – a `.csv` file, one row per session (semicolon separated, opens directly in Excel).
- **Restore from backup** – choose a backup file. It is **merged**: sessions already on the phone
  are kept, sessions only in the file are added. Nothing is ever removed by a restore.
  Before merging, the current data is copied to `alone-training:before-restore-<time>`.
- Shows "Last backup: …" (or "never") as a gentle reminder. No notifications.
- Logic: `src/backup.js` (pure: build export, parse/validate a file, merge, CSV).

## 3. Suggestion looks a little further back (2 good in a row after a setback)
Rules, in order, for the most recent session in the chosen place:

| Situation | Suggestion | Shown as |
|---|---|---|
| Went well, but ended before 90 % of its target | the **same target** again | "ended before target · same target" |
| Went well, and the session before it didn't go well | **repeat** the same duration | "first good after a setback · same again" |
| Went well otherwise | **+10 %** | "+10%" |
| Didn't go well | **−10 %** | "−10%" |

So after a setback the time only grows again after two good sessions in a row.
Rounding and guard rails are unchanged from v0.2. The **+10 %** option is always one tap away
as a chip, so the user can still move faster.
To go back to the pure v0.2 rule, set `CONSOLIDATE_AFTER_SETBACK = false` in `src/progression.js`.

## 4. Short "went well" sessions ended for other reasons
Covered by rule 1 above (a session that ended well before its target doesn't push the next
target up or down) and by being able to edit or delete a session.

## 5. Long history
Show the latest 10 sessions, then a **Show all (N)** button.

## 6. Graph shows latest 30
Unchanged, but a caption says "Showing the latest 30 of 42 sessions" when some are hidden.
The full list is in the history and in the Excel export.

## Data
No schema change needed; still `schemaVersion: 2`, key `alone-training:v2`.
Only a new optional field `lastBackupAt`.

## Tests
Unit: new rules, edit/delete, backup parse/merge/CSV. E2E: edit, delete, show all, caption,
backup download + restore round-trip, plus all v0.1/v0.2 steps.
