# Next session

Nothing is queued. The two performance questions are both answered and
committed:

- `docs/SCALING.md` — server side. What binds first, the load cliff, concurrency
  safety, the data ceiling.
- `docs/BROWSER-PERF.md` — browser side. Core Web Vitals, bundle, real INP,
  memory. Verdict: fine, nothing to fix.
- `docs/SCALE-LIMITS.md` — writes, multi-tenancy, the 503 that isn't, and
  `nextId()`. The one open item is there: `nextId()` collides 100% of the time
  under any concurrency.
- `docs/STUDENT-SCALE.md` — the 100-200 student target. Reads and payload clear
  it; test submission does not, because of `nextId()`.

Read both before proposing performance work. Between them they already rule out
most of the obvious suggestions, with measurements and with the reasoning for
each rejection.

## Do not re-measure

Both documents label every number measured or derived. The findings that most
often get re-litigated:

- The 28 s pages under load were **request queueing**, not Sheets and not retry
  backoff. A circuit breaker was considered and explicitly rejected.
- `recharts` does **not** load on pages without a chart. Code splitting works.
- `framer-motion` never reaches the portal at all.
- The heap growth across navigations is a **bounded router cache**, not a leak.
- Fonts (138 KB) cost more on the wire than either heavy dependency, and are
  still worth keeping.
- Reads and writes have **separate** 60/min/user quotas, and one register submit
  is **one** write regardless of class size. 40 simultaneous submits run clean.
- The 2 MB payload line is a recommendation: **measured clean to 8.76 MB, zero
  503s**. Latency variance past ~3.9 MB is the real effect.
- Quota follows the **service account, not the spreadsheet** — a Sheet per centre
  buys no headroom.

## Two measurement traps, both of which produced wrong numbers

Recorded because they are not obvious and cost real time:

- **`responseStart` reports ~30 ms when the real wait is ~660 ms.** Next streams
  the shell before the data. Measure full document fetch instead.
- **`performance.memory` is quantized** — it reports a flat 9.5 MB regardless of
  the real heap. Use `Runtime.getHeapUsage` after `HeapProfiler.collectGarbage`.
- **Any quota test without a cooldown measures the previous test.** Wait 75 s
  between bursts. Skipping this produced a confident, wrong finding that
  `withRetry` amplifies failures; with a clean window the same burst was 80/80.

Anything that **writes** must target `E2E_SHEET_ID`, never `SHEET_ID` — the
latter is the production Sheet. `playwright.config.ts` has the fail-closed guard
worth copying.

Also: measure against a production build (`next build` + `next start`), never
`next dev`. And when driving the register, the attendance toggles are
`button[type="button"][aria-pressed]` — `button:visible` matches the submit
button first and navigates away.

## If a session is needed anyway

The one thing worth revisiting on a schedule, from `SCALING.md`:

**Before ~150 students**, payload approaches Google's 2 MB recommendation.
The fix is retention — stop reading all of Attendance on every render — not
re-architecture. `/dashboard` HTML (330 KB today) is the browser-side symptom of
the same growth and is the page to re-measure as history accumulates.
