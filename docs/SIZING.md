# Sizing guide — what one centre can run

Derived 2026-09-11 from rates measured on the production Sheet. Every number
below is either **measured** or **derived**, and labelled.

The short answer: **retention decides the ceiling, not student count.** A centre
keeping one term of history runs 300+ students comfortably; the same centre
keeping two years is in trouble at 50. Nothing else in the system binds first.

## The answer, in one table

**Maximum students before the payload crosses the measured ~3.9 MB
erratic-latency line** — derived:

| History retained | Max students |
|---|---|
| 3 months (one term) | **~330** |
| 6 months | **~170** |
| 12 months | **~87** |
| 24 months | **~44** |

Staff count does not appear because staff do not drive payload and, since the
read cache, do not drive quota either. 40 staff is comfortable at every row.

## What to tell a prospective client

> **Up to ~200 students and ~40 staff**, keeping the current term plus the
> previous one (about 6 months) live in the Sheet.

That sits inside the 6-month row with headroom, needs no architectural change,
and keeps the owner-editable Sheet — the product's differentiator — intact.

Past that, the fix is **archiving old attendance, not re-architecting**. See
"Raising the ceiling" below.

## Payload by size and retention

**Derived** from measured rates; `*` marks past the ~3.9 MB erratic zone.

| Students | 3 months | 6 months | 12 months | 24 months |
|---|---|---|---|---|
| 50 | 0.59 MB | 1.14 MB | 2.23 MB | 4.42 MB* |
| 100 | 1.18 MB | 2.28 MB | 4.47 MB* | 8.85 MB* |
| 150 | 1.78 MB | 3.42 MB | 6.70 MB* | 13.27 MB* |
| 200 | 2.37 MB | 4.56 MB* | 8.94 MB* | 17.69 MB* |
| 300 | 3.55 MB | 6.84 MB* | 13.40 MB* | 26.54 MB* |
| 500 | 5.92 MB* | 11.39 MB* | 22.34 MB* | 44.24 MB* |

Crossing 3.9 MB is **not** a failure. `SCALE-LIMITS.md` measured clean responses
with zero 503s all the way to 8.76 MB. What happens past ~3.9 MB is that latency
becomes **erratic** — 951 ms and 6,741 ms on payloads of similar size. Median
stays tolerable; predictability does not, and that is worse for a user than a
uniformly slower page, because the app has nothing to show while it waits.

## The measured rates behind it

From the production Sheet (60 students, 12 batches, 9 staff):

| Quantity | Measured |
|---|---|
| Attendance share of payload | **80.6%** (737 KB of 913 KB) |
| Sessions share | **12.3%** |
| Everything else (22 tabs) | **7%** |
| Bytes per attendance row | **98** |
| Enrollments per student | **2.40** |
| Marks per student per marked day | **2.057** |
| Sessions per batch per day | **0.910** |
| Students per batch | **12.0** |
| Teaching days per year | **220** (62 marked days across a 103-day span) |

Two of these are worth understanding before quoting a size:

**Enrollments per student (2.40) is the real multiplier.** A student attends
2.4 batches, so each generates ~2 attendance rows per teaching day, not one. A
centre where students take a single subject produces **less than half** the
payload at the same headcount. Ask before sizing.

**Teaching days per year (220) came from measurement, not assumption.** An
earlier projection treated 62 marked days as a year's worth and under-counted
growth by 3.5×. The 62 days span 103 calendar days, which extrapolates to 220.

## What does NOT bind

### Reads — solved by the cache

Before the cross-request cache, every page view spent a read unit and a marking
cycle spent four. **Measured:** 40 staff plus 500 parents over five minutes ran
at 69 reads/min against a 60/min ceiling, and Google rejected 88 staff reads and
227 parent reads — teachers could not mark attendance during the busiest period.

With the 5-second cache the same burst runs **660/660 clean at a p50 of 7 ms**.

Reads now scale with **server instances, not users** — derived:

| Instances | Reads/min used | Spare |
|---|---|---|
| 1 | 12 | 48 |
| 2 | 24 | 36 |
| 4 | 48 | 12 |
| 8 | 96 | **over quota** |

So the read ceiling is roughly **4 concurrent instances**, whatever the user
count behind them. Vercel Fluid reuses instances across concurrent requests, so
traffic raises instance count sub-linearly.

### Writes — never close

Writes are not cached, but one register submit is **one write unit regardless of
class size** (`appendRows` sends every row in a single call, and unchanged marks
are skipped entirely).

**Measured** simultaneous register submits: 10, 20 and 40 teachers all clean;
70 rejects 21%; 120 rejects 52%.

Against that, **derived** peak load at a period boundary:

| Students | Batches | Sessions/day | Peak simultaneous submits |
|---|---|---|---|
| 100 | 8 | 7.6 | ~2 |
| 200 | 17 | 15.2 | ~3 |
| 500 | 42 | 37.9 | ~7 |

Even 500 students produce about seven simultaneous submits. Writes have roughly
6× headroom at the largest size considered here.

### Cells — ~100× away

2 M cells at 500 students with a year retained, against a 10,000,000 limit. This
is the limit people assume binds. It does not, and it is not close.

## Raising the ceiling

In order of cost, cheapest first.

**1. Archive old attendance (the only one most centres need).** Attendance is
80.6% of payload and almost all of it is history nobody reads — every screen
except reports wants the last two weeks. Copy prior terms to a second sheet or
an `Attendance_Archive` tab and read it only for date ranges that need it.

This buys roughly the difference between the columns above: a 200-student centre
goes from 8.94 MB (12 months) to 2.37 MB (3 months). **Roughly an order of
magnitude, for a script and a date-range read** — and the owner still has every
row in a sheet they can open.

**2. Month-partitioned attendance tabs.** `Attendance_2026-09` and friends, with
a helper that concatenates the months a query needs. Current month at 500
students is ~1.3 MB. More work than archiving, better steady state.

**3. A nightly summary tab.** Precompute per-student attended/total so the
portal reads one small tab instead of the whole attendance history. This is what
breaks the coupling between "one parent's percentage" and "the whole centre's
data".

**Do not migrate to Postgres for size.** Neither binding constraint requires it:
quota was solved by ten lines of cache, payload by archiving. Postgres would add
a second write path that has to reconcile with the owner's direct Sheet edits —
a conflict story that does not exist today — in exchange for fixing problems
that are already fixed. Revisit past ~1,000 students, or when one Google Cloud
project's 300/min cap binds across several centres.

## Multiple centres

Quota follows the **service account, not the spreadsheet** — measured: 240
concurrent reads split across two Sheets failed 6 times, against one Sheet 5
times. Statistically identical.

So a Sheet per centre buys **no headroom**. Each centre needs its **own service
account**. `currentCenter()` in `src/lib/sheets.ts` is already the single seam
that resolves both, and the client cache is already keyed by service account, so
this is provisioning work rather than architecture.

The 300/min per-project ceiling still applies across all service accounts in one
Google Cloud project — **derived:** about 5 fully-saturated centres, though real
centres with human think time never saturate.

## Confidence

- The **payload table is derived**, from measured ratios, and assumes the mix
  (2.4 enrollments/student, 12 students/batch, 220 teaching days) holds. It will
  not hold exactly. Treat the boundaries as ±20%, and ask about enrollments per
  student before quoting.
- The **latency model** (560 ms + 155 ms/MB) tracks the measured bloat test
  within ~10% between 0.6 MB and 3.57 MB. Past 3.9 MB it is meaningless by
  construction, because the whole finding there is that latency stops being
  predictable.
- **Read and write ceilings are measured**, not modelled.
- **Not measured:** sustained load across a full teaching day (every test is a
  burst with quota cooldown), and a Sheet that has actually accumulated a year
  of data at 200 students rather than a bloat-test approximation of one.

## Archiving: measured, not assumed

The archive job (`/api/cron/archive`, nightly at 01:30) moves attendance and
sessions older than `retention_months` into `_Archive` tabs in the same
workbook. Four things were measured on the E2E Sheet before it shipped, because
each one could have invalidated the design.

**A large sibling tab does not slow the main read.** This decided same-workbook
versus a separate archive spreadsheet:

| | batchGet p50 |
|---|---|
| 24 tabs, no sibling | **563 ms** |
| 24 tabs + a 100,000-row (~10 MB) sibling tab | **562 ms** |

`values.batchGet` reads only the ranges it names, so a tab absent from
`KNOWN_TABS` costs nothing at all — not bytes, not latency. **Same workbook is
correct**: no second read unit per cold access, and the owner keeps one file.

**Coalescing consecutive deletes is worth 41×:**

| | wall |
|---|---|
| 5,000 rows as one coalesced run | **466 ms** |
| 500 rows as 500 separate sub-requests | **19,314 ms** |

A register submit appends contiguous marks, which is exactly the shape that
collapses well. Without coalescing a full run would have taken minutes and
risked the function timeout.

**A 5,000-row append (~500 KB) succeeds in one request:** 4,923 ms.

**A full capped run takes 8.7 s** against a 300 s `maxDuration` — 35× headroom,
so the cap is bounded by prudence rather than by the platform.

### What this changes about the ceilings above

Retention stops being a property of the data and becomes a setting. The
"max students" table is then a statement about `retention_months`: a centre
keeping 6 months runs ~170 students whether it opened last year or five years
ago, because the live tab stops growing once the archive is running.

History is not lost — it moves to a tab in the same Sheet the owner can open,
and the cold paths (register back-navigation, CSV exports, a student's full
record) still read it.
