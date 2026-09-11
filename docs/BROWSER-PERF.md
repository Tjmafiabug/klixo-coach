# Browser performance

Measured 2026-09-11 against a local production build and the live deployment.
Numbers here are either **measured** or **derived** — each is labelled, because
the two should not be mixed when deciding anything.

Companion to `docs/SCALING.md`, which covers the server side. That document is
settled; nothing here re-measures it.

## Verdict

**This is fine. Nothing to fix.**

Every page is usable on a throttled cheap Android. CLS is 0.000 everywhere
measured. Interactions are instant. The bundle is not the constraint, and the
two dependencies suspected of being too expensive — `recharts` and
`framer-motion` — are both cheaper than the fonts, and neither reaches the
portal at all.

The remaining time is the Sheets read already documented in `SCALING.md`. There
is no browser-side fix for it.

## How this was measured

- **Local**: `next build` + `next start` on port **3001**. Never the dev server.
  `next dev` serves unminified, HMR-instrumented chunks; its numbers are not
  production numbers and are not reported here.
- **Production**: `https://coach.klixostudio.com`, region `bom1` (Mumbai —
  correct for Indian users).
- **Throttled** means 4× CPU slowdown + Slow 4G (150 ms latency, 400 Kbps),
  412×915 viewport at DPR 2.625.
- 3–5 runs per route, medians reported. Key numbers re-run independently.

Both servers ran simultaneously on different ports and were verified distinct
before any measurement (dev serves `[turbopack]`-prefixed chunks, prod serves
hashed ones).

## Production, throttled, warm

**Measured.**

| Route | LCP | CLS | Blocking | First-visit wire |
|---|---|---|---|---|
| `/portal` | 816 ms | 0.000 | 0 ms | 304 KB |
| `/portal/attendance` | 848 ms | 0.000 | 0 ms | 301 KB |
| `/timetable` | 1,252 ms | 0.000 | — | — |
| `/manage/students` | 1,332 ms | 0.000 | — | — |
| `/today` | 1,432–1,488 ms | 0.000 | 0 ms | 373 KB |
| `/dashboard` | 1,800–1,804 ms | 0.000 | 50 ms | 595 KB |

`/today` and `/dashboard` were re-measured in a separate confirmation run
(1,432 / 1,800 ms) and agreed with the first pass within noise.

Vercel cold start is visible exactly once: the first hit to `/today` and
`/dashboard` was ~1,800 ms, settling to ~700 ms on every subsequent request.
Cold start is real but it is a once-per-idle-period cost, not the steady state.

## Where the time goes: the data layer, not the bundle

Full HTML document fetch is **600–750 ms** on both local prod and production
warm. That matches the 662 ms `values.batchGet` in `SCALING.md`, which was
re-probed directly during this session and is unchanged (889 KB, 599–695 ms).

LCP tracks that wait almost exactly. On the portal, client render adds only
~70–110 ms on top of the server wait. **Pages are slow because of Sheets, not
because of JavaScript.** The fix, if one is ever wanted, is the retention change
already recommended in `SCALING.md` — not anything in the browser.

### `responseStart` is not the TTFB you want here

Navigation-timing `responseStart` reports **4–30 ms** on these pages. The real
wait is ~660 ms.

Next.js streams the shell immediately and flushes data as it arrives, so
`responseStart` measures when the shell started, not when the content was ready.
Anything reading it — Lighthouse's TTFB, a naive `PerformanceNavigationTiming`
script, most copy-pasted vitals snippets — will report a ~30 ms server that is
really ~660 ms.

**Measure full document fetch instead** (request start → body complete). This
cost one wrong conclusion during the session before it was caught.

## Bundle

The "1.27 MB of JS" figure is uncompressed size on disk. It is not what ships.

| | Disk | Gzipped | Loads on |
|---|---|---|---|
| `recharts` | 396 KB | **112 KB** | `/dashboard` only |
| `framer-motion` | 144 KB | **46 KB** | staff pages only |
| Fonts (2 × woff2) | 138 KB | **138 KB** (already compressed) | everywhere |

**Does `recharts` load on pages with no chart? No.** Verified on fresh loads
across 11 routes: its chunk appears on `/dashboard` and nowhere else. Code
splitting is working correctly.

**Does `framer-motion` cost more than the animation is worth on the portal?**
The question does not apply — **it never reaches the portal.** `PortalShell`
uses plain `Link`/`usePathname` with no motion import. `framer-motion` ships to
staff pages only, via `AppShell` and the 16 files importing `Reveal`.

Warm, gzipped, the portal transfers **~11 KB of JS**. Cold, 142 KB.

Coverage: **40–57%** of shipped JS executes on a given route. That is normal for
React, and the unused remainder is gzipped and non-blocking.

### Fonts are the largest single wire cost on the portal

138 KB across two variable woff2 files — about **45% of the portal's 304 KB
first visit**, and more than `framer-motion` and `recharts` cost on the pages
that use them. woff2 is already compressed, so this does not shrink further.

`GeistMono` is the larger of the two at 70 KB. It is **not** dead weight: it
renders every rupee amount on the portal — the number a parent opens the app to
see. Verified in use across `/portal`, `/portal/fees`, `/portal/tests`,
`/portal/timetable` and `portal-ui.tsx`.

Dropping it would save 70 KB on first visit only (fonts cache thereafter) and
would degrade the most-read element in the product. Not worth it.

## Interaction latency (real INP, not TBT)

**Measured** by driving 24 actual taps on the attendance toggles
(`button[aria-pressed]`) on `/mark/[sessionId]`, throttled:

```
worst   48 ms
p75     32 ms
```

Well inside the 200 ms "good" threshold. Marking a register feels instant on a
slow phone.

Two notes on method, both of which produced wrong numbers first:

- The first attempt tapped `button:visible`, whose first match is the **submit**
  button. It navigated away, yielding a single-tap sample. The attendance
  toggles are `button[type="button"][aria-pressed]`.
- **Lighthouse cannot provide TBT here.** The `lighthouse_audit` tool in Chrome
  DevTools MCP explicitly excludes the performance category. Main-thread cost
  was measured with `longtask` PerformanceObserver instead: **0 long tasks** on
  the portal and `/today`, **3 totalling 50 ms** on `/dashboard`.

## Memory

**Measured**, via `Runtime.getHeapUsage` after forced GC:

```
/dashboard         8.4 MB
/manage/students   4.4 MB
/today             4.2 MB
```

Retention across **14** `dashboard` ↔ `students` round trips: **+3.6 MB**,
oscillating between 9.4 and 12.8 MB and plateauing. Five round trips gave
+3.2 MB — i.e. tripling the navigations did not triple the growth.

**Bounded router cache, not a leak.** A leak grows linearly; this stops.

### `performance.memory` is quantized — do not use it

It reported a flat **9.5 MB for every page and every round trip**, including
pages whose real heap differs by 2×. Chrome quantizes it for fingerprinting
resistance. Use `Runtime.getHeapUsage` (CDP) after
`HeapProfiler.collectGarbage`.

## What not to do

- **Do not drop `recharts`.** Already isolated to the one page that uses it.
  112 KB gzipped, 50 ms blocking, on a page nobody opens on a phone in a hurry.
- **Do not drop `framer-motion`.** 46 KB gzipped, never reaches the portal,
  zero blocking on `/today`. It costs less than the fonts.
- **Do not drop `GeistMono`.** See above — it renders the rupee amounts.
- **Do not lazy-load the dashboard charts yet.** It would save perhaps 100-150 ms
  of an 1,800 ms LCP (**derived** from the 50 ms blocking plus 112 KB transfer;
  not measured as a change). The Sheets read dominates and the retention fix in
  `SCALING.md` is the bigger lever.

## Caveats

- These are **lab numbers on emulated throttling**, not field data. CrUX has no
  data for this origin, so real-user vitals are unknown.
- Measured against the current ~60-student dataset. `/dashboard` serves **330 KB
  of HTML** versus 52 KB for `/today` because it inlines chart data, and that
  grows with attendance history. It is the page to re-measure as data
  accumulates — **derived**, by the same reasoning as the payload growth table
  in `SCALING.md`.
- Demo credential hints are correctly hidden in production and shown locally.
  Verified, working as designed.
