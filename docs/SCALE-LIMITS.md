# Scale limits — writes, multi-tenancy, and the 503 that isn't

Measured 2026-09-11 against the **E2E Sheet** (`10RgVF…`), never production.
Numbers here are either **measured** or **derived** — each is labelled.

Third in the series. `docs/SCALING.md` covers server-side reads and the load
cliff; `docs/BROWSER-PERF.md` covers the browser. This document answers the four
things both of those left genuinely unknown:

1. Does the write path have its own cliff?
2. Does one service account share quota across centres?
3. Where does the 503 "complexity" onset actually sit?
4. How often does `nextId()` actually collide?

## How this was measured safely

`SHEET_ID` in `.env.local` is the **production** Sheet. This session writes, so
the harness reused the fail-closed guard already in `playwright.config.ts`:
refuse to run if the target is unset or equals `PROD_SHEET_ID`. Every test ran
against the disposable E2E Sheet, and the scratch tabs (`_ScaleTest`, `_Bloat`,
`_IdTest`) were deleted afterwards — E2E verified restored to its original 24
tabs / 348 KB.

Between bursts the harness waited **75 s** to let the per-minute quota window
reset. This matters: without it, a test measures the previous test's drained
quota rather than its own load. One wrong conclusion came from exactly that (see
"Retry is not the problem" below).

## What Google actually documents

Fetched from [Usage limits](https://developers.google.com/workspace/sheets/api/limits),
because the read/write split was previously assumed rather than checked:

| Quota | Per minute per project | Per minute per user per project |
|---|---|---|
| Read requests | 300 | **60** |
| Write requests | 300 | **60** |

Three clauses that decide the rest of this document:

> "Each batch request, including any subrequest, is counted as one API request
> toward your usage limit."

> "Provided that you stay within the per-minute quotas, there's no limit to the
> number of requests that you can make per day."

> "While Sheets API has no hard size limits for an API request … we recommend a
> 2 MB maximum payload."

**Reads and writes are separate buckets.** A centre marking registers does not
spend its read quota doing so.

## 1. Writes are safe — because one register is one write

`appendRows` (`src/lib/sheets.ts`) sends every row in a **single**
`values.append`, and `submitMarks` (`src/lib/actions.ts`) skips unchanged marks
entirely. Combined with "a batch counts as one request", this means:

**One register submit = 1 write unit, regardless of class size.**

A 25-student register costs the same quota as a 1-student one.

Simultaneous register submits (25 students each) through the app's real
`withRetry` policy — **measured**:

| Teachers submitting at once | Writes | Succeeded | User-visible failures |
|---|---|---|---|
| 10 | 10 | 10/10 | **none** |
| 20 | 20 | 20/20 | **none** |
| 40 | 40 | 40/40 | **none** |
| 70 | 70 | 55/70 | 15 (21%) |
| 120 | 120 | 58/120 | 62 (52%) |

**40 teachers can submit at the same instant with zero failures.** The centre has
9 staff. This is not a constraint the product will meet.

Successes plateau at ~55-58 past the cliff, which is the 60/min write quota plus
what retry can recover. Raw write latency, sequential and uncontended: p50
420 ms, p95 580 ms, ~2.2 writes/s.

### Retry is not the problem — an early reading said otherwise and was wrong

A first pass showed `withRetry` making things *worse*: 32 failures out of 80,
versus 8 without retry. The apparent explanation — that retrying into an
exhausted per-minute quota deepens the hole, since the ~2.8 s backoff is far
shorter than the 60 s window — is plausible and was nearly reported.

It was measurement error. That run started with the quota already drained by the
preceding test. Repeated after a 75 s cooldown, the identical burst was
**80/80 with zero user-visible failures**.

`withRetry` works. The lesson is about the harness, not the code: **any quota
test that does not wait out the window measures the previous test.**

## 2. Quota is per service account, not per sheet

The finding that constrains multi-tenancy. 240 concurrent reads — **measured**:

| Load | Failures |
|---|---|
| 240 reads split across **two** spreadsheets | 6 |
| 240 reads against **one** spreadsheet | 5 |

Statistically identical. The quota follows the **service account**, not the
spreadsheet.

**Giving each centre its own Sheet buys no quota headroom.** Ten centres on one
service account share the same 60/min/user and the same 300/min/project as one
centre does.

Multi-tenant expansion therefore needs **one service account per centre** (or per
small group), not one spreadsheet per centre. `currentCenter()` in
`src/lib/sheets.ts` is already the single source of truth for centre identity and
already resolves the service account per request — it is the right seam, and the
client cache is already keyed by service account JSON. The change is
configuration and provisioning, not architecture.

The 300/min **project** ceiling still applies across all service accounts in one
Google Cloud project. **Derived:** at 60/min/user that is ~5 fully-saturated
centres per project before the project cap binds — though real centres with human
think time never saturate (see `SCALING.md`).

## 3. The 503 "complexity" onset does not sit where it was feared

`SCALING.md` flagged this as genuinely unknown, and warned the failure mode would
be ambiguous. Tested directly by growing the E2E payload with attendance-shaped
rows — **measured**:

```
0.60 MB →   560 ms          3.20 MB → 1,069 ms
0.97 MB →   630 ms          3.57 MB → 1,106 ms
1.34 MB →   687 ms          4.31 MB → 6,741 ms
1.71 MB →   932 ms          5.79 MB → 4,353 ms
2.08 MB →   862 ms          6.91 MB → 1,540 ms
2.83 MB →   959 ms          8.76 MB → 1,965 ms
```

**Zero 503s at any size, through 8.76 MB — 4.4× Google's recommendation.**

The 2 MB line is a genuine recommendation, not a threshold. Crossing it produced
no error of any kind.

What does happen, past roughly **3.9 MB**, is that latency becomes **erratic**:
951 ms and 6,741 ms on payloads of similar size. Median stays tolerable; variance
does not. **That unpredictability is the real degradation, not an error** — and it
is worse for a user than a slower-but-steady response, because the app has
nothing to show while it waits.

The caution in `SCALING.md` stands. The mechanism is different from the one
assumed: plan around latency variance, not around a 503.

## 4. `nextId()` collides every time, not occasionally

`nextId()` (`src/lib/data.ts:1405`) is max-suffix+1 over a read snapshot.
Concurrent creates — **measured**:

| Concurrent creates | Distinct ids | Duplicates |
|---|---|---|
| 2 | 1 | 1 |
| 5 | 1 | 4 |
| 10 | 1 | 9 |
| 4 **sequential** (control) | 4 | **0** |

Every concurrent create in the same window receives the **identical** id. This is
not probabilistic. Ten concurrent creates produced ten copies of `S004`.

Row-by-id lookups then take the first match and silently ignore the rest, so the
second record is not lost loudly — it is lost quietly.

Affected series (all via `nextId`): students `S`, batches `B`, enrollments `E`,
rooms `R`, timetable slots `TT`, staff tasks `TSK`, salary adjustments `SADJ`,
salary payments `SPAY`.

**Today this is genuinely low-risk** and the existing judgement holds: creates are
rare, manual, and effectively single-operator. But `src/lib/next-id.test.ts`
documents this as *detected rather than prevented*, which reads as "may collide."
It does not may. **Under any concurrency it collides 100% of the time.**

The condition to revisit is not a student count. It is **the first moment two
creates can overlap** — a second admin working simultaneously, or a second centre
sharing a service account.

## What binds, in order

1. **`nextId()`** — fires at *any* concurrency, not at scale. Fix before a second
   admin or a second centre. Cheapest correct fix: derive the id from something
   already unique (timestamp + random suffix), or read-back-and-verify after
   append. **Derived**: a natural-key upsert like Attendance's would also work,
   but these rows have no natural key.
2. **Service-account quota** — 60/min/user shared across every centre on that
   account. Fix by provisioning one service account per centre; `currentCenter()`
   is already the seam.
3. **Payload latency variance** past ~3.9 MB — the retention fix already
   recommended in `SCALING.md` addresses it. Unchanged advice, better-understood
   reason.
4. **Write throughput** — 40 simultaneous register submits run clean. Not a
   constraint at any plausible size for one centre.
5. **10 M cells** — still ~100× away. Still the limit people assume binds.

## What not to do

- **Do not give each centre its own spreadsheet expecting more quota.** Measured:
  it changes nothing. Split the *service account* instead.
- **Do not add a circuit breaker for writes.** Writes fail cleanly with 429 and
  `withRetry` absorbs every burst a real centre produces.
- **Do not treat 2 MB as a hard ceiling.** Measured clean to 8.76 MB. Plan around
  latency variance past ~3.9 MB instead.
- **Do not weaken `withRetry`.** An early result suggested it amplified failures;
  that was quota contamination between tests, and it was wrong.

## Not verified

- **Whether the 300/min project cap behaves as documented across multiple service
  accounts.** Only one service account exists today, so the multi-SA path is
  untested. The per-SA finding is measured; the per-project arithmetic above is
  **derived**.
- **Where the 503 onset actually is.** Not found by 8.76 MB. It may exist far
  higher, or be driven by formula/format complexity rather than payload size —
  this Sheet is plain values.
- **Write behaviour during a sustained multi-minute burst.** All write tests were
  single bursts with quota cooldowns between them.
