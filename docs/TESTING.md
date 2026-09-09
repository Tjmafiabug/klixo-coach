# Testing

Two suites. Run both before anything that touches the data layer or auth.

```bash
npm test     # 134 unit tests, ~2s, no network
npm run e2e  # 99 browser tests, ~6min, writes to a real Sheet
```

## Unit — `src/lib/*.test.ts`

Vitest, Node environment, no network. Covers the pure logic where a silent wrong
answer is expensive:

| File | What it pins |
|---|---|
| `guards.test.ts` | every server action calls a session guard; `requireOwner()` re-reads the Staff row |
| `authz.test.ts` | ownership needs both ids present — `"" === ""` must not grant access |
| `time.test.ts` | "today" in `CENTER_TZ`, midnight rollover, the `T24:00:00` case |
| `rate-limit.test.ts` | the 4/5 lockout boundary and the sliding window |
| `scoring.test.ts` | MCQ marks: blanks never penalised, total floors at 0 |
| `fees.test.ts` | `monthOverlaps` incl. the `-99` sentinel; credit/settled/due signs |
| `sheets.test.ts` | retry policy, one batchGet, `KNOWN_TABS` matches the bootstrap script |
| `integrity.test.ts` | dangling refs, blank teacher, duplicate ids |
| `read-after-write.test.ts` | a re-read after a write must bypass the per-request cache |
| `demo-mode.test.ts` | demo affordances fail closed |

Several assert against **source text** rather than behaviour — the guard scan,
`KNOWN_TABS`, the retry coverage. That is deliberate: they encode invariants the
type system cannot, and each was verified to fail when the defect is
reintroduced. A test that has never been seen to fail is decoration.

## E2E — `e2e/*.spec.ts`

Playwright, Chromium only (the users are on Android Chrome).

| Spec | Tests | Covers |
|---|---|---|
| `auth.spec.ts` | 18 | login for all 3 roles, parent↔child scoping, cookie flags, tampered tokens |
| `authz.spec.ts` | 37 | 15 owner pages + 9 dynamic :id routes vs a teacher, API role checks, **direct-POST attack** |
| `features.spec.ts` | 38 | all 31 pages render, attendance write, fee arithmetic, CSV export |
| `generation.spec.ts` | 3 | the nightly cron converges, is owner-only, spares ad-hoc classes |
| `payroll.spec.ts` | 3 | board renders, salaries hidden from teachers, paying reduces due |

E2E exists because **Vitest cannot render async Server Components**, and nearly
every page here is one.

### The test that matters most

`authz.spec.ts` → "a teacher's session cannot drive an owner-only action".

`actions.ts` carries `"use server"` at file scope, so every export is an
independently POST-able endpoint — and **layouts do not run for a server-action
POST**. The per-page role checks are therefore not the boundary; the guard
inside the action is.

The test harvests a real action id at runtime by watching the owner's own UI
make the request (the id is a build hash, so it cannot be hardcoded — and it is
obscurity, not a control), replays it with a teacher cookie, and asserts **both**
that the response denies **and** that the write never reached the Sheet. A
redirect issued after a completed write would otherwise read as a pass.

## Writing to a real Sheet

E2E writes real rows. Two things make that safe:

1. **`e2e/global-setup.ts` refuses to run when `SHEET_ID === PROD_SHEET_ID`.**
   Set `PROD_SHEET_ID` in `.env.local` once a real centre is live — the guard
   can only protect what it knows about, and it warns when unset.
2. **`cleanupTestPayments()` / `cleanupTestSalaryPayments()` soft-void the rows the suite created**, matching
   what the app does. Without it the ledger drifts every run and the next run
   starts from a different balance — which presents as flakiness, not as the
   data bug it is.

Cleanup voids **by note text**, never by clicking a "Void" button: those sit
against charges too, so picking one by position risks voiding a real ₹1,000
charge instead of a ₹1 test payment.

## Two properties of Sheets-as-a-database

Both were measured, and both shape how tests must be written:

- **Not read-after-write consistent.** A redirect can re-render before Google
  serves the row just appended, so a balance reads one payment behind for a
  second or two. The fee assertion polls; a single eager assertion flakes and
  looks like a product bug.
- **No rollback.** Nothing undoes a bad write except another write.

Tests run **serially** (`workers: 1`). One Sheet is a single mutable global with
no transactions and a ~60 reads/min/user quota; parallel workers would corrupt
each other's fixtures and exhaust quota, then present as flakiness.

## Quota pressure looks like flakiness

A full E2E run makes hundreds of Sheet reads. Google's ~60 reads/min/user quota
throttles well before the suite finishes, `withRetry` starts backing off, and a
run that takes ~6 minutes cold can take ~13 under pressure.

That surfaces as tests which pass alone and fail in a full run — the classic
flake signature, and easy to misread as a product bug. Two rules follow:

- **Assert convergence, not a single outcome.** The generation test does not
  demand that the very next run be clean; it retries until generation settles,
  because under eventual consistency a second run can still observe rows the
  first appended moments earlier. What it actually guards against is a cron that
  never settles — one churning rows every night.
- **Never leave a test write behind.** A failed run that skips its own cleanup
  shifts the baseline for every later run. The payroll test flaked exactly this
  way: a failed run left an active ₹1 salary payment, so the next full run
  computed a different due figure. Cleanup must run out of band (targeting rows
  by value), not by clicking a "Void" button, which a failure can skip past.

## Traps that produce confidently wrong results

Every one of these was hit while building the suite:

- **Counting locators before the Sheet read finishes** reports `0`. A
  conditional `test.skip()` then hides the most valuable test in the suite *as a
  pass*. Wait for the element; never count an empty DOM.
- **`button[type="submit"]`.first()** on the mark page is the shell's **"Sign
  out"** — the test logs the user out and fails for an unrelated reason. Address
  buttons by name.
- **`a[href^="/manage/students/"]`.first()** matches **"Add student"** (`/new`).
- **Re-marking a student with the status already saved is a no-op** — the save
  button stays disabled reading "No changes". A write test must make a real
  change.

## CI — `.github/workflows/ci.yml`

`check` runs on every push and PR: typecheck, lint, unit tests, build. No
secrets, no Google quota, under ~2 minutes. Make this a required status check.

The build step uses throwaway env values — `sheets.ts` and `auth.ts` throw at
module load without them, but the build reads no Sheet.

`e2e` runs **nightly and on demand only**, because it needs Sheets credentials
and spends quota. Required secrets:

| Secret | Value |
|---|---|
| `E2E_SHEET_ID` | a Sheet with **disposable** data (File → Make a copy) |
| `PROD_SHEET_ID` | the live centre's Sheet, so the guard can refuse it |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | service account with edit access to the E2E Sheet |
| `SESSION_SECRET` | any random string |

Until those are set, the E2E job is skipped rather than silently green.

## Not covered

Honest gaps, roughly by value:

- **The MCQ flow end to end** — scoring is unit-tested, taking a test is not.
- **Payroll totals** — a staffer's row is covered, but the `Math.max(0, due)` in
  the board totals (one person's credit must not offset another's arrears) is
  not yet pinned.
- **Concurrency** — two teachers marking the same session simultaneously.
  `nextId()` can mint duplicate ids under load; `integrityIssues()` now detects
  that but nothing prevents it.
- **Accessibility in CI** — axe was run manually and the findings fixed; it is
  not yet a gate.
