# SETUP — stand up a new centre

From a bare clone to a running KLiXO Coach centre. The app's backend is a **Google
Sheet** (one per centre), written server-side via a **service account**. Steps 2–4 are
one-time Google setup; step 5 builds the sheet automatically.

**Legend:** 🖱️ browser step · ⌨️ terminal · ✅ expected · ⚠️ gotcha

---

## Step -1 — Which Google account owns all this ⚠️

Before anything else: the Sheets and the GCP project holding the service account
should live on a **Google Workspace** account, not a personal @gmail.com one.

A consumer Gmail account has no admin above it. If it is suspended, compromised,
or the recovery phone is lost, nobody can restore it — and the GCP project, the
service account and every centre's data become unreachable at the same moment.
Workspace gives you an admin who can reset access, audit logs for "who can see
our student data?", enforceable 2FA, and the data-processing terms that matter
once real children's names and fee records are involved.

Any Workspace account on a domain you control is enough. A dedicated product
identity (`klixo@yourdomain`) is tidier than a personal one if KLiXO ever moves
to its own domain — one transfer instead of untangling an account — but it is a
convenience, not a safeguard.

Whatever you choose, do these two:

1. **Add a second Owner** to the GCP project (IAM → Grant access → Owner). One
   locked-out account should never be able to take the product down.
2. **2FA with two recovery methods** on the owning account.

Moving later is low-risk but ordered: **GCP project first, Sheets second** — a
Sheet is data you can re-copy, the service account is the credential everything
authenticates with.

- **The GCP project transfers cleanly.** IAM → Grant access → the new account →
  **Owner**; sign in as it and confirm the project is visible; only *then*
  remove the old owner. Never the other way round, or the project is orphaned.
- **Sheets cannot be transferred across domains.** Google only allows an
  ownership transfer between accounts in the same domain, so personal
  @gmail.com → Workspace is blocked. Instead: share the Sheet to the new
  account, open it as that account, **File → Make a copy** — the copy is owned
  by the new account. Re-share the copy with the service account as Editor and
  update `SHEET_ID` (the copy has a new id) in `.env.local` and in Vercel.
  ⚠️ A copy does not carry revision history and resets the "last edited by"
  trail. The data comes across intact; the audit trail does not. Worth doing
  before a centre's records are real rather than after.

---

## Step 0 — Clone + install ⌨️
```bash
git clone https://github.com/Tjmafiabug/klixo-coach.git
cd klixo-coach
npm install
cp .env.example .env.local
```

## Step 1 — Create the centre's Google Sheet 🖱️
1. Make a new blank Google Sheet (sheets.new). Name it for the centre.
2. Copy its **ID** from the URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.
3. Put it in `.env.local` as `SHEET_ID`.

## Step 2 — Service account (the app's identity) 🖱️
**Link:** https://console.cloud.google.com
1. New project (or reuse) → **APIs & Services → Library** → enable **Google Sheets API** (and **Google Drive API** if you'll use owner file uploads).
2. **APIs & Services → Credentials → Create Credentials → Service account** → create it.
3. On the service account → **Keys → Add key → JSON** → download.
4. Paste the **entire JSON as one line** into `.env.local` as `GOOGLE_SERVICE_ACCOUNT_JSON`.
⚠️ Never commit this JSON — `.gitignore` already blocks `.env*` and `credentials.json`.

## Step 3 — Share the Sheet with the service account 🖱️
1. Open the JSON, copy its `client_email` (looks like `name@project.iam.gserviceaccount.com`).
2. In the Sheet → **Share** → paste that email → give it **Editor** → send.
✅ Without this, every read/write 403s. This is the most-missed step.

## Step 4 — Timezone ⌨️
In `.env.local` set the centre's timezone, e.g.:
```
CENTER_TZ=Asia/Kolkata
```
⚠️ "Today" and day-of-week are computed in `CENTER_TZ`, **never** server UTC (PLAN.md §11).

## Step 5 — Build the sheet (all tabs + headers) ⌨️
The app expects ~24 tabs with exact headers and **won't create them** (it throws
`tab not found`). This script builds them for you:
```bash
npm run bootstrap        # = node --env-file=.env.local scripts/bootstrap-sheet.mjs
```
✅ Prints `+ created N tab(s)` then a header line per tab. Idempotent — safe to re-run;
it only fills empty tabs, never overwrites data.

## Step 6 — Seed a first owner login ⌨️
The app is phone + PIN. Create the first owner so you can sign in:
```bash
node --env-file=.env.local scripts/seed-pins.mjs      # see the script header for args
```
✅ You now have an owner phone + PIN.

## Step 7 — Run ⌨️
```bash
npm run dev            # http://localhost:3000
```
✅ Sign in with the owner phone + PIN. `GET /api/health` → `{ ok: true }`,
`GET /api/center` reads the Config tab (proves the Sheets pipeline).

---

## Deploy to Vercel 🖱️⌨️
```bash
npm i -g vercel && vercel link
vercel env add SHEET_ID
vercel env add GOOGLE_SERVICE_ACCOUNT_JSON      # paste the one-line JSON (Encrypted)
vercel env add CENTER_TZ
vercel --prod
```
One deployment = one centre. For another centre, repeat with a **new Sheet + new
`SHEET_ID`** (the service account can be reused if you share each sheet with it).

## Optional — owner Drive uploads
For owner file storage (uploads, generated PDFs), set the `GOOGLE_OAUTH_*` vars — see
**docs/google-integration.md**. Not required to run the core app.

## Troubleshooting
- **`tab not found`** → run `npm run bootstrap` (Step 5).
- **403 / permission denied on the Sheet** → you didn't share it with the service
  account's `client_email` as Editor (Step 3).
- **Wrong day / attendance on the wrong date** → `CENTER_TZ` unset or wrong (Step 4).
- **429s under load** → Sheets read quota (~60/min/user); the app already retries with backoff.
