# Next session — open items

Five things are open, ranked. Items 1-3 are small and two of them are
correctness bugs. Item 5 is a product decision, not a code change.

Read `docs/SCALING.md`, `docs/SCALE-LIMITS.md`, `docs/STUDENT-SCALE.md` and
`docs/BROWSER-PERF.md` before proposing performance work — between them they
already rule out most of the obvious suggestions, with measurements and with the
reasoning for each rejection.

## 1. Recurring session ids should be deterministic, not minted

**This is a regression introduced by the fix in `c1a93f7`, and it is the
sharpest item here.**

`generateSessions` (`src/lib/data.ts`) used to mint session ids from a counter.
That had a ceiling bug (see `SCALE-LIMITS.md`) and was replaced with
`nextId([], "SES")`. But minting changed the failure mode of a double run:

- **Before:** two runs produced the *same* id → a duplicate, which
  `integrityIssues` flags.
- **Now:** two runs produce *two distinct sessions for one class* → never
  flagged, never removed, and both accumulate attendance.

The fix is a natural composite key for the recurring series only:
`session_id = ${slot_id}-${date}` (ad-hoc classes keep minted ids). A double run
then yields two identical rows, attendance attaches to both equally, and the
self-heal is "delete exact duplicates" — no judgement call about which one
already carries marks.

Cost: relax the `^[A-Z0-9]+$` assertion in `next-id.test.ts`. Nothing in the app
validates id format (`toCsv` only escapes formula-leading characters). Legacy
`SES####` rows stay valid. Bonus: an owner reading the Sheet can see which class
a row belongs to.

## 2. `submitTestAction` discards a failure and reports success

`src/lib/actions.ts` — `submitAttempt` returns `{ok:false, reason}` for
`not-found` / `not-available` / `already-done`, and the caller ignores the
return value, then redirects to the result page regardless.

A student whose enrollment ended mid-test (or whose test was unpublished) clicks
Submit, nothing is written, and they land on a page that re-renders a blank test
form. Their answers are gone and nothing said so.

Fix: branch on the result, redirect with `?error=<reason>`.

While in there: `submitAttempt` appends `Attempts` then `Answers` as two calls.
A failure between them leaves an Attempts row with a score and zero Answers,
which permanently locks the student out (the Attempts row gates re-entry) while
showing every answer blank. **Writing `Answers` first makes the sequence
crash-safe** — orphan Answers are invisible, and the Attempts row becomes the
commit marker. One line.

## 3. Twelve of eighteen id series have no duplicate detection

`integrityIssues` scans for duplicate ids on sessions, enrollments, students,
batches, staff and rooms — and runs only inside `getOwnerStats`, i.e. only when
an owner opens the dashboard.

Unscanned: `TT`, `TSK`, `SADJ`, `SPAY`, `FC`, `PMT`, `PTM`, `C`, `CH`, `TST`,
`QST`, `ATT`. The money series matter most: `voidCharge` and `voidPayment` find
by id and void the **first match**, so a duplicated charge cannot be fully
voided.

New writes can no longer collide (ids are minted), but the Sheet is
owner-editable — a copy-pasted row duplicates its id — and legacy rows predate
the fix.

Two changes, both cheap:
- Extend the scan to all eighteen series, plus natural-key duplicates
  (Sessions by slot+date, Attempts by test+student, FeeCharges by
  student+batch+period, StaffAttendance by staff+date).
- **Call it from `/api/cron/generate` and log the result.** It is pure over tabs
  that are already loaded. Today a corruption nobody's dashboard visit surfaces
  is never recorded at all.

## 4. Positional writes vs. a second writer

Every row index in the app is `findIndex` + 2 over a snapshot, then a write to
that index. Roughly 30 sites, in three classes:

- **Whole-row overwrites including the PK** (Attendance, Staff, Students,
  Batches, Timetable, Courses, Chapters, StaffTasks, PTM, BatchProgress) — a
  mis-target replaces some *other* record with a copy of the intended one. The
  written row is internally consistent, so nothing can detect it afterwards.
- **Single-cell updates** — flips a flag on the wrong record. Includes
  `Students!H` and `Staff!D`, which are **PIN writes**: a mis-target gives one
  person's PIN to another.
- **`deleteRows` by index** — deletes a different record outright.

Appends never shift rows. Sorting a tab, inserting above, and deleting above all
do — and the Sheet is deliberately owner-editable, so a human doing exactly that
is a supported workflow, not misuse.

The cross-request cache (`bdcce36`) widened this window from roughly one second
to roughly seven, and its invalidation is per-instance, so one instance can hold
a pre-delete layout briefly after another deletes rows. **That trade was made
deliberately** — the quota failure it fixed was certain and this is a race — but
it belongs here, not buried in that commit.

Fix: one `rowOf(tab, id)` helper that does an uncached read of the id column
immediately before computing the index, replacing the snapshot-based
`findIndex` sites; `deleteRows` should take ids rather than row numbers. That
shrinks the window to one round trip. It does **not** eliminate the race —
Sheets has no compare-and-swap — so document the residual.

Cost: one read unit per mutation. Mutations are tens per day against 60/min.

## 5. There is no error tracking

No Sentry or equivalent, five `console.error` sites in the whole app. Errors
reach Vercel logs and nobody is alerted. At 40 staff a failure at 9pm is
invisible until someone complains.

The Vercel MCP connector returns **403** for `get_runtime_errors` and
`get_runtime_logs`, so production errors cannot currently be read from here
either. Re-authorising that connector with observability scope is free and worth
doing regardless.

## Measurement traps, all of which produced a wrong answer first

- **`responseStart` reports ~30 ms when the real wait is ~660 ms.** Next streams
  the shell before the data. Measure full document fetch.
- **`performance.memory` is quantized** — a flat 9.5 MB regardless of the real
  heap. Use `Runtime.getHeapUsage` after `HeapProfiler.collectGarbage`.
- **Any quota test without a cooldown measures the previous test.** Wait 75 s
  between bursts. Skipping this produced a confident, wrong finding that
  `withRetry` amplifies failures; with a clean window the same burst was 80/80.
- **A page render is not one read.** A marking cycle is four requests, so four
  quota units. React `cache()` dedupes within a request, never across.
- **Measure against a production build** (`next build` + `next start`), never
  `next dev`, and start it with `--env-file=.env.local` or it silently serves
  no data.
- Driving the register: the attendance toggles are
  `button[type="button"][aria-pressed]`. `button:visible` matches the submit
  button first and navigates away.

Anything that **writes** must target `E2E_SHEET_ID`, never `SHEET_ID` — the
latter is the production Sheet. `playwright.config.ts` has the fail-closed guard
worth copying.

## Known-flaky

`/manage/students renders without a client error` times out under parallel load
against Sheets and passes in isolation in 5.5 s. Not a defect; the suite is
sensitive to Sheets latency.
