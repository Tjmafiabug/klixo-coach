# Next session — production readiness & scalability

Paste the text below as the first message of a new session. Start `npm run dev`
first and confirm it takes port 3000.

---

I want a full production-readiness and scalability assessment of KLiXO Coach, driven through Chrome DevTools MCP against the running app, plus research into how this class of product should be load- and performance-tested.

Start by researching current (2026) best practice on the internet before touching the app — I want the methodology to be industry-standard, not improvised. Then measure. Then tell me what breaks and at what point.

## The system under test

Next.js 16.3.4 App Router on Vercel. The entire database is ONE Google Sheet read via a service account. There is no Postgres, no Redis, no queue. This is deliberate — the owner being able to open their data in Sheets is the product's differentiator — so assume it stays, and find where it stops working rather than proposing a rewrite.

Constraints that matter, all measured rather than assumed:

- A single `spreadsheets.values.get` round trip is ~2 seconds.
- Google's quota is ~60 read requests/min/user and ~60 writes/min/user, PROJECT-wide 300/min. A batch counts as ONE request regardless of how many ranges it carries.
- `readTab` is now a single `values.batchGet` of all 24 tabs per request, deduped per request with React `cache()`. So one page render = ~1 read request, but it transfers the WHOLE sheet (~345KB today).
- The read-quota cliff has already been measured — see "Already answered" below. Do not re-derive it.
- Writes are read-whole-tab → findIndex → `values.update`, or append. Not transactional. `withRetry` gives 4 attempts with exponential backoff + jitter on 429/5xx, and now wraps writes as well as reads.
- Login throttle is an in-memory Map: 5 failures per phone in a 15-minute sliding window, then a 15-minute lock. It is PER LAMBDA INSTANCE, so it resets on cold start and is bypassable across instances.
- Session generation cron expands timetable rules 30 days ahead (`HORIZON_DAYS = 30`).
- Current data volume: 959 sessions, 7,652 attendance rows, 60 students, 144 enrollments, 12 batches, 9 staff.

Read `docs/TESTING.md` first — it records what is already tested, two measured properties of Sheets-as-a-database (no read-after-write consistency, no rollback), and why quota pressure presents as flakiness.

## Part 1 — research first

Search the internet for current practice. I want opinions and citations, not a survey:

1. **Load testing a serverless app with a rate-limited third-party datastore.** How do people test systems whose bottleneck is an external quota rather than CPU? k6 vs Artillery vs Playwright-driven concurrency — what actually fits here, and why. How do you model a quota ceiling in a load test without simply burning the quota?
2. **Chrome DevTools MCP for performance work in 2026** — what it is genuinely good at (traces, Core Web Vitals, network waterfalls, CPU/network throttling, coverage) and where it misleads. Specifically: how to read a performance trace to separate server wait time from client work, and how `performance_analyze_insight` should be used.
3. **Core Web Vitals for an authenticated, server-rendered, data-heavy app.** LCP/INP/CLS targets, why Lighthouse cannot measure INP in a lab and reports TBT instead, and what to measure instead for a logged-in dashboard that no synthetic tool can reach without a session.
4. **Realistic user modelling for a coaching centre.** The real peak is 6–8pm when every teacher marks a register at once. How should concurrent-user load be modelled — think time, session length, arrival distribution — rather than a naive N-parallel-requests hammer.
5. **Scaling Google Sheets as a datastore.** What are the actual documented ceilings (cells per spreadsheet, per-request payload, concurrent write behaviour, quota increase options)? At what data volume does this architecture genuinely stop working? I want a number of students/centres, derived from the limits, not a vibe.
6. **Vercel-specific:** Fluid Compute instance reuse and what it means for the in-memory rate limiter; cold start behaviour; where Speed Insights / Web Analytics would give real-user data that synthetic testing cannot.

## Part 2 — measure the real app

Use Chrome DevTools MCP. Two targets, and measure both:

- **Local** (`npm run dev`, port 3000) — for traces, throttling, coverage and heap
  snapshots, where you control the environment.
- **Production** — https://coach.klixostudio.com — for the numbers that actually
  matter: real Vercel cold starts, real network latency, real TLS. Local dev
  timings are not production timings and should never be reported as such.

Log in as owner 9876500001 / PIN 1234, teacher 9876500002, student 9876510001
(PIN 1234 for all). Note the demo credential hints are hidden in production by
design, so the login page there gives no clue — that is correct behaviour.

I want numbers, not impressions:

- **Per-page performance traces** for `/today`, `/dashboard`, `/manage/students`, `/manage/fees`, `/timetable`, and the portal pages. Separate server time from client time. Which pages are slow because of Sheets, and which because of the bundle or rendering?
- **Core Web Vitals** on the pages that matter, including the portal pages a parent opens on a phone.
- **Network waterfall** — payload sizes, what's blocking, whether the 345KB whole-sheet fetch shows up as a problem at the page level.
- **CPU and network throttling** — the real users are parents on cheap Android phones on Indian mobile networks. Test at 4× CPU slowdown and Slow 4G, not on my laptop's connection.
- **Bundle analysis** — what JavaScript ships, what's unused (use coverage), whether recharts/framer-motion are worth their weight on the pages that load them.
- **Memory** — take heap snapshots on the heaviest pages; the dashboard holds a lot of rows.

## Already answered — do not redo these

A previous session measured the concurrency questions. Read
`scripts/load-test.mjs` (the harness and its recorded results) and
`src/lib/next-id.test.ts` before planning anything here.

**The quota cliff is measured.** Between 12 and 20 concurrent users with zero
think time: 38 views in 4.2s, then 64 views in 55.6s. 1.7x the load for 13x the
wall clock — a hard rate limit engaging, not gradual saturation. Think time is
the variable that matters: 18 users WITH 1.5s pauses run clean at p95 1.5s.
Nine real staff browsing normally are far inside the envelope.

**Errors were zero at every level, including 40 users.** That is the finding.
`withRetry` absorbed 295 rate-limit errors and converted a quota breach into
queueing, so the user gets a 28-second page rather than a failure. There is no
circuit breaker and no load shedding.

**Duplicate ids are documented, not fixed.** `nextId()` is max-suffix+1 over a
snapshot, so overlapping creates mint the same id and Sheets has no unique
constraint. Deliberately left alone: both honest fixes cost a ~2s round trip on
every create, and `integrityIssues()` already detects duplicates. See the
skipped test in `next-id.test.ts` for the reasoning and the revisit conditions.

**The login throttle is bypassable by construction**, and the docstring concedes
it — `store` is a module-scope Map, so it is per-instance. Roughly 5 attempts
per warm instance per window, resetting on deploy and cold start. This is not
reproducible on a single-process dev server; do not try to test it there.

## Part 3 — what is actually left

One open question, and one decision that needs a human:

1. **Is the missing circuit breaker worth fixing?** The app currently trades a
   fast failure for a slow success — 28 seconds of queueing instead of "busy,
   try again". Silent degradation is harder to diagnose than an honest error.
   Measure what a capped retry would actually change, then make the case either
   way. This is a judgement call about failure modes, not a bug.

2. **Where does the data volume ceiling sit?** The load tests used ~960 sessions
   and ~7.6k attendance rows. Sheets has documented limits (cells per
   spreadsheet, per-request payload) and the whole-sheet batchGet is ~345KB
   today. Work out how many students, and how many months of attendance
   history, before the payload or the cell count becomes the binding constraint
   rather than the request quota. Derive it from the documented limits and say
   plainly that it is derived, not observed.

If you do run anything that writes, use the E2E Sheet (`E2E_SHEET_ID` in
`.env.local`; `playwright.config.ts` now fails closed if it is missing) and
clean up after yourself.

## Part 4 — tell me what to do

Produce a ranked list of what would break first in production and what to do about it, with the reasoning visible:

- The concrete ceiling — how many concurrent staff, and how many students' worth of data, before this architecture fails. A number with the derivation, not a guess.
- What is worth fixing now vs at 10 centres vs never.
- For anything you recommend, say what it costs — in effort, in money, and in what it takes away (e.g. caching trades freshness; leaving Sheets keeps the differentiator).
- Explicitly call out what you would NOT do and why. I would rather hear "this is fine, stop worrying about it" than a list of speculative optimisations.

Two rules, because they mattered a lot last session:

1. **Verify before concluding.** Several apparent bugs last session turned out to be measurement error — a URL checked before a redirect finished, a selector matching the wrong element, two dev servers on one port. If a result looks alarming, prove it twice before reporting it.
2. **Distinguish measured from inferred.** If you extrapolate a ceiling from quota maths rather than observing it, say so plainly.
