# Ponytail Audit — klixo-coach (`high`)

Read-only over-engineering audit. Scope: complexity & bloat only (correctness
bugs, security holes, and performance are out of scope — route those to a normal
review pass). Scanned `src/` (77 files, ~15.5k LOC) plus dependencies. Ranked
biggest cut first. **Nothing was changed — this is a findings report.**

Date: 2026-06-27

---

## Dependencies

- `native:` **`googleapis` (202 MB on disk, every Google API)** — only
  `google.sheets` + `google.auth.GoogleAuth` are used, in one file. Swap for the
  scoped `@googleapis/sheets` (same client surface). ~200 MB install + 1
  monolithic dep gone, zero logic change. [src/lib/sheets.ts:1](src/lib/sheets.ts#L1)
- `native:` **framer-motion** used for exactly two effects — `Reveal`
  (fade-rise on scroll) and `CountUp`. Both are doable with `IntersectionObserver`
  + CSS transition / `requestAnimationFrame` (~40 lines). Bigger effort: `Reveal`
  is imported in ~17 files, so the dep cut is real but not a one-liner.
  [src/components/motion.tsx:4](src/components/motion.tsx#L4)

## Dead code

- `delete:` **`feeChargeRow` + `paymentRow`** — exported row-builders, JSDoc
  claims "UI layer can reuse," **0 call sites** repo-wide; the fee writers inline
  the arrays. (−25) [src/lib/data.ts:3654](src/lib/data.ts#L3654)

## Shrink — actions.ts (repeated boilerplate)

- `shrink:` **`String(formData.get("X") ?? "").trim()` repeated 125+ times**
  across ~36 actions → one `const f = (k) => String(formData.get(k) ?? "").trim()`.
  Single biggest LOC win. (−60) [src/lib/actions.ts:107](src/lib/actions.ts#L107)
- `shrink:` **`toggleStudentActive`/`toggleBatchActive`/`toggleCourseActive`** are
  the same 6-line shape → one parametrized helper. (−12)
  [src/lib/actions.ts:599](src/lib/actions.ts#L599)
- `shrink:` **`back = id ? \`/manage/x/${id}\` : "/manage/x/new"` + missing-redirect**
  repeated in 5 save actions → `editBack(base, id)`. (−6)
  [src/lib/actions.ts:371](src/lib/actions.ts#L371)
- `shrink:` **positive-rupee check** `!isInt(x) || Number(x) <= 0` duplicated in 4
  actions → `isPositiveInt(s)`. (−4) [src/lib/actions.ts:547](src/lib/actions.ts#L547)
- `shrink:` **`voidChargeAction`/`voidPaymentAction`** byte-identical but for the
  void fn + success flag (`?voided=1` vs `?pvoided=1`); `voidSalaryItem` is a
  near-twin → one helper. (−4) [src/lib/actions.ts:856](src/lib/actions.ts#L856)
- `yagni:` **`isHttpUrl` regex const** with one call site → inline the test. (−1)
  [src/lib/actions.ts:356](src/lib/actions.ts#L356)

## Shrink — data.ts

- `shrink:` **three fees aggregators** (`getFeesRollup`/`listFeesOverview`/`reportFees`)
  each rebuild identical `chargesByStudent`+`paymentsByStudent` maps + id union →
  one `groupFeesByStudent(charges, payments)`. (−18)
  [src/lib/data.ts:3801](src/lib/data.ts#L3801)
- `shrink:` **`latestPerStudent`** re-implements the timestamp/log_id tiebreak of
  `latestPerSessionStudent` → make it a thin wrapper. (−10)
  [src/lib/data.ts:279](src/lib/data.ts#L279)
- `yagni:` **`createRule` hand-rolls a max-suffix loop** that `nextId()` already
  does → `nextId(rules.map(r=>r.slot_id), "TT", 3)`. (−6)
  [src/lib/data.ts:1013](src/lib/data.ts#L1013)
- `shrink:` **`getPtmBoard` re-inlines** `cfg.get("demo_today")?.trim() || centerToday()`
  → call existing `todayFromCfg(cfg)`. (−1) [src/lib/data.ts:4427](src/lib/data.ts#L4427)

## Shrink — components (confirmed duplication)

- `shrink:` **`initials` hand-rolled 3×** (Avatar, AppShell, MarkRoster) while
  `lib/format.ts` already exports `initials()` — only StaffAttendanceGrid imports
  the real one → import it everywhere. (−10) [src/components/ui.tsx:54](src/components/ui.tsx#L54)
- `shrink:` **5 chip components** (`StatusPill`, `LedgerStatusPill`, `ActiveChip`,
  `RoleChip`, `OnTrackChip`) share one `inline-flex rounded-[3px] px-2 py-0.5
  font-mono … uppercase tracking-wide` shell → one `<Pill tone label>` primitive.
  `LedgerStatusPill` also rebuilds its `LEDGER` map inside render — hoist it.
  (~−20) [src/components/ui.tsx:9](src/components/ui.tsx#L9)

## Yagni — speculative flexibility

- `yagni:` **sheets.ts multi-tenant scaffolding** — `clientCache` Map keyed by
  `serviceAccountJson` + `currentCenter()` "SINGLE SOURCE OF TRUTH … go
  multi-tenant later" for a **single** centre (Map holds one entry). A
  module-level client + plain env read suffices until tenant #2 exists. (~−10,
  low risk) [src/lib/sheets.ts:33](src/lib/sheets.ts#L33)

---

**net: −185 lines possible, −1 dep clean (`googleapis`→`@googleapis/sheets`,
~200 MB), −1 dep possible (framer-motion, larger effort).**

## False-positive guards (checked, NOT cut)

- Every other exported action (38) and row-builder (`ptmRow`, `ruleRow`) has live
  call sites.
- `Reveal`/`CountUp`/`LedgerStatusPill`/`OnTrackChip`/`paginate().start/size` are
  all used.
- `updateValues`/`batchUpdateValues`/`deleteRows` are all live.
- `Map.groupBy` was deliberately **not** suggested for the repeated groupBy
  pattern (runtime support unconfirmed on the deploy target).

Biggest realizable LOC win: the actions.ts FormData helper. Biggest footprint
win: the `googleapis` swap.
