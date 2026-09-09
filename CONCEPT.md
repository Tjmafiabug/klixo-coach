# KLiXO Coach — Concept Note

> A blueprint of *what the product is and every screen it has*, written so you can
> rebuild the whole thing as a static HTML/CSS UI (no backend, mock data inline).
> This maps the real app as built. Design tokens live in `design.md`/`skill.md`.

---

## 1. What it is

**Attendance + timetable + fees + curriculum manager for a single coaching centre.**

- **One deployment = one centre.** No multi-tenant switching, no org picker.
- The real app uses Google Sheets as an invisible backend. For an HTML mock,
  replace every "reads from Sheet" with a hardcoded JS array — the UI never
  shows the backend.
- Mobile-first (teachers mark on phones); owners use desktop for management.

**Tagline:** *Teachers mark the batch. Owners see who showed up, who owes money,
and how far the syllabus has gone.*

---

## 2. Who uses it (two roles)

| Role | Lands on | Can see |
|------|----------|---------|
| **Teacher** | `/today` | Only their own day: today's sessions, mark attendance, start an extra class. **No** management screens. |
| **Owner** | `/dashboard` | Everything — all teacher screens **plus** Dashboard, Timetable, and the whole **Manage** section. |

Auth = **phone number + 4-digit PIN**. For the mock: a login screen that always
"succeeds" into the app. Owner phone `9876500001`, teacher phones `…002–006`,
demo PIN `1234`.

Most nav items are **owner-only**. A teacher logged in sees a much shorter sidebar.

---

## 3. Navigation (the app shell)

Persistent left sidebar (collapses to bottom/hamburger on mobile). Two groups:

**Top level**
- **Today** — Mark attendance for the day *(everyone)*
- **Dashboard** — Attendance health across the centre *(owner)*
- **Timetable** — Recurring schedule & clashes *(owner)*

**Manage** *(all owner-only)*
- **Students** — Roster & enrollments
- **Batches** — Classes, fees & curriculum progress
- **Fees** — Dues, payments & defaulters
- **Curriculum** — Syllabus & chapters by class
- **Teachers** — Staff & PINs
- **Rooms** — Rooms & capacity
- **Holidays** — Non-teaching days
- **Settings** — Centre name, threshold & term

Header shows the active screen's title + one-line description, plus a user menu
(name, role, logout).

---

## 4. Data model (mock these as JS arrays)

Ten entities. Field names below = what the UI renders.

- **Teacher**: `name, phone, role(teacher|owner), subjects, active`
- **Student**: `name, phone, guardian, active` (+ enrollments link to batches)
- **Batch** (a class): `name, subject, teacher, room, schedule, monthly_fee`
- **Enrollment**: student ↔ batch, with a **join date** (late joiners excluded
  from earlier rosters)
- **Room**: `name, capacity`
- **Timetable rule**: recurring slot → `batch, day(s), start, end, room, teacher,
  effective_from/to`
- **Session**: one dated class instance (generated from a rule) →
  `date, time, batch, teacher, room, status(scheduled|cancelled|substituted)`
- **Attendance**: per student per session → `status(present|absent|late), method,
  reason`
- **Holiday**: `date, name` (suppresses session generation)
- **Course/Chapter** (curriculum): syllabus per class, chapters marked done per
  batch → progress %
- **Fees**: two ledgers — **charges** (monthly/admission/exam/other/discount) and
  **payments** (cash/upi/card/bank/cheque). Balance = charges − payments.

---

## 5. Every screen (build these)

### A. Login `/login`
Centre logo, phone field, 4-digit PIN field, sign-in button. Ambient gradient
background. → routes to Today (teacher) or Dashboard (owner).

### B. Today `/today` *(everyone — the teacher's home)*
- **Date navigator** (prev/next day; future days disabled).
- List of the day's **sessions** as cards: batch name, time, room, teacher,
  status pill. Tap a card → Mark screen.
- Button: **New session / extra class**.
- Past days are read-only-ish (you can still correct attendance, but session
  controls like cancel/substitute are hidden).

### C. Mark attendance `/mark/[sessionId]` *(everyone)*
- Header: batch, date, time, room.
- **Roster** = students enrolled *as of that date*. Each row: name + three
  tap targets **Present / Absent / Late**.
- Submit writes attendance. Re-marking a student later asks for a **reason**
  (audit trail). Backfilling a past unmarked class asks for one shared reason.
- **Session admin** (today only, hidden on past): **Cancel session**,
  **Set substitute teacher**.

### D. New session `/new-session` *(everyone)*
Form: pick batch, date, time, room, teacher → creates a one-off extra class.

### E. Dashboard `/dashboard` *(owner)*
The owner's command center:
- **KPI cards**: overall attendance %, # defaulters (below threshold),
  active students/batches.
- **Per-batch attendance bars** (each batch's % with a colored bar).
- **Defaulters list** — students under the attendance threshold.
- **Curriculum progress rollup** — syllabus % across batches.
- **Manual-mark audit** — list of corrections with their reasons.

### F. Timetable `/timetable` *(owner)*
- View of all **recurring rules** (weekly grid or list): batch, day, time, room,
  teacher.
- **Clash detection** banner: room double-booked / teacher double-booked (blocked)
  or student overlap (warning).
- `/timetable/new` and `/timetable/[slotId]` — add / edit a rule (the `RuleForm`:
  batch, days, start, end, room, teacher, effective dates).
- Generating sessions from rules is a backend action; in the mock just show the
  rules + a "Generate sessions" button that does nothing.

### G. Manage — Students
- `/manage/students` — searchable table: name, phone, guardian, batches, status.
  Export button (CSV).
- `/manage/students/new` — add student form.
- `/manage/students/[id]` — **student profile**: details, enrollments,
  attendance %, **fee ledger** (charges + payments + running balance).

### H. Manage — Batches
- `/manage/batches` — table of classes: name, subject, teacher, room, schedule,
  monthly fee, # students.
- `/manage/batches/new` — create batch.
- `/manage/batches/[id]` — batch detail: roster, schedule, fee.
- `/manage/batches/[id]/progress` — **curriculum progress** for this batch
  (chapters done / total).

### I. Manage — Fees `/manage/fees` *(the money screen)*
- **Period selector** (month picker — scopes the KPIs).
- **KPI cards**: expected collection, collected, outstanding, students with dues.
- **Defaulters table**: student, amount owed, last payment.
- Per-student drill-down → fee ledger (charges, payments, balance).
- Export defaulters (CSV).
- Add charge / record payment forms.

### J. Manage — Curriculum
- `/manage/curriculum` — list of **courses/syllabi** by class.
- `/manage/curriculum/new`, `/[id]`, `/[id]/edit` — CRUD a course.
- `/[id]/chapters/[chapterId]` — chapter detail; mark chapters complete to drive
  the progress %.

### K. Manage — Teachers
- `/manage/teachers` — staff table: name, phone, role, subjects, active.
- `/manage/teachers/new`, `/[id]` — add / edit; set PIN; activate/deactivate.
  (Guard: can't deactivate the last owner.)

### L. Manage — Rooms
- `/manage/rooms` — rooms + capacity + current usage.
- `/manage/rooms/[id]` — edit; delete (blocked if in use).

### M. Manage — Holidays `/manage/holidays`
List of non-teaching days (date + name); add/remove. These suppress session
generation.

### N. Manage — Settings `/manage/settings`
Centre name, attendance threshold %, term/dates.

### O. Empty / error / loading states
- `not-found`, `global-error`, per-section `error.tsx` + `loading.tsx`.
  For the mock: a 404 page, an error page, skeleton loaders.

---

## 6. Cross-cutting UI behaviors

- **Attendance pills**: Present (green), Late (amber), Absent (red).
- **Status pills** on sessions: scheduled / cancelled / substituted.
- **Threshold coloring**: attendance below the centre threshold is highlighted
  red throughout (dashboard, defaulters).
- **Export buttons**: appear on tables (Attendance, Defaulters, Batches, Student,
  Fees) — render as a button; in the mock they can be no-ops or download a static
  CSV.
- **Avatars**: initials in a colored circle when no photo.
- **Currency**: ₹ (INR), integer rupees.
- **Money is append-only**: charges and payments are never edited, only added or
  voided — show them as an immutable ledger.

---

## 7. What to mock vs. skip (for the HTML build)

**Build (UI only):** every screen in §5, the sidebar shell, role-switched nav,
all tables/cards/forms/pills, KPI cards, progress bars, empty/loading/error
states.

**Fake with static data:** all lists (students, batches, sessions, fees…) →
inline JS arrays. One owner + one teacher view.

**Skip entirely (backend concerns):** auth/PIN hashing, Google Sheets,
session generation engine, clash *computation* (just show a sample clash banner),
CSV generation, timezone "today" logic (hardcode a demo date like `2026-06-24`).

**Demo dataset to seed the mock** (matches the real demo): "Brilliant Minds
Coaching Centre" — 60 students, 6 teachers, 12 batches, 4 rooms, full timetable.

---

## 8. One-paragraph summary

KLiXO Coach is a single-centre coaching-management web app with two roles.
**Teachers** open *Today*, see their dated classes, and tap Present/Absent/Late
on the batch roster (corrections leave an audit reason). **Owners** get a
*Dashboard* (attendance %, defaulters, per-batch bars, curriculum rollup), a
*Timetable* of recurring rules with clash detection, and a *Manage* section for
Students, Batches, Fees (charges/payments/defaulters ledger), Curriculum
(syllabus + chapter progress), Teachers, Rooms, Holidays, and Settings. Mobile-
first, ₹-denominated, with CSV exports on the data tables.
