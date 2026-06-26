# Google integration & multi-tenant architecture

Status: decided 2026-06-26. Hosting model: **A (SaaS — one app serves many centres).**

This is the source-of-truth for how Klixo uses Google products and how it goes from
"one centre on the builder's own account" to "many paying centres."

---

## Two separate Google logins, two separate jobs

| Job | Auth | Whose storage | Notes |
|-----|------|---------------|-------|
| **Data** (students, batches, attendance, timetable) | Service account ("the robot") | A Sheet the centre owner creates and **shares** with the robot | Today's setup. The robot only ever **edits an existing** Sheet. |
| **File storage** (uploaded assignments, generated certificate PDFs) | **Owner OAuth** — the centre owner connects their own Google account once | The owner's own Drive (their free 15 GB) | Files are owned by a real human, so they use real free storage. |

The robot and the owner-OAuth connection are independent. The robot is never
involved in file storage.

---

## Hard rules (do not break — these fail at runtime, not compile time)

1. **The robot must never CREATE a Google file.** Creating a Form, a Doc, a copied
   certificate template, or uploading a binary through the service account fails with
   `storageQuotaExceeded` — a service account has no storage quota on a free/non-Workspace
   account. Every new file's owner needs storage; the robot has none.
   - The robot **may** read/write a Sheet that already exists and was shared with it
     (this is why today's app works — the Sheet is created by a human).
   - **All file creation** (Forms, Docs, cert copies, uploads) **must go through the
     owner's OAuth connection**, so the file is owned by the owner and uses their storage.

2. **The OAuth app must be set to "In production", not "Testing".** A new Google OAuth
   app defaults to "Testing", where refresh tokens **expire after 7 days** — the owner's
   Drive connection would silently die every week. Set it to production from day one.

3. **Use the `drive.file` scope, not full `drive`.** `drive.file` only grants access to
   files the app itself creates — lighter, no Google security review needed, and avoids the
   verification burden that the broad `drive` scope triggers. Owner also trusts it more.

4. **Read quiz/exam results via a linked response Sheet, not the Forms API.** Link each
   Google Form to a response Sheet; the robot reads that Sheet (the existing `readTab`
   pattern). This avoids the Forms API and avoids the robot creating anything. The Form and
   its response Sheet must be created/owned by the owner (rule #1).

---

## What lives where (no Google Workspace, no payment required)

| Feature | Where it lives | Needs file storage? |
|---------|----------------|---------------------|
| Data (current app) | Google Sheets (robot edits) | No |
| Quizzes / MCQ | Google Forms (native autograding) → results in a linked Sheet | No |
| Curriculum | Google Docs (owner-owned), embedded via `/preview` iframe | No |
| Certificates | Fill a Docs/Slides template → export to PDF → stream to download | No (don't persist) |
| File assignments | Owner's Drive via owner OAuth | **Yes** — owner's Drive |

Only file assignments truly need persistent binary storage; everything else either keeps
data in Google's own systems (Forms responses) or generates on demand (cert PDFs).

---

## Identity-mapping caveats (low-stakes, note when building)

- A prefilled `student_id` in a Form URL can be edited by the student before submitting →
  they could submit as someone else. Acceptable for low-stakes quizzes; do not use Forms for
  anything graded that matters without a stronger identity check.
- Sheets has no transactions — concurrent writes can clobber each other. Already true today;
  more write paths (quiz autograde, uploads) increase the chance. Keep write paths few and
  idempotent where possible.
- The owner's 15 GB is shared with their Gmail + Photos. Fine for a fresh company account;
  watch it on a stuffed personal Gmail.

---

## Going multi-tenant (Model A) — migration checklist

Good news: centre identity is already centralised. `src/lib/sheets.ts` exposes
**`currentCenter()`** as the single source of truth, and `sheetId()` + the Sheets client both
route through it. Today it returns the one centre from env vars. To serve many centres:

- [ ] **Per-request centre resolution.** Change `currentCenter()` (only this function) to
      resolve the centre from the request/session instead of env vars. Everything downstream
      already routes through it.
- [ ] **Per-centre Drive token store.** The single env-var token becomes a per-centre store
      (a dedicated Sheet tab or a small DB), keyed by centre. Each owner connects their own
      Drive once.
- [ ] **Tenant isolation.** Every request must resolve "which centre" → that centre's Sheet +
      that centre's Drive token. One centre must never read another's data. This is the one
      genuinely new piece of logic.
- [ ] **Keep one service account (yours).** A single robot can serve many centres — each
      centre shares their Sheet with it. No per-centre service account needed.
      ⚠️ Its Google API quota is now shared across all centres — monitor at scale.
- [ ] **Verify the OAuth app.** Publish + eventually submit for Google verification so paying
      customers don't see the "unverified app" warning screen on connect.
- [ ] **Per-centre config.** `CENTER_TZ` and other env-based centre config should fold into
      `currentCenter()` too (timezone is already per-centre data in the Sheet's Config tab).
- [ ] **Clear builder data.** Before onboarding real centres, ensure no test/builder data
      lives in the builder's personal Drive or Sheet.

---

## Console actions the owner must do (cannot be automated by code)

1. Create an OAuth client in Google Cloud Console (client ID + secret).
2. Set the OAuth app publishing status to **"In production"**.
3. Add the **`drive.file`** scope (+ `documents` / `forms` as those features are built).
4. (Later, for real customers) Submit the app for Google verification.

---

## Status

- ✅ Insurance move done: `currentCenter()` accessor added in `src/lib/sheets.ts`; `sheetId()`
  and the Sheets client now route through it; client cache keyed per service account so a
  future multi-tenant request can't reuse the wrong account.
- ⬜ Everything else above is forward-looking (built when Forms/Drive/cert features land).
