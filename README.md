<div align="center">

# 🎓 KLiXO Coach

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google_Sheets_as_DB-34A853?style=for-the-badge&logo=googlesheets&logoColor=white)
![Live Product](https://img.shields.io/badge/Live_Product-2ea043?style=for-the-badge)

**Attendance & timetable SaaS for coaching centres — one deployment per centre, Google Sheets as the invisible backend.**

</div>

---

## About
A production **Next.js 16 + TypeScript** app that runs a coaching centre's day: teachers
mark the batch, owners see **attendance %, defaulters, and a full manual-mark audit**.
Each centre gets its own branded deployment, and the whole backend is a **Google Sheet**
written server-side through a service account — so a non-technical owner can see their
data in a tool they already know, while the app mediates every read and write.

> Full product spec, data model, and roadmap live in **[PLAN.md](PLAN.md)** — the single source of truth.
>
> **Setting up a new centre?** Follow **[SETUP.md](SETUP.md)** — Google service account, one-command sheet bootstrap, seed, deploy.

## ✨ Highlights
- **Google Sheets as the database** (10 tabs) — no DB to run; the owner's data lives where they already work
- **Phone + PIN auth** (bcrypt + JWT via `jose`); teachers mark, students never self-mark
- **Owner dashboard** — attendance %, defaulters, manual-mark audit (`recharts`)
- **Timezone-correct by design** — "today" is computed in the centre's local TZ, never server UTC
- **One deployment = one centre** — clean multi-tenant-by-instance model
- Ships with a **PDF user manual** + auto-generated screenshots (Playwright)

## User manual
End-user guide for owners & teachers, with a screenshot of every screen:
**[docs/KLiXO-Coach-Manual.pdf](docs/KLiXO-Coach-Manual.pdf)** (source: `docs/manual.html` +
`docs/screenshots/`; regenerate via `scripts/screenshot.mjs`).

## Stack
- **Next.js 16** (App Router, TypeScript, Tailwind) on **Vercel**
- **Google Sheets** as the DB — 10 tabs: Config, Teachers, Students, Batches, Enrollments, Rooms, Timetable, Sessions, Attendance, Holidays
- Auth: **phone + PIN**. Marking: teacher marks the batch (no student self-mark).

## Local setup
```bash
cp .env.example .env.local      # then fill in the values
npm install
npm run dev                     # http://localhost:3000
```

### Environment
| Var | What |
|-----|------|
| `SHEET_ID` | The Google Sheet that backs this centre |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service-account JSON (single line). **Secret.** |
| `CENTER_TZ` | Centre local timezone, e.g. `Asia/Kolkata`. "Today" is computed here, **never** server UTC. |

Pull the deployed env locally with `vercel env pull .env.local`.

## Health checks
- `GET /api/health` → `{ ok: true }` (static)
- `GET /api/center` → reads the Config tab (proves the Sheets pipeline)

## Critical invariants (see PLAN.md §11)
- Compute "today" / day-of-week in **`CENTER_TZ`**, never the server's UTC clock.
- Teachers/students must **never** see the raw Sheet — the app mediates all access.
- Never commit `GOOGLE_SERVICE_ACCOUNT_JSON` or `.env.local`.

<div align="center"><br/><sub>Built by <b>Tanishq Jain</b> · a KLiXO product</sub></div>
