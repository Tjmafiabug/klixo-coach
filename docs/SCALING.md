# Scaling analysis

Measured 2026-09-11 against the **production** Sheet (`1fA4V…`), read-only.
Numbers here are either **measured** or **derived** — each is labelled, because
the two should not be mixed when deciding anything.

(An earlier revision of this line said "the E2E Sheet". It was wrong: the
889 KB / 7,652-row figures below match production, not E2E, which holds 348 KB
and 2,412 attendance rows. The measurements are unaffected — every read here is
non-mutating — but the source mattered enough to correct. Sessions that
**write** must use the E2E Sheet; see `docs/SCALE-LIMITS.md`.)

## What binds first

Ordered by when you actually hit it:

| # | Constraint | Binds at | Status |
|---|---|---|---|
| 1 | Google's 2 MB payload **recommendation** | ~2.2× today's data | not yet |
| 2 | `503` from request/spreadsheet complexity | undocumented onset | unknown |
| 3 | 60 reads/min/user quota | ~20 concurrent users, no think time | **measured** |
| 4 | 180 s request timeout | far past a 503 | no |
| 5 | 10,000,000 cells per spreadsheet | ~100× headroom | no |

The cell limit is the one people assume binds. It does not, and it is not close.

## Measured today

One `batchGet` of all 24 tabs, spaced to avoid throttling:

```
payload   889 KB
rows      9,497
cells     ~93,000   (0.9% of the 10M limit)
latency   662 ms median  (844 / 662 / 643 / 642)
```

Attendance is **83% of the payload** at 7,652 rows, ~98 bytes/row. Nothing else
is close — Sessions is 10%, everything else together is 7%. Attendance is the
only growth driver worth modelling.

Note 662 ms for the whole sheet is *faster* than a single-tab read used to be
before batching. The batch is not the expensive part; the round trip is.

## Derived growth

From measured ratios — 9.4 sessions/day, 8.0 marks/session, 5.0 students/batch —
retaining one academic year of history:

| Students | Sessions/yr | Marks/yr | Payload | Cells |
|---|---|---|---|---|
| 60 (today) | 3.4k | 27k | 2.9 MB | 0.31 M |
| 150 | 8.6k | 68k | 7.1 MB | 0.77 M |
| 300 | 17k | 137k | 14.3 MB | 1.54 M |
| 600 | 34k | 274k | 28.6 MB | 3.08 M |

**Derived, not observed.** The ratios are measured; the extrapolation assumes
they hold, which they will not exactly.

Read it as: **payload crosses Google's 2 MB recommendation somewhere around
40-50 students with a full year retained**, while cells are still at ~2% of
their limit. Size, not row count, is the thing to watch.

## The 2 MB line is a recommendation, not a cap

There is **no documented hard response-size limit** on `values.batchGet`. The
widely-repeated 10 MB figure does not appear in Sheets v4 documentation and
should not be used. What Google actually says:

> "While Sheets API has no hard size limits for an API request, users might
> experience limits from different processing components not controlled by
> Google Sheets. To speed up requests, we recommend a 2 MB maximum payload."
> — https://developers.google.com/workspace/sheets/api/limits

The second clause is the operative one. Past 2 MB you are in territory Google
explicitly declines to characterise. The documented failure mode is not a clean
413 but:

> "The Sheets API returns a 503 error when the service is unavailable **or when
> the complexity of the request or spreadsheet is high**."
> — https://developers.google.com/workspace/sheets/api/troubleshoot-api-errors

That matters more than the threshold itself. A 503 is indistinguishable from a
transient outage, so `withRetry` cannot tell "too big, will never succeed" from
"try again in 2 s" — it will retry a permanently-failing request until the page
gives up. **The failure mode at size is ambiguous, not loud.**

## Concurrency: no conditional write exists

Verified directly against the live v4 discovery document rather than taken on
trust:

```
curl -s "https://sheets.googleapis.com/\$discovery/rest?version=v4" \
  | grep -ocE '"etag"|ifMatch|revisionId|If-Match'
→ 0
```

There is no ETag, no If-Match, no revision id, no compare-and-swap anywhere in
the API. (Claims to the contrary describe GData v2/v3, a different and retired
protocol.) Atomicity is guaranteed *within* one request and says nothing about
isolation *between* two.

**This is fine for attendance, by design rather than by luck.** Two teachers
marking the same session concurrently produce two rows, and every read path
resolves them through `latestPerSessionStudent` / `latestPerStudent`, which key
on `(session_id, student_id)` and take the newest timestamp with `log_id` as a
deterministic tiebreak. Last-write-wins is the correct semantic for a register:
the later mark is the intended one. Verified that `getOwnerStats` — where
attendance % is actually computed — dedupes before counting, so duplicate rows
cannot inflate a percentage.

**It is not fine for `nextId()`**, which is max-suffix+1 over a snapshot. Two
overlapping creates mint the same id and nothing rejects it; row-by-id lookups
then take the first match and silently ignore the second record. Deliberately
detected rather than prevented — see `src/lib/next-id.test.ts` for the reasoning
and the conditions to revisit.

## The load cliff, measured

| Users | Think | Views | Wall | p50 | p95 | >5 s | Errors |
|---|---|---|---|---|---|---|---|
| 9 | 1500 ms | 29 | 9.1 s | 784 ms | 1.1 s | 0 | 0 |
| 12 | 0 | 38 | **4.2 s** | 1.1 s | 2.3 s | 0 | 0 |
| 18 | 1500 ms | 57 | 10.4 s | 1.1 s | 1.5 s | 0 | 0 |
| 20 | 0 | 64 | **55.6 s** | 1.6 s | 20.6 s | 16 | 0 |
| 40 | 0 | 127 | 50.5 s | 3.4 s | 23.4 s | 50 | 0 |

Between 12 and 20 concurrent users with no think time: 1.7× the load, **13× the
wall clock**. A hard rate limit engaging, not gradual saturation.

**Think time is the variable that matters, not user count.** 18 users *with*
1.5 s pauses run clean; 20 *without* hit p95 20.6 s. The quota is per-minute, so
the pauses real people take are what keep a centre inside it. Nine staff
browsing normally are far from the edge.

### The 28 s was queueing, not retry backoff

An earlier reading blamed `withRetry`. The server log disproves it:

```
507 renders logged during the load tests
slowest server-side render      1,996 ms
renders over 5 s, server-side   0
500s served                     0
```

Distribution: 8 under 500 ms, 101 at 500 ms-1 s, 170 at 1-2 s, none above 2 s.
The retry budget is only ~2.8 s of sleep plus 4 requests — nowhere near 28 s.

So the time clients measured was spent **waiting for a worker**, not rendering
and not sleeping between retries. 206 quota errors were logged and absorbed;
none reached a user.

**A circuit breaker would not have helped.** It caps time spent retrying, and
the time was not spent retrying. That was the wrong conclusion and it is
withdrawn.

## What to do

**Now — nothing.** At 60 students and 9 staff, every measured number is
comfortable: 662 ms reads, p95 1.1 s under full-staff load, 0.9% of the cell
limit. The architecture is not the constraint at this size and optimising it
would be speculative.

**Before ~150 students** (payload approaching 2 MB), the cheapest effective
change is **retention, not re-architecture**: stop reading all of Attendance on
every render. It is 83% of the payload and almost all of it is history nobody is
looking at. Either archive prior terms to a second spreadsheet, or read
Attendance by date range rather than whole-tab. That buys roughly an order of
magnitude and keeps the owner-editable-Sheet property intact, which is the whole
point of the design.

**Before a second centre shares a deployment**, revisit `nextId()`. Duplicate
ids are tolerable when creates are rare and manual; they are not when two
centres' staff create records concurrently through one service account.

### What I would not do

- **Do not migrate to Postgres.** Nothing measured justifies it, and it costs the
  product's differentiator. The ceiling is real but it is ~3-5× away, and the
  retention fix is far cheaper.
- **Do not add a circuit breaker.** The 28 s was queueing, not retrying — see
  above. It would add a failure mode without removing one.
- **Do not raise Sheets quota yet.** Not close to binding, approval is not
  guaranteed, and over-quota use is scheduled to start incurring charges later
  in 2026.
- **Do not chase the 10 M cell limit.** ~100× headroom. It is the limit people
  assume binds and it does not.

## Not verified

Two things are genuinely absent from Google's documentation. Do not let anyone
fill them in with a guess:

- **Whether the 10 M cell count includes empty allocated cells.** The API's
  `GridProperties` exposes `rowCount`/`columnCount` independent of content,
  which suggests allocated — but that is inference. It does not change the
  conclusion either way, since the limit is ~100× away.
- **Quota-increase turnaround.** No SLA or timeframe is published.

## Sources

- [Usage limits](https://developers.google.com/workspace/sheets/api/limits)
- [Troubleshoot API errors](https://developers.google.com/workspace/sheets/api/troubleshoot-api-errors)
- [Sheets size limits](https://support.google.com/drive/answer/37603)
- [v4 discovery document](https://sheets.googleapis.com/$discovery/rest?version=v4)
- [Performance tips](https://developers.google.com/workspace/sheets/api/guides/performance)
