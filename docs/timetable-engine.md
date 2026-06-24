# Milestone B — Timetable Engine (build plan, audited)

> Companion to PLAN.md §7 (engine spec) and BUILD.md (backlog). This is the
> vetted plan for B. **Nothing is built until this is approved.**

## 1. Goal

Turn the timetable from **fake** (sessions typed once into the Sheet by the seed)
into **real**: an owner defines weekly recurring **rules**; the system **generates**
dated **Sessions** from them — skipping holidays, honoring start/end dates, detecting
clashes — and keeps generation correct when rules change or holidays are added.

Delivers the "timetable" half of Phase 0 and satisfies the locked decisions
PLAN §3 #6 (rules→sessions), #7 (edit-in-place, past frozen), #8 (student clash = warn),
#9 (room changeover buffer).

## 2. Current state → gap

- `Timetable` tab (rules) exists with data, but **nothing reads it** at runtime.
- `Sessions` are **seeded**, not generated. No generation code.
- **BLOCKER (schema):** `Sessions` has **no `slot_id`** linking a session back to the
  rule that produced it. Without it we cannot (a) generate idempotently — re-running would
  duplicate or orphan rows — nor (b) "regenerate only the future sessions of an edited rule."
  → **B0 adds `slot_id` to `Sessions`.**

## 3. Data-model changes (B0 — must land first)

**Add column `slot_id`** to `Sessions` (after `source`), value =
- the originating `Timetable.slot_id` for `source=recurring` sessions,
- empty for `source=adhoc` (extra/makeup) sessions.

Migration steps (live Sheet, with a one-off backfill script + restore safety):
1. Insert header `slot_id` as column J on `Sessions`.
2. Backfill existing recurring sessions: match each session to its rule by
   (batch_id, day_of_week(date in CENTER_TZ), start, end, room_id) within the rule's
   effective range; set `slot_id`. Adhoc → "".
3. Update `types.ts` (Session interface), `generate_data` schema, and every Sessions
   read/write to carry the 10th column.

**No other schema change.** `Timetable` and `Holidays` columns are sufficient.

## 4. Domain rules (precise — from PLAN §3/§7)

- **Times** are `HH:mm` 24h; overlap is **half-open `[start, end)`** (back-to-back ≠ clash).
- **day_of_week** of a date is computed in **CENTER_TZ** (never UTC).
- A rule is **active on a date** iff `effective_from ≤ date ≤ (effective_to or ∞)` and
  `day_of_week(date) == rule.day_of_week`.
- A **session is frozen** iff it has ≥1 Attendance row, OR its date < today (CENTER_TZ),
  OR `status == cancelled` (manually cancelled). Frozen sessions are never edited/deleted
  by generation.
- **Clash:** two items clash iff same date ∧ time ranges overlap `[start,end)` ∧ they share
  a resource — room_id, teacher_id, or a student (via active Enrollments) — ∧ (for rules)
  effective ranges intersect. Room overlap additionally respects
  `room_changeover_buffer_min` (Config): a room is busy until `end + buffer`.

## 5. Algorithms

### 5.1 Generation (rules → Sessions), idempotent
Inputs: today (CENTER_TZ), horizon H (D-3). Window = `[today, today+H]`.
```
load Timetable rules, Holidays(set), Sessions (existing), Attendance(session_ids set)
desired = {}                      # key (slot_id, date) -> session fields
for rule in rules:
  for date in window:
    if date in Holidays: continue
    if day_of_week(date) != rule.day_of_week: continue
    if not (rule.effective_from <= date <= rule.effective_to or open): continue
    desired[(rule.slot_id, date)] = {date,batch,start,end,room,teacher,status:scheduled,source:recurring,slot_id}
existingByKey = index recurring Sessions by (slot_id, date)
for key, want in desired:
  cur = existingByKey.get(key)
  if not cur: APPEND want                      # new session
  elif cur is frozen: skip                     # never touch
  elif cur != want: UPDATE cur in place        # rule changed -> refresh future session
# orphans: recurring sessions in window whose (slot_id,date) not desired (rule moved/expired/holiday added)
for cur in recurring Sessions in window not in desired:
  if cur is frozen: skip
  else: DELETE or CANCEL per D-4 / D-8
# adhoc sessions: never touched by generation
```
Properties: re-running with unchanged rules ⇒ zero writes (idempotent). Never duplicates
(keyed by slot_id,date). Never overwrites attendance-bearing / past / manually-cancelled.

### 5.2 Clash detection
- **Write-time** (when creating/editing a rule, or adding an adhoc/extra session): compute
  clashes of the candidate against existing rules (date-range aware) and against generated
  sessions in window. Return list of {resource, with, when}. Student clash → **warn**
  (allow save). Room/teacher clash → **D-2**.
- **Read-time "schedule health"** report (owner): scan generated Sessions in a window for any
  clash (catches direct-Sheet edits). Pure read, no writes.

### 5.3 Rule edit-in-place (PLAN §3 #7)
Editing a rule writes the new values to the `Timetable` row, then runs generation (5.1)
for the window. Because frozen sessions are skipped, only **future, attendance-free** sessions
of that slot are refreshed; past + attendance-bearing are frozen. Expiring a rule = set
`effective_to`; generation removes/cancels its now-undesired future sessions (D-8).

## 6. Surfaces (UI) & entry points

- **Timetable view** (`/timetable`, owner): weekly grid (Mon–Sat × time) of rules; each cell =
  batch · room · teacher. Shows clash badges.
- **Rule editor:** create / edit / expire a rule (batch, day(s), start, end, room, teacher,
  effective_from/to). Live clash warnings before save.
- **Generate button** (owner): "Generate sessions" → runs 5.1 for the horizon; shows
  added/updated/removed counts.
- **Schedule-health** panel (owner): read-time clash report.
- **Cron**: nightly auto-generation (same code as the button).
- Existing **/new-session** (adhoc) stays; gains write-time clash warning.

## 7. Cron job (Vercel)
- `vercel.json` → `{ "crons": [{ "path": "/api/cron/generate", "schedule": "0 1 * * *" }] }`
  (01:00 UTC nightly). **Note: Hobby plan runs crons at most once/day — fine for nightly.**
- Endpoint `GET /api/cron/generate` verifies `Authorization: Bearer ${CRON_SECRET}`
  (new env var, all envs), then runs generation. Manual button calls a server action that
  runs the same function (owner-gated).

## 8. New data/server functions
- `data.ts`: `getRules()`, `createRule()`, `updateRule()`, `expireRule()`,
  `generateSessions(window)` → {added,updated,removed}, `detectClashes(candidate)`,
  `scheduleHealth(window)`, `dayOfWeekInTz(date)`.
- `sheets.ts`: `deleteRows(tab, rowNumbers)` (for orphan removal — descending delete).
- `actions.ts`: `saveRule`, `expireRuleAction`, `runGeneration` (owner).
- `app/api/cron/generate/route.ts` (nodejs runtime, CRON_SECRET).

## 9. Blockers & risks (explicit)

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Sessions lacks slot_id** (blocker) | B0 schema migration + backfill (with restore) |
| R2 | Sheets has **no transactions**; cron + manual generation could overlap | generation is idempotent (safe to double-run); accept last-write; optional Config `gen_lock` flag |
| R3 | Generation **write volume** (many rows over horizon) | batch writes (batchUpdate/append); 30-day horizon keeps it small |
| R4 | **Deleting orphan** sessions shifts row indices | delete descending; or prefer **cancel** over delete (D-8) to avoid row churn |
| R5 | **Timezone** day-of-week wrong → wrong day's classes | dayOfWeekInTz via Intl + CENTER_TZ; unit-checked |
| R6 | Hobby **cron cadence** (daily only) | nightly is daily — fits; manual button covers on-demand |
| R7 | Clash detection **O(n²)** | one centre, small N — fine; window-scoped |
| R8 | Rule edit could **wipe** a session that has attendance | "frozen" guard in generation; covered by tests |
| R9 | Existing seeded sessions vs new generation | B0 backfill makes them generation-managed; or treat pre-today as frozen (they are: date<today) |
| R10 | Owner accidentally expires a rule mid-term | expire only affects **future, attendance-free**; past preserved |

## 10. Decisions needed (confirm before build)

- **D-2** Room/teacher clash on save: **block** vs warn? → rec **block** (room+teacher), **warn** (student).
- **D-3** Generation horizon: **30 days** rolling? cron time? → rec 30d, 01:00 local-ish.
- **D-4 / D-8** Undesired future session (holiday added, rule moved/expired) with **no attendance**:
  **delete** vs mark **cancelled**? → rec **delete** (clean grid); attendance-bearing always kept.
- **D-6** Confirm adding **`slot_id`** column to `Sessions` (schema migration). → required.
- **D-10** Apply `room_changeover_buffer_min` to room clash (default 0). → rec yes.

## 11. Milestones (incremental, each shippable + tested)

| ID | Scope | Dep | Acceptance |
|---|---|---|---|
| **B0** | Add `slot_id` to Sessions; backfill; update types/reads/writes | — | every recurring session has a valid slot_id; adhoc blank; app unaffected (build + live read test) |
| **B1** | Generation engine + manual "Generate" button (owner) | B0 | run twice ⇒ 2nd run writes 0 (idempotent); new rule ⇒ creates only its future sessions; attendance-bearing untouched |
| **B2** | Holiday suppression + effective_from/to in generation | B1, Holidays data | session on a holiday not created; out-of-range dates skipped |
| **B3** | Clash detection: write-time warnings + read-time health report | B0 | seeded grid = 0 clashes; injecting an overlap is flagged with resource+when |
| **B4** | Timetable grid view + rule create/edit-in-place/expire | B1,B3 | edit a rule's time ⇒ future sessions move, past frozen; expire ⇒ future-no-attendance removed |
| **B5** | Cron `/api/cron/generate` + CRON_SECRET + vercel.json | B1 | secured (401 without bearer); nightly runs generation |
| **B6** | Schedule-health panel (owner dashboard/timetable) | B3 | lists any current clashes, or "healthy" |

**Order:** B0 → B1 → B2 → B3 → B4 → B5 → B6. Each builds, deploys, and is live-tested
(throwaway write tests with restore, as in Milestone A) before the next.

## 12. Re-audit log
- **Data axis:** Sessions gains slot_id (B0); Timetable read+CRUD (B4); generation writes Sessions (B1). ✓
- **Story axis:** owner "set up my weekly timetable", "regenerate", "see clashes"; teacher unaffected (still marks generated sessions). ✓
- **Lifecycle axis:** session states (scheduled/extra/cancelled) + frozen rule; rule effective lifecycle (active→expired); generation idempotency. ✓
- **Non-functional:** N1 tz (R5), N2 owner-gating on rule/generation actions + cron secret (B5), N4 validation (rule fields, time order start<end), N7 referential (rule→batch/room/teacher exist) + read-time health (B6), N8 horizon bounds write volume (R3). ✓
- **Locked-decision:** #6 ✓ (B1), #7 ✓ (B4 edit-in-place/frozen), #8 ✓ (B3 student warn), #9 ✓ (D-10 buffer). ✓
- **Adversarial re-walk:** caught & specced — orphan-removal row-shift (R4), cron/manual overlap (R2), seeded-vs-generated reconciliation (R9, B0 backfill), expire mid-term safety (R10), back-to-back not a clash (half-open). No new gaps.
