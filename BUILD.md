# KLiXO Coach — Build Plan (authoritative, audited)

> Companion to PLAN.md (product spec / locked decisions). PLAN.md = *what & why*.
> BUILD.md = *exact scope, coverage, status, acceptance* — the source of truth for
> "what is done / what is missing." Updated every build.

## 0. How this plan stays complete (the discipline)

A feature is **only** "covered" if it has a concrete app surface. No implied coverage.
Completeness is derived from **five independent axes** — a gap is anything present in
an axis but missing from the feature list:

1. **Data axis** — every entity (10 tabs) × {read, create, update, deactivate} × actor.
2. **Story axis** — every job a teacher / owner actually does.
3. **Lifecycle axis** — every state machine (session, enrollment, attendance, rule, auth).
4. **Non-functional axis** — tz, access control, validation, errors, integrity, audit, perf, PII, security.
5. **Locked-decision axis** — every PLAN.md §3 decision maps to a feature that honors it.

Re-audit = re-walk all five axes against the assembled plan; fold in anything new.
The re-audit log (§9) records what each pass caught.

## 1. Definitions

**Actors:** Teacher (marks own sessions), Owner (all + dashboard + management; may also teach),
System (generation job, future: alerts). Parent / front-desk = Phase 2, deferred.

**Phase 0 = "complete"** means: an owner can run the centre end-to-end from the app with
**zero raw-Sheet access** — set up teachers/students/batches/enrollments/rooms/holidays,
define the timetable, have sessions generated, mark & correct attendance (today and past),
and read the dashboard. The timetable **engine** (rules → generated sessions, holiday
suppression, clash detection, edit-in-place) is in-scope for Phase 0 because PLAN.md scopes
Phase 0 as "attendance **+ timetable** (with Sessions)".

**Status legend:** ✅ done · 🟡 partial · ⛔ not built · ⏭ deferred (with reason).

## 2. Coverage by entity (data axis)

| Entity | Read | Create | Update | Deactivate | Status | Surface |
|---|---|---|---|---|---|---|
| Config | ✅ | — | ⛔ edit settings | — | 🟡 | Settings (owner) |
| Teachers | ✅ login | ⛔ | ⛔ | ⛔ | ⛔ | Teacher mgmt + PIN |
| Students | ✅ roster | ⛔ | ⛔ | ⛔ | ⛔ | Student mgmt + profile |
| Batches | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | Batch mgmt |
| Enrollments | ✅ | ⛔ | ⛔ end | ⛔ | ⛔ | Enroll UI (batch & student) |
| Rooms | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | Room mgmt |
| Timetable (rules) | ⛔ | ⛔ | ⛔ edit-in-place | ⛔ expire | ⛔ | Timetable editor + clash |
| Sessions | 🟡 today only | ✅ extra | ✅ cancel/sub · ⛔ edit time/room · ⛔ generate | — | 🟡 | Session views + generation |
| Attendance | 🟡 today | ✅ today | 🟡 today only · ⛔ **past correction** | — | 🟡 | Past-session edit + history |
| Holidays | 🟡 seed | ⛔ | — | ⛔ | ⛔ | Holiday mgmt + suppression |

## 3. Non-functional checklist (non-functional axis)

| # | Item | Status | Note |
|---|---|---|---|
| N1 | "today"/dow/date in CENTER_TZ everywhere (PLAN §11) | 🟡 | done in marking; must hold in generation + past views |
| N2 | Access control on every **server action** (not just UI) | 🟡 | login guard exists; per-action role checks partial |
| N3 | Teachers must NOT see student phone numbers (owner-only) | ⛔ | roster shows names only ✅, but no student profile yet; enforce when built |
| N4 | Server-side validation on every write | ⛔ | actions trust inputs today |
| N5 | Empty / loading / error states on every screen | 🟡 | empty states partial; no loading skeletons; error.tsx missing |
| N6 | Audit fields (marked_by, method, timestamp, reason) on every attendance write | ✅ | |
| N7 | Referential integrity on writes (enrollment→student/batch, session→batch) | ⛔ | + read-time "schedule health" report (PLAN §7) |
| N8 | Attendance archival + dashboard read pagination/aggregation (PLAN §11) | ⛔ | dashboard reads ALL rows each load — slow at scale |
| N9 | Login lockout / rate-limit after N failed PINs (security) | ⛔ | |
| N10 | Concurrency: last-write-wins acceptable (low writer count) | ✅ | documented, fine per PLAN |
| N11 | Late-joiner % denominator starts at enrollment start_date | 🟡 | seed respects it; correction flow must too |
| N12 | Marking blocked for cancelled sessions / before enroll start / after end | ⛔ | |

## 4. Locked-decision conformance (locked-decision axis)

| PLAN §3 decision | Honored by | Status |
|---|---|---|
| One centre per build | architecture | ✅ |
| Teacher marks the batch | marking flow | ✅ |
| Next.js on Vercel | — | ✅ |
| Sheets via service account | lib/sheets | ✅ |
| Phone + PIN | auth | ✅ (add N9 lockout) |
| Recurring rules → generated Sessions | **timetable engine** | ⛔ Sessions seeded, not generated |
| Edit rule in-place; past frozen; regen future only | engine | ⛔ |
| Student clash = warn (owner override) | clash detection | ⛔ |
| Same-room changeover buffer (Config) | generation/clash | ⛔ unused |

## 5. Milestones (ordered, with dependencies)

- **A — Past sessions + attendance correction** *(closes the marking story; the found gap)*
  - Deps: none. Replaces the self-declared manual toggle with auto-detected `method`.
- **B — Timetable engine** *(the locked decision currently unmet)*
  - B1 rule data + read; B2 generation job (rules→Sessions, holiday suppression, effective ranges, idempotent, never overwrite attendance-bearing sessions); B3 clash detection (write-time + read-time health); B4 rule editor (edit-in-place → regen future only); B5 edit single session (time/room), uncancel.
  - Deps: Holidays mgmt (C), Rooms.
- **C — Data management (owner self-service)**
  - C1 Students (+ profile/history), C2 Batches, C3 Enrollments (+ student clash warn), C4 Teachers (+ PIN reset, last-owner guard), C5 Rooms, C6 Holidays, C7 Settings (Config).
  - Deps: none; B depends on C6+C5.
- **D — Hardening** N3,N4,N5,N7,N9,N12 + error.tsx/not-found + read-time health report.
- **E — Phase 1 (sellable):** WhatsApp absent alerts, fees, per-centre branding, reports/exports.
- **F — Phase 2 (sticky):** exams/marks, parent read-only, notes, roles/permissions.
- **G — Phase 3 (scale):** one-click provisioning, CSV import, billing, admin console, archival job (N8).

**Recommended sequence:** A → C6+C5 → B → rest of C → D → E…
(A first: independent + high value. C6/C5 before B: generation needs holidays + rooms.)

## 6. Detailed specs — next milestones

### A. Past sessions + correction
- **A1 Date navigation (Today page):** date picker; default = centre today (CENTER_TZ).
  Past dates allowed; future dates disabled (can't mark ahead). Shows that date's sessions
  for the actor (teacher = own; owner = all), each with marked/unmarked + present/total.
- **A2 Open any session → roster** with each student's **current saved status** prefilled.
- **A3 Save logic (replaces the toggle):** per-student `method` auto-set —
  - new mark on **today's** first save → `app`, no reason.
  - session date **< today** (backfill) **or** student's status **changed** from a saved value → `manual`, and that student requires a **reason** (per-student).
  - unchanged students keep their existing row untouched (no rewrite, no new timestamp).
- **A4 Guards:** block marking `cancelled` sessions; exclude students whose enrollment
  start_date > session date or end_date < session date (N11/N12).
- **Acceptance:** (1) open a class from 3 days ago, flip one student absent→present, save
  with reason → only that row becomes `manual` + reason, others unchanged, no duplicate rows.
  (2) future date shows no markable sessions. (3) re-open shows the corrected value.
  (4) dashboard manual audit shows the correction with its per-student reason.

### B. Timetable engine (summary specs; full spec when we reach it)
- **Generation idempotency:** a session is keyed by (rule-or-adhoc, date, batch). Re-running
  never duplicates, never edits a session that already has Attendance rows, never resurrects a
  manually `cancelled` session. Adds only missing future sessions within horizon.
- **Edit-in-place:** editing a rule sets new values from a date; regenerates **future**
  sessions only; sessions with attendance are frozen. (PLAN §3 #7)
- **Clash:** two items clash if same date ∧ time overlap `[start,end)` ∧ shared resource
  (room / teacher / a student via Enrollments) ∧ effective ranges intersect. Student → warn;
  room/teacher → **decision D-2**. Read-time health report catches direct-Sheet edits.
- **Holiday suppression:** generation skips Holidays; holiday added retroactively → **decision D-4**.

## 7. Non-goals (explicitly deferred, with reason)

- Student self-marking / QR / geofence — killed by PLAN §4.
- Parent & front-desk roles, exams, notes — Phase 2.
- One-click provisioning, billing, CSV import, multi-branch — Phase 3/4.
- Realtime collaboration / optimistic UI — concurrency is a non-issue (PLAN §5).
- Native app — Phase 4 (PWA later).

## 8. Open decisions (need owner input before the dependent milestone)

- **D-1 (A3):** when correcting, one reason per changed student (recommended) vs one reason per save? → recommend **per student**.
- **D-2 (B3):** room/teacher clash = **block** or **warn**? PLAN leaves TBD. → recommend **block** for room+teacher, **warn** for student.
- **D-3 (B2):** generation trigger = nightly cron **and** manual button? horizon = how many days ahead (e.g. 30)? → recommend **both, 30-day rolling**.
- **D-4 (B/holiday):** adding a holiday that already has generated sessions → auto-cancel those (keep ones that already have attendance) vs leave? → recommend **cancel future-only, keep attendance-bearing**.
- **D-5 (N3):** confirm teachers never see student phone numbers (owner-only). → recommend **yes**.

## 9. Re-audit log

**Pass 1 (data axis)** → produced the §2 matrix; caught: Sessions read = today-only, Attendance
update = today-only, all management surfaces missing.

**Pass 2 (story axis)** → caught: "correct a past mark" has no entry point (no past-session
view) — the reported gap → milestone **A**. Caught: owner can't onboard staff/students in-app → **C**.

**Pass 3 (lifecycle axis)** → caught: session states (scheduled/extra/cancelled) lack
uncancel + edit; rule edit-in-place regen-future-only unbuilt; auth lacks lockout (N9);
attendance correction state transition undefined → specced in A3.

**Pass 4 (non-functional axis)** → caught: N3 phone visibility, N4 server validation,
N7 referential integrity + read-time health report, N8 archival/pagination (dashboard reads
all rows), N11 late-joiner denominator, N12 cancelled/enroll-window guards, N5 error/loading states.

**Pass 5 (locked-decision axis)** → caught: the entire timetable engine (rules→sessions,
edit-in-place, clash, changeover buffer) is unbuilt though locked → milestone **B**;
Sessions are seeded, not generated.

**Pass 6 (adversarial re-walk of the assembled plan)** → caught and folded in:
(a) generation must not overwrite attendance-bearing or manually-cancelled sessions (B idempotency);
(b) holiday-added-retroactively edge (D-4); (c) future-date marking must be disabled (A1);
(d) correction must skip students outside their enrollment window (A4/N11);
(e) "total" in % = sessions the student was marked for — fully-marked sessions only; unmarked
today's sessions correctly excluded; (f) substitute teacher already overrides session.teacher_id
so a sub sees the class — consistent with A1's "owner = all, teacher = own".

**Pass 7** → no new gaps found across all five axes. Plan considered complete pending the
five **open decisions** in §8 (which are scope choices for the owner, not gaps).
