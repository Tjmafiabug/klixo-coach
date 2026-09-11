# Next session — browser performance (Chrome DevTools MCP)

Paste everything below the `---` as the first message of a new session.

Before you start:

```bash
npm run dev          # confirm it takes port 3000
```

The dev server reads `SHEET_ID` from `.env.local`, which is the production
Sheet. That is what you want for measurement — real data volume. Nothing in
this brief writes.

---

I want the browser half of a performance assessment for KLiXO Coach, using
Chrome DevTools MCP. The server side is already measured and settled — read
`docs/SCALING.md` first and do not redo any of it.

## What is already known — do not re-measure

`docs/SCALING.md` has the evidence. In short:

- One page render = one `values.batchGet` of all 24 tabs = **889 KB, 662 ms
  median**. Attendance is 83% of that payload.
- The read-quota cliff sits between 12 and 20 concurrent users with zero think
  time. Nine real staff with normal pauses are far inside it.
- The 28-second pages seen under load were **request queueing, not Sheets and
  not retry backoff** — 507 renders logged, slowest 1,996 ms server-side, zero
  over 5 s. A circuit breaker was considered and explicitly rejected.
- Concurrent attendance writes are safe: every read path dedupes on
  `(session_id, student_id)` by newest timestamp. `nextId()` is the one case
  where duplicates matter, and it is documented as detected-not-prevented.
- Data ceiling: payload crosses Google's 2 MB recommendation around 40-50
  students with a year of history; the 10 M cell limit is ~100× away.

None of that says anything about what happens **in the browser**, which is what
I want now.

## The system, browser side

Next.js 16.3.4 App Router, React 19, Tailwind 4. Server-rendered, so most pages
arrive as HTML — but 21 files carry `"use client"`, and the built app ships
**27 JS chunks totalling ~1.27 MB**. Two heavy client dependencies:
`recharts` (9 MB installed) and `framer-motion` (5.6 MB installed), used for the
dashboard charts and the `Reveal`/`CountUp` animations respectively.

The users that matter: **parents and teachers on cheap Android phones, on Indian
mobile networks.** Not my laptop. Every measurement should reflect that or be
labelled as a lab number.

## What I want measured

Log in as owner `9876500001`, teacher `9876500002`, student `9876510001` — PIN
`1234` for all. Measure **both** targets and keep them separate:

- **Local** (`http://localhost:3000`) — for traces, throttling, coverage, heap.
  You control the environment here.
- **Production** (`https://coach.klixostudio.com`) — for real Vercel cold
  starts, real TLS, real network. Note the demo credential hints are hidden in
  production by design, so the login page gives no clue; that is correct.

Dev-mode numbers are not production numbers. Never report one as the other.

1. **Where does the time actually go?** Performance traces for `/today`,
   `/dashboard`, `/manage/students`, `/manage/fees`, `/timetable`, and the
   portal pages. For each, split: server wait (TTFB, already known to be
   ~660 ms of Sheets) vs. client parse/execute/render. I want to know which
   pages are slow because of the data layer and which because of the bundle —
   these have completely different fixes and only one of them is worth doing.

2. **Core Web Vitals**, especially on the portal pages a parent opens. LCP, CLS,
   and INP. Remember Lighthouse cannot measure INP in a lab and reports TBT
   instead — say which you are reporting. If real INP matters, drive an actual
   interaction (mark a register, submit a test) and measure it.

3. **Throttled**, because this is the real condition: 4× CPU slowdown and Slow
   4G. What does `/portal` and `/today` feel like there? A page that is fine on
   my laptop and unusable on a ₹8,000 Android is the finding I care most about.

4. **Bundle reality check.** Use coverage to find what ships and is never
   executed. Specifically: does `recharts` load on pages with no chart? Does
   `framer-motion` cost more than the animation is worth on the portal? I am
   open to dropping either if the numbers justify it — but only if they do.

5. **Memory.** Heap snapshots on `/dashboard` and `/manage/students` — the
   dashboard holds a lot of rows. Look for retention across navigations, not
   just peak size.

## What I want out of it

A short ranked list. For each item: the measured number, what a user actually
experiences because of it, the fix, and what the fix costs.

Two things I specifically want you to be willing to say:

- **"This is fine."** If the bundle is unremarkable and the pages are fast
  enough on a throttled phone, say so and stop. I would rather hear that than a
  list of speculative micro-optimisations.
- **"I could not measure this."** If DevTools cannot get a real INP, or the
  production numbers are too noisy to separate cold start from render, say that
  plainly instead of reporting a number you do not trust.

Two rules from previous sessions, both learned the hard way:

1. **Verify before concluding.** Several apparent bugs turned out to be
   measurement error — a URL read before a redirect finished, a selector
   matching the wrong element, two dev servers on one port, and a "retry
   backoff" diagnosis that the server log later disproved. If a result looks
   alarming, prove it twice before reporting it.
2. **Label measured vs derived.** If you extrapolate, say so in the same
   sentence as the number.
