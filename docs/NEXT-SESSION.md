# Next session

The five items from the previous brief are done (`c7904cb`). What remains is
below — one operational decision and two pieces of finishing work, none of which
blocks launch.

Read `docs/SCALING.md`, `docs/SCALE-LIMITS.md`, `docs/STUDENT-SCALE.md` and
`docs/BROWSER-PERF.md` before proposing performance work. Between them they
already rule out most of the obvious suggestions, with measurements and with the
reasoning for each rejection.

## 1. There is still no error tracking

No Sentry or equivalent; five `console.error` sites in the whole app. Errors
reach Vercel logs and nobody is alerted, so at 40 staff a failure at 9pm is
invisible until someone complains.

The Vercel MCP connector returns **403** for `get_runtime_errors` and
`get_runtime_logs`, so production errors cannot be read from a session either.
Re-authorising that connector with observability scope is free and worth doing
regardless of what else is decided.

This is a product decision, not a code change, which is why it is still here.

## 2. Finish the positional-write hardening

`rowOf(tab, idColumn, id)` in `src/lib/sheets.ts` reads a single id column
immediately before a positional write, shrinking the mis-target window from
~7 s to one round trip. It is applied to the four worst sites: both PIN writes
(`setStaffPin`, `setStudentPin`) and both void paths (`voidCharge`,
`voidPayment`).

Roughly 23 snapshot-based `findIndex` sites remain. They fall into three
classes, worst first:

- **Whole-row overwrites including the primary key** — Attendance, Staff,
  Students, Batches, Timetable, Courses, Chapters, StaffTasks, PTM,
  BatchProgress. A mis-target replaces another record with a copy of this one.
  The result is internally consistent, so nothing can detect it afterwards.
- **Single-cell updates** — flip a flag on the wrong row.
- **`deleteRows` by index** — removes a different record outright.
  `deleteRows` should take ids rather than row numbers.

`rowOf` narrows the race; it does not close it. Sheets has no compare-and-swap
(verified against the v4 discovery document), so a sort landing inside that
round trip still mis-targets. The nightly integrity scan is the backstop.

Consider also making Attendance and StaffAttendance **append-only** — every read
already resolves `(session, student)` to the newest row, and `submitMarks`
already skips unchanged marks, so the in-place update branch could go entirely.
That removes the whole-row overwrite from the largest and most-sorted tab.

## 3. Two counters remain, deliberately

Attendance `log_id` (`A####`) and `SAT####` are still max-suffix+1. Both are
tiebreaks between rows sharing a natural key, not lookup keys, and every read
path dedupes on that key by newest timestamp.

Known and accepted: two concurrent submits compute the same `log_id`, so the
tiebreak resolves to sheet order rather than last-write-wins. `A9999` -> `A10000`
also changes width, and production passes 9,999 attendance rows in roughly a
month at current volume. Neither loses data. `nextId([], "A")` is the one-line
fix if the inconsistency ever matters.

## What was measured, so it is not re-litigated

- **Reads and writes have separate 60/min/user quotas.** A batch counts as one
  request, so one register submit is one write whatever the class size.
- **A page render is not one read.** A marking cycle is four requests, so four
  quota units. React `cache()` dedupes within a request, never across.
- **The cross-request cache is what makes 500 users work.** Without it, 40 staff
  plus 500 parents over five minutes had 88 staff reads and 227 parent reads
  rejected; with it, 660/660 succeed at a p50 of 7 ms.
- **The 2 MB payload line is a recommendation.** Measured clean to 8.76 MB with
  zero 503s; latency turns erratic past ~3.9 MB.
- **220 marked days per year**, measured from 62 marked days across a 103-day
  span. With a full year retained the erratic zone starts near 100 students, not
  300 — retention is the lever, and `SCALING.md` has the plan.
- **Quota follows the service account, not the spreadsheet.** A Sheet per centre
  buys no headroom; a second centre needs its own service account.

## Measurement traps, each of which produced a wrong answer first

- **`responseStart` reports ~30 ms when the real wait is ~660 ms.** Next streams
  the shell before the data. Measure full document fetch.
- **`performance.memory` is quantized** — a flat 9.5 MB regardless of the real
  heap. Use `Runtime.getHeapUsage` after `HeapProfiler.collectGarbage`.
- **Any quota test without a cooldown measures the previous test.** Wait 75 s
  between bursts.
- **axe scans mid-animation.** `Reveal` fades opacity after `networkidle`, so
  contrast gets measured against a partially transparent colour — a real 5.73:1
  was reported as 2.55:1 on five pages. `e2e/a11y.spec.ts` now waits for
  animations; check that before believing a contrast failure.
- **A direct-API write is invisible to the running app for one cache TTL.** The
  MCQ cleanup hit this. Anything that writes outside the app must wait it out.
- **Kill stray dev servers before running E2E.** `reuseExistingServer` attaches
  to whatever is on port 3000, and if that server was started with the
  production `SHEET_ID` the suite writes to production. This happened in this
  session and left one attempt row in the live Sheet.

Anything that **writes** must target `E2E_SHEET_ID`, never `SHEET_ID` — the
latter is the production Sheet. `playwright.config.ts` has the fail-closed
guard; it only protects the server Playwright starts itself.

## Current state

182 unit tests, 111/111 E2E, typecheck and lint clean.
