# Next session

Nothing is queued. The two performance questions are both answered and
committed:

- `docs/SCALING.md` — server side. What binds first, the load cliff, concurrency
  safety, the data ceiling.
- `docs/BROWSER-PERF.md` — browser side. Core Web Vitals, bundle, real INP,
  memory. Verdict: fine, nothing to fix.

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

## Two measurement traps, both of which produced wrong numbers

Recorded because they are not obvious and cost real time:

- **`responseStart` reports ~30 ms when the real wait is ~660 ms.** Next streams
  the shell before the data. Measure full document fetch instead.
- **`performance.memory` is quantized** — it reports a flat 9.5 MB regardless of
  the real heap. Use `Runtime.getHeapUsage` after `HeapProfiler.collectGarbage`.

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
