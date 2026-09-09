# KLiXO Coach — Build Plan (Frappe-inspired features)

> How we close the gap with Frappe LMS / Edmingle **without** rebuilding Frappe.
> Grounded in the app as it exists today (Next.js 16, React 19, Tailwind 4,
> Google Sheets backend, one deployment = one centre).
> Date: 2026-07-04

---

## 0. Guiding principles (read first)

1. **Don't merge Frappe.** Frappe is a Python/MariaDB monolith. klixo-coach is
   Next.js + Sheets. We **port features**, we do not bolt on Frappe.
2. **Leverage data we already store.** Attendance, fees, and syllabus progress
   already live in Sheets. The highest-value features just *expose* that data to
   students/parents — near-zero new data, huge perceived value.
3. **Stay single-centre.** No multi-tenant. One deployment = one centre stays true.
4. **Respect the Sheets ceiling.** Sheets is fine for roster/fees/attendance.
   It is **not** fine for video hosting or thousands of quiz answers. Where we hit
   that ceiling (heavy online learning), we run Frappe LMS *alongside* instead of
   forcing it into Sheets (see §6).
5. **Money stays append-only.** Every fee/payment/txn is an immutable ledger row,
   as today. New payment features append, never edit.

---

## 1. Current state (what exists)

Roles: **owner**, **teacher**. Auth = phone + 4-digit PIN (`src/lib/auth.ts`).

Built screens: Today, Dashboard, Timetable (+clash), Mark attendance, New session,
Manage → Students / Batches / Fees / Curriculum / Teachers / Rooms / Holidays /
Settings / PTM / Staff (attendance, tasks, payroll).

Data (Sheets tabs, `src/lib/types.ts`): Staff, Student, Batch, Enrollment, Room,
TimetableRule, Session, AttendanceRow, Course, Chapter, BatchProgressRow, Fee
charges + payments, PTM, StaffAttendance, StaffTask, Salary.

**Strength:** running a physical centre (attendance, timetable, fees, staff).
**Gap:** everything student-facing (login, tests, material, online payment).

---

## 2. The gap vs Frappe (what we're adding)

| Missing | Frappe has | We add as |
|---|---|---|
| Student/parent login | Student portal | **Phase 1 — Portal** |
| Online fee payment | Razorpay via payments app | **Phase 2 — Pay online** |
| Online tests / MCQ | Quiz engine | **Phase 3 — Tests** |
| Study material to students | Course lessons/video | Phase 4 (or run Frappe) |
| Homework submission | Assignments | Phase 4 |
| Certificates | Auto certificates | Phase 4 |
| Rich student profiles | cf_1..cf_5 fields | Folded into Phase 1 |

---

## 3. PHASE 1 — Parent / Student Portal  ⭐ (do first)

**Why first:** highest value, lowest cost. Uses data we already have. This is the
single change that makes klixo "feel like a real product" to a centre owner,
because it stops the daily parent phone calls.

### Scope
A **read-only** portal where a student (or parent) logs in and sees only their own:
- Attendance % + recent present/absent/late history (per batch).
- Fee status — what's charged, paid, and **outstanding balance**.
- Syllabus progress — how far each enrolled batch has covered the curriculum.
- PTM notes / upcoming PTM (data already in `PtmRow`).
- Timetable — their upcoming sessions.

### Auth changes (`src/lib/auth.ts`)
- Add a third role: **`student`** (or `guardian`).
- Login stays phone + PIN. A student's phone = `Student.phone` (or `guardian`).
  Generate a PIN per student (store hashed, same bcrypt path as staff).
- On login, role `student` → route to `/portal` (never the manage app).
- Harden: a student token must be **scoped to their own `studentId`**. Every
  portal data read filters by that id server-side. This is the one real security
  surface — treat it like a trust boundary, no client-supplied studentId.

### Routes (new route group `src/app/(portal)/`)
```
/portal                → home: attendance %, fee due, next class (KPI tiles)
/portal/attendance     → history list + per-batch %
/portal/fees           → ledger (charges, payments, balance) + Pay button (Phase 2)
/portal/progress       → syllabus % per enrolled batch
/portal/timetable      → upcoming sessions
/portal/profile        → their details (read-only or limited edit)
```

### Data
**No new tables.** New reads in `src/lib/data.ts`, all filtered by `studentId`:
- `getStudentPortalSummary(studentId)` — reuse existing attendance + fee rollups,
  scoped to one student.
- Add a `student_pin` (hashed) + optional `guardian_pin` column to the Student tab.

### Effort
Medium. ~6–8 new pages (mostly read-only), 1 auth change, ~5 scoped data
functions. No new infra. **This is the anchor deliverable.**

---

## 4. PHASE 2 — Online fee payment (Razorpay)  ⭐

**Why:** klixo already *tracks* dues. This turns tracking into **collecting**.
Direct money value, and it plugs straight into the portal fee page.

### Scope
- "Pay ₹X now" button on `/portal/fees` (and owner can send a pay link).
- Razorpay Checkout → on success, **append a payment row** to the fees ledger
  (method = `upi`/`card` via Razorpay), mark against the charge.
- Owner sees the payment appear in Manage → Fees automatically (same ledger).

### How (Razorpay, not Frappe's payments app — we're native Next.js)
1. `POST /api/pay/order` — server creates a Razorpay **order** for the outstanding
   amount (Razorpay Node SDK, keys in env). Store order id.
2. Frontend opens Razorpay Checkout with the order.
3. `POST /api/pay/webhook` — verify Razorpay **signature** (HMAC), then append the
   payment to the Sheets fees ledger + mark reconciled. **Verify signature
   server-side — this is a money trust boundary, never trust the client callback.**
4. Idempotency: dedupe by Razorpay payment id so a retried webhook can't
   double-credit.

### Data
- New Sheets tab **`payment_txn`**: `txn_id, student_id, charge_ref, amount,
  razorpay_order_id, razorpay_payment_id, status, created_at`. Links to the
  existing payments ledger (don't fork the ledger — append to it on success).

### Effort
Medium. 2 API routes + Razorpay SDK + signature verify + ledger append. The
security (signature + idempotency) is the part to get right, not the UI.

### Guard
Per Tanishq's money rules: Razorpay account = the **centre's own** account, keys
in that centre's env. klixo never holds the money.

---

## 5. PHASE 3 — Online tests / quizzes

**Why:** coaching = tests. Frappe's engine is strong; we build a **lean** version
that fits Sheets and the phone-first teacher/student flow.

### Scope (deliberately smaller than Frappe)
- Owner/teacher builds an **MCQ test**: questions, 4 options, correct answer,
  marks, optional negative marking, time limit, which batch(es) it's for.
- Student takes it on their phone from the portal. Auto-scored on submit.
- Results: per-student score + a class leaderboard/average feeds the Dashboard.

### What we copy from Frappe (learned from its source)
- Per-question marks, pass %, **negative marking**, attempt limit. (Good ideas.)
- **Server-side scoring** (Frappe scores server-side — we do too; never trust the
  client's score).

### What we skip (Frappe's weak/heavy bits — confirmed in its code)
- No fuzzy short-answer matching (Frappe's is non-deterministic). MCQ + exact
  numeric only.
- No programming-exercise runner (Frappe offloads to an external server — skip).
- **Timed exam is best-effort** (like Frappe, a real proctored timer needs more).
  State this limit to clients — don't sell it as secure invigilation.

### Data (new Sheets tabs)
- **`test`**: `test_id, title, batch_id, total_marks, pass_pct, negative_marking,
  marks_to_cut, duration_min, published`
- **`question`**: `question_id, test_id, text, opt_a..d, correct, marks`
- **`attempt`**: `attempt_id, test_id, student_id, score, submitted_at`
- **`answer`**: `attempt_id, question_id, chosen, correct(bool)`

⚠️ **Sheets ceiling:** fine for a few hundred students × modest tests. If a client
runs 5,000-student mock-test blasts, `answer` rows explode — that's the signal to
move tests to a real DB (Neon Postgres) or run Frappe. Note it, don't pre-build.

### Effort
Medium–high. New entities, a builder UI (owner), a taker UI (student, phone),
scoring logic, results into Dashboard.

---

## 6. PHASE 4 — Later / run-Frappe-instead

These are where Sheets is the wrong tool. Build only if a client pays for them;
prefer **running Frappe LMS alongside** (shared student list) over rebuilding:
- **Study material delivery** (video/PDF/notes to students) — video ≠ Sheets. Use
  Frappe or object storage + a simple lessons table.
- **Homework/assignment submission + grading** — doable native, medium effort.
- **Certificates** — auto-generate PDF on course/batch completion. Small, native OK.

Decision rule: **content delivery at scale → Frappe next door. Ops + light
student-facing → native klixo.**

---

## 7. Cross-cutting work

- **WhatsApp alerts** (already planned `features.md`): fee due, absence, PTM,
  test result → parent's WhatsApp. Pair with Phase 1/2. Use an official WhatsApp
  Business API (no ToS-risky automation, per office rules).
- **Notifications table** for the portal bell.
- **Rich student profiles** — add fields (DOB, address, school, guardian email);
  folds into Phase 1 profile page.
- **Auth hardening** — student tokens scoped to own id; rate-limit portal login
  (`src/lib/rate-limit.ts` already exists — reuse).

---

## 8. Sequencing & effort

| Order | Phase | Value | Effort | Why here |
|---|---|---|---|---|
| 1 | Parent/Student Portal | ★★★★★ | Medium | Uses existing data, biggest "pro" jump |
| 2 | Online fee payment | ★★★★★ | Medium | Turns tracking into revenue; plugs into portal |
| 3 | Online tests | ★★★★☆ | Med-High | Core coaching, but new data + UIs |
| 4 | Material / homework / certs | ★★★☆☆ | High | Sheets ceiling; prefer Frappe alongside |
| — | WhatsApp + profiles | ★★★★☆ | Low-Med | Bolt onto 1–2, cheap polish |

**Recommended first ship:** Phase 1 + WhatsApp absence/fee alerts. That single
release changes how the product *feels* to an owner and a parent.

---

## 9. Explicit non-goals

- No multi-tenant / multi-branch (stays single-centre).
- No rebuilding Frappe's video LMS or programming-exercise runner in Sheets.
- No "secure proctored exam" claims — the test timer is best-effort.
- No editing money rows — append-only ledger stays.

---

## 10. Open questions for Tanishq

1. Portal login for the **student**, the **parent**, or both? (Changes PIN model.)
2. Razorpay account = per-centre client account, confirmed? (Money rule.)
3. Tests: MCQ-only to start, or also numeric-answer? (Scope of Phase 3.)
4. Do any target clients actually need video courses? (Decides Frappe-alongside.)
