# KLiXO Coach — status & resume guide

Coaching-centre attendance + timetable. Next.js 16 (App Router, TS, Tailwind) on
Vercel + Google Sheets as the DB (service account). One deployment = one centre.

> This file = where we are + how to resume. **BUILD.md** = full audited coverage
> matrix + milestones. **docs/timetable-engine.md** = the timetable-engine spec.
> Product spec / locked decisions live in the master PLAN.md (in ~/Documents,
> outside this repo).

_Last updated: 2026-06-25._

## Where things live (important)

- **Code repo: `~/klixo-coach`** (NOT in `~/Documents` — that folder is TCC-locked
  for this machine; Next.js/Turbopack builds fail there. Keep the repo here.)
- **Live:** https://klixo-coach.vercel.app · **GitHub:** Tjmafiabug/klixo-coach (private)
- **Vercel:** scope `tjmafiabugs-projects`, project `klixo-coach`, GitHub auto-deploy on push.
- **Sheet (DB):** ID `1MF9rwmg2Z_P8fLnjTY35IphIBmaolIbeMLm848ButBw`; service account
  `lead-scraper@webdev-agency-lead-tool.iam.gserviceaccount.com`; key at
  `/Users/ai-labs/lead-scraper/credentials.json` (never commit).
- **Env** (Vercel + `.env.local`): `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` (sensitive),
  `CENTER_TZ=Asia/Kolkata`, `SESSION_SECRET`, `CRON_SECRET`.
- **Git identity for commits: Tjmafiabug** (`176820294+Tjmafiabug@users.noreply.github.com`),
  NOT the global `kunwersachdev`.
- **Deploy:** `git push` (auto) and/or `vercel --prod --yes` from the repo.

## Demo login (all PIN `1234`)

| Role | Phone | Lands on |
|---|---|---|
| Owner (Priya Menon, also teaches Maths) | `9876500001` | Dashboard |
| Teachers (Rajesh/Anjali/Vikram/Sneha/Arjun) | `9876500002`–`06` | Today |

`Config.demo_today=2026-06-24` pins "today" so seeded sessions show (real
deployments omit it → real centre-local today). Data = "Brilliant Minds Coaching
Centre": 60 students, 6 teachers, 12 batches, 4 rooms, full timetable, ~500
sessions (incl. 30-day generated horizon), ~2.4k attendance rows.

## DONE

**Phase 0 MVP**
- Phone+PIN auth (bcrypt + signed-JWT httpOnly cookie); owner/teacher roles; guard in (app) layout.
- Teacher: today's sessions (centre tz) → tap-mark (Present/Absent/Late) → write to Sheets.
- Owner dashboard: overall %, defaulters <threshold, per-batch bars, manual-mark audit (with reasons).
- Professional UI redesign (Inter, tokens, mobile-friendly).

**Milestone A — past sessions + correction**
- Date navigation on Today (past view; future disabled). Open any past class.
- Auto-detected `method`: today=app; past-unmarked=backfill(manual+shared reason);
  re-mark changed student=manual+per-student reason; unchanged rows untouched.
- In-place attendance writes (no duplicate rows). Enrollment-window roster (late joiners excluded).
- Mark page blocks cancelled/future. Session controls (cancel/substitute) hidden on past.

**Milestone B — timetable engine** (the locked decision; was seeded, now generated)
- `slot_id` links each session to its Timetable rule (B0 migration done).
- Generation: rules → dated Sessions over a 30-day horizon; idempotent; holiday
  suppression; effective-date ranges; **orphan removal**; never overwrites frozen
  (attendance/cancelled/past) or substituted sessions.
- Clash detection (room/teacher block, student warn; half-open intervals; room buffer):
  write-time guard on adhoc + rule create/edit; read-time schedule-health.
- Timetable UI (owner): `/timetable` grid + clash banner, create / **edit-in-place
  (regenerate future only, past frozen)** / expire rules.
- Owner **Generate** button + **nightly cron** (`/api/cron/generate`, Bearer CRON_SECRET).
- Dashboard schedule-health banner.

**Code review (max-effort) — all 10 findings fixed**
substitute-preservation on rule edit, cancelSession authz guard, safe JSON.parse,
rule effective-range validation, latest-mark tiebreak, midnight-rollover fallback,
single-read dashboard, single backfill input, padded adhoc ids, quoted tab ranges.
Each milestone was live-tested against the Sheet (with restore) before deploy.

**Milestone C — owner data management** (zero-Sheet operation) — _code-complete &
build-verified; NOT yet live-tested against the Sheet or deployed._
- `/manage` hub + owner nav (Today/Dashboard/Timetable/Manage). Every C action
  re-checks owner role server-side (N2) and validates inputs (N4) before writing.
- C1 Students: list, create, edit, activate/deactivate; profile page = enrollments +
  attendance history + % (owner-only; PII stays owner-only, N3).
- C2 Batches: list, create, edit, activate/deactivate (assigned teacher stays
  selectable even if deactivated, so an edit can't silently reassign).
- C3 Enrollments: enroll from both the batch and the student side; duplicate-active
  guard; student timetable-clash **warn**; end = stamp end_date + status `left`.
  Roster inclusion is window-based (`enrollmentOnDate`: in-window incl. ended; only
  `inactive` voided) so past correction still sees an ended student (N11).
- C4 Teachers: list, create (with PIN), edit, PIN reset, activate/deactivate, with
  **last-active-owner guard** (role + deactivate) and phone uniqueness.
- C5 Rooms: list, create, edit, delete (blocked while any active batch/rule uses it).
- C6 Holidays: list, add/remove → calls generateSessions (suppress / restore future,
  attendance-bearing frozen).
- C7 Settings: edit Config (centre name, attendance threshold, changeover buffer,
  week start, timezone*, logo URL). *tz here is informational — live clock = CENTER_TZ env.
- Shared: `components/SubmitButton` (pending state), `ui.Banner`/`ActiveChip`/`fieldClass`.

**Milestone D — hardening** (zero-Sheet trust) — _code-complete & build-verified;
NOT yet live-tested or deployed._
- N3 PII: teacher surfaces (today/roster/mark) are names-only; student profile + phone
  numbers live only under owner-guarded `/manage`; `/api/center` now session-gated.
- N4: every write validates server-side (attendance status enum; C-write field checks).
- N5: `app/global-error.tsx` + `(app)/error.tsx` (Next 16 prop is **`unstable_retry`**,
  not `reset`) + `app/not-found.tsx` + `(app)/loading.tsx` skeleton.
- N7 referential integrity: write-time `refsExist` guard on enroll/batch/rule/extra-class;
  read-time `integrityIssues` scan (dangling refs) surfaced on the dashboard.
- N9: in-memory per-phone login lockout (`lib/rate-limit.ts`, 5 fails → 15-min lock;
  per-process — persistent store is a Phase-3 upgrade).
- N11: roster inclusion is window-based (`enrollmentOnDate`) end-to-end.
- N12: marking blocked for cancelled + future sessions; enroll-window via the roster gate.
- **N8 (attendance archival / dashboard pagination) deferred → Phase 3/G** (only open item).

## NOT done / NEXT (resume here)

Next: **live-test Milestones C + D against the Sheet (with restore) → deploy**, then:

Recommended order (see BUILD.md for full specs + acceptance):
- **E — Phase 1 (sellable):** WhatsApp absent alerts + monthly summary, fees module,
  per-centre branding, reports/exports (CSV/PDF).
- **F/G:** exams/report-cards, parent view, roles/permissions; then one-click
  provisioning, CSV import, billing, admin console.

### Known small items (low priority, noted)
- Recurring session ids could approach the adhoc `9000+` range after ~years of daily
  generation (namespace, not urgent).
- Attendance grows unbounded (nightly generation + marks) — archival is in D.
