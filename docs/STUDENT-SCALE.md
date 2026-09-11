# Student scale — 100 to 200 students

Measured 2026-09-11 against the **E2E Sheet** (`10RgVF…`), never production.
Numbers here are either **measured** or **derived** — each is labelled.

Fourth in the series, and the one written against a stated target: **a coaching
centre with 100-200 students.** `SCALING.md` measured staff-side reads,
`BROWSER-PERF.md` the browser, `SCALE-LIMITS.md` writes and multi-tenancy. This
one asks whether the product holds at the size it is actually for.

**Short answer: yes for reads, yes for payload, no for test submission.** The
blocker is `nextId()`, and it is a correctness bug rather than a scaling limit —
it corrupts data at 60 students too, just less often.

## Reads: 100 comfortable, 200 with a caveat

Concurrent portal views (each = one `batchGet` of all tabs) — **measured**:

| Students | Arrivals spread over | Succeeded | p50 | Failures |
|---|---|---|---|---|
| 20 | instant | 20/20 | 786 ms | none |
| 40 | instant | 40/40 | 1,072 ms | none |
| 60 | 30 s | 60/60 | 507 ms | none |
| **100** | 60 s | **100/100** | 614 ms | **none** |
| 200 | 60 s | 80/200 | 583 ms | **120 (60%)** |
| 200 | 3 min | 191/200 | 588 ms | 9 |
| **200** | **5 min** | **200/200** | 552 ms | **none** |

**100 students is comfortable.** 200 works provided arrivals spread over a few
minutes — this is the 60 reads/min/user quota, not payload and not rendering.

The practical distinction: parents checking fees across an evening are fine. A
"results are out" broadcast to 200 parents at once is not — that is 200 arrivals
inside a minute, and 60% of them get an error. If such a broadcast is ever a
feature, stagger it.

## Payload at target: past the recommendation, inside the safe zone

**Derived** from measured production ratios (60 students → 7,652 attendance rows
→ 889 KB; 128 attendance rows/student; 99 B/row; attendance is 83% of payload):

| Students | Attendance rows | Payload | vs 2 MB rec | batchGet (derived) |
|---|---|---|---|---|
| 60 (today) | 7,652 | 0.87 MB | 43% | ~602 ms |
| 100 | 12,753 | 1.45 MB | 72% | ~691 ms |
| **200** | 25,507 | **2.89 MB** | **145%** | ~916 ms |
| 300 | 38,260 | 4.34 MB | 217% | ~1,140 ms — erratic zone |

At 200 students the payload is past Google's 2 MB recommendation but **below the
~3.9 MB where latency was measured turning erratic** (`SCALE-LIMITS.md`). Since
that document measured clean responses to 8.76 MB with zero 503s, **payload is
not what blocks 200 students.**

It is what blocks 300. The attendance-retention fix in `SCALING.md` is the
remedy and its timing is unchanged: before ~150 students, ahead of the curve
rather than in response to it.

## Test submission: the blocker

`submitAttempt` (`src/lib/data.ts:4846`) reads the Attempts tab, computes
`nextId(...)` for `attempt_id`, then appends to Attempts and Answers. A test is
the one event where a whole batch acts within seconds of each other.

25 students, one test, by how spread out the submissions are — **measured**:

| Spread | Distinct ids | Duplicates |
|---|---|---|
| Same instant | 2/25 | **23** |
| 5 s | 8/25 | 17 |
| 30 s | 18/25 | 7 |
| 60 s | 21/25 | **4** |

And by batch size at a realistic 30 s spread — **measured**:

| Students | Distinct ids | Duplicates |
|---|---|---|
| 25 | 18/25 | 7 |
| 40 | 26/40 | 14 |
| 60 | 32/60 | **28** |

**It gets worse as batches grow**, because more submissions land inside each
read-then-append window (~500 ms). Even a full minute of natural spread still
corrupts 4 of 25. Timed tests end together by design, so the clustered case is
the normal case, not the worst case.

**Nothing errors. Every write succeeds.** The corruption is silent.

### The damage is worse than duplicate ids

In the 30-student run, the `Answers` rows are keyed by the same colliding
`attempt_id` — **measured**:

```
Attempts rows: 30
  ATT0001 -> 25 students
  ATT0002 ->  5 students

Answers rows: 600
  ATT0001 -> 500 answer rows   (one student's test = 20)
  ATT0002 -> 100 answer rows
```

Row-by-id lookup takes the first match, so:

- `ATT0001` resolves to student `STU000`; **24 other students cannot see their
  own result.**
- Those 500 answer rows are an unseparable mixture of 25 students' answers. There
  is no key left to tell them apart — `attempt_id` was the key.

At 100-200 students with batches of 40-60, this fires on **every test**.

## What blocks what

1. **`nextId()` — blocks tests at any size.** Not a scaling limit: it collides
   100% of the time whenever two creates overlap (`SCALE-LIMITS.md`), which at 60
   students means "whenever two people act at once" and at 200 means "every
   test". This is a correctness bug and it is the one thing that must be fixed
   before growing.
2. **Read arrival rate — blocks 200 simultaneous, not 200 students.** Spread over
   5 minutes, 200/200 succeed. Only a synchronised broadcast breaks it.
3. **Payload — blocks 300, not 200.** The retention fix in `SCALING.md` handles
   it, on the timeline already stated.
4. **Writes generally — not a constraint.** 40 simultaneous register submits run
   clean (`SCALE-LIMITS.md`); one register is one write regardless of class size.

## Verdict on the architecture

**Sheets holds at 200 students.** Reads, writes and payload all clear that bar
with measured headroom, and the owner-editable-Sheet property — the product's
differentiator — survives intact. Nothing here argues for Postgres.

What does not hold is `nextId()`. It is ~10 lines, it is not architectural, and
it is the difference between the product working at 200 students and silently
mixing up test results. Fix that and the 100-200 target is met.

## Not verified

- **Sustained load over hours.** Every test here is a burst with quota cooldown
  between runs; a full teaching day was not simulated.
- **200 students with a year of accumulated history.** The payload column is
  derived from today's 60-student ratios and assumes they hold, which they will
  not exactly.
- **Concurrent test submission *and* register marking.** Reads and writes have
  separate quotas (`SCALE-LIMITS.md`), so they should not contend, but the
  combination was not measured.
