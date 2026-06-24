# KLiXO Coach

Attendance & timetable for coaching centres. **One deployment = one centre.**
Branded Next.js app on Vercel; Google Sheets is the invisible backend (written
server-side via a Google service account). Teachers mark the batch; owners see
attendance %, defaulters, and a manual-mark audit.

> Product spec, data model, and roadmap live in **PLAN.md** (single source of truth).

## User manual

End-user guide for owners & teachers (with screenshots of every screen):
**[docs/KLiXO-Coach-Manual.pdf](docs/KLiXO-Coach-Manual.pdf)**. Source: `docs/manual.html`
+ `docs/screenshots/`. Regenerate the screenshots with `scripts/screenshot.mjs`
(see its header for the Playwright steps).

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind) on **Vercel**
- **Google Sheets** as the DB (10 tabs: Config, Teachers, Students, Batches,
  Enrollments, Rooms, Timetable, Sessions, Attendance, Holidays)
- Auth: phone + PIN. Marking: teacher marks the batch (no student self-mark).

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
