# KLiXO Coach — UI & Color Design Spec

> How every page should look, and the exact color system that fixes the
> "monochrome" feel — without losing the clean, professional base.
> Tailwind v4 (tokens live in `src/app/globals.css @theme`). React 19, Geist font.
> Date: 2026-07-04

---

## 0. Why it looks monochrome today (diagnosis)

Current tokens (`src/app/globals.css`):
- `--brand: #111111` (near-black) → **every primary button, active nav, key action
  is black.** No brand hue anywhere.
- `--accent: #3b82f6` blue, comment literally says *"used sparingly."* So the one
  color present is deliberately withheld.
- Status colors are dark `-700` variants → muted, low-chroma.
- Charts (recharts) + progress bars + chips render gray/near-black.

Net: a gray-on-white utility app. Clean, but flat and lifeless. **The base is
good** (white canvas + ink text + hairlines is the right professional foundation —
Linear/Cal.com do this). The fix is **not** to repaint everything — it's to add
*purposeful* color: a real brand hue, section signatures, and vivid semantic
status, while keeping the neutral chrome.

---

## 1. Design philosophy

**Neutral chrome + purposeful color.**
- **Structure stays neutral** (white surfaces, ink text, gray hairlines) — this is
  what reads as "professional," keep it.
- **Color earns its place**: brand actions, section identity, status, and data.
  Never color for decoration.
- **One brand hue, one warm secondary, disciplined semantics.** Not a rainbow.
- Mobile-first (teachers on phones), AA contrast throughout.

Target feel: a **friendly, premium education product** — trustworthy indigo, a warm
amber spark, and money-green that makes the fees screen feel alive. Think "Linear's
discipline meets a warm Indian edtech brand."

---

## 2. Color system (exact tokens)

### 2.1 Neutrals (keep — the chrome)
| Token | Hex | Use |
|---|---|---|
| `--background` | `#ffffff` | app canvas |
| `--surface` | `#ffffff` | cards, tables, forms |
| `--surface-2` | `#f7f7f8` | sidebar, raised panels (slightly warmer than #f5f5f5) |
| `--foreground` | `#0f1115` | primary text (ink) |
| `--muted-foreground` | `#6b7280` | secondary text |
| `--border` | `#e6e7eb` | hairlines |

### 2.2 Brand — Indigo (NEW primary; replaces near-black as the action color)
Confident, trustworthy, education-coded. Full scale so we can tint.
| Token | Hex |
|---|---|
| `--brand-50` | `#eef2ff` |
| `--brand-100` | `#e0e7ff` |
| `--brand-500` | `#6366f1` |
| `--brand-600` | `#4f46e5` ← **primary** (buttons, active nav, links) |
| `--brand-700` | `#4338ca` (hover/active) |
| `--brand-foreground` | `#ffffff` |
| `--brand-subtle` | `#eef2ff` (active-nav fill, selected rows) |

> Migration: keep `--brand` as an alias → set it to `#4f46e5`. Existing components
> that use `bg-brand` instantly gain color with zero refactor. Near-black is
> demoted to plain `--foreground` for text only.

### 2.3 Secondary — Amber (warmth / highlights / streaks)
The spark that kills the cold-corporate look. Use for highlights, "on a streak,"
featured, celebratory, and the logo accent.
| Token | Hex |
|---|---|
| `--secondary-500` | `#f59e0b` |
| `--secondary-600` | `#d97706` |
| `--secondary-subtle` | `#fffbeb` |

### 2.4 Semantic status (raise chroma from -700 → -600/-500 + vivid tints)
| Meaning | Solid | Text-on-white | Subtle bg |
|---|---|---|---|
| Success / Present / Paid | `--success #059669` | `#047857` | `#ecfdf5` |
| Warning / Late / Partial | `--warning #d97706` | `#b45309` | `#fffbeb` |
| Danger / Absent / Dues | `--danger #dc2626` | `#b91c1c` | `#fef2f2` |
| Info / Neutral pill | `--info #0ea5e9` | `#0369a1` | `#f0f9ff` |

Pills get **subtle bg + colored text + colored dot** (not gray). Present pill =
green dot on `#ecfdf5`. This alone transforms Today/Mark/Dashboard.

### 2.5 Section signature colors (the navigability layer)
Each area gets ONE signature hue — applied to the **section icon, the active-nav
accent, and page-header underline only.** Body stays neutral. This makes moving
through the app feel colorful and oriented without noise.

| Section | Hue | Token |
|---|---|---|
| Today | Indigo | `#4f46e5` |
| Dashboard | Violet | `#7c3aed` |
| Timetable | Cyan | `#0891b2` |
| Students | Blue | `#2563eb` |
| Batches | Teal | `#0d9488` |
| **Fees / money** | **Emerald** | `#059669` |
| Curriculum | Amber | `#d97706` |
| Teachers/Staff | Rose | `#e11d48` |
| Portal (student) | Indigo | `#4f46e5` |
| Tests | Purple | `#9333ea` |

### 2.6 Data-viz palette (recharts — stop the gray bars)
Ordered categorical set, AA on white, distinct in b/w print:
```
#4f46e5 indigo · #0d9488 teal · #d97706 amber · #e11d48 rose ·
#0891b2 cyan · #7c3aed violet · #059669 emerald · #6b7280 gray(=last/other)
```
Attendance bars: green→amber→red **gradient by value vs threshold** (below
threshold = red, at = amber, above = green). Never a flat gray bar.

---

## 3. Foundations (extend, don't churn)

- **Type:** Geist. Scale `12 / 14(base) / 16 / 20 / 24 / 30`. Weights 400 / 500 /
  600 / 700. Tabular-nums on all money + % + counts (`font-variant-numeric`).
- **Spacing:** 4-pt base (`4 8 12 16 24 32 48`).
- **Radius:** `sm 6 · md 8 · lg 12 · full`. Cards `md`, pills `full`, inputs `md`.
- **Elevation:** keep the soft Cal.com shadow (`--shadow-card`). Add colored focus
  ring `0 0 0 3px rgba(79,70,229,.35)` (brand) for inputs/buttons.
- **Motion:** 150ms ease for hovers, 200ms for entrances. Respect
  `prefers-reduced-motion`. Framer-motion only for Reveal/CountUp (per audit).

---

## 4. Component color rules

| Component | Rule |
|---|---|
| **Primary button** | `bg-brand-600` text-white, hover `brand-700`, focus ring brand. |
| **Secondary button** | white, `border`, ink text, hover `surface-2`. |
| **Destructive** | `danger` solid or `danger` text + `danger-subtle` bg. |
| **Nav item (active)** | `brand-subtle` fill + section-colored left bar + brand text. |
| **KPI card** | white card, section-colored **icon chip** (subtle bg), big
  tabular number, tiny trend. Fees KPIs use emerald; defaulters use danger. |
| **Status pill** | subtle bg + colored text + 6px colored dot. Never gray. |
| **Progress bar** | value-based green/amber/red vs threshold; track `surface-2`. |
| **Table** | white; header `surface-2`; row hover `brand-50/40`; selected `brand-subtle`. |
| **Money** | dues in `danger`, paid in `success`, credit in `info`; always tabular. |
| **Empty state** | section-colored icon (subtle), one line, one primary action. |

Every interactive component must define: default, hover, focus-visible, active,
disabled, loading, error (carry over `skill.md`'s rule — that stays law).

---

## 5. Per-page look

For each page: **layout + where color lands.** Chrome neutral unless noted.

### Login `/login`
Centered card on a **soft brand→violet gradient mesh** background (indigo/violet at
~8% opacity, not loud). KLiXO logo with amber accent dot. Phone + PIN inputs (md
radius, brand focus ring), full-width brand primary button. This is the first
impression — make the gradient tasteful, not a rainbow.

### Today `/today` (teacher home, phone-first)
Date navigator as a pill row (brand active day). Session **cards** stacked: batch
name (600 wt), time·room·teacher (muted), **status pill** (scheduled=info,
cancelled=danger, substituted=warning). Big thumb-friendly tap targets. Floating
brand "＋ Extra class" button. Color source = status pills + active date.

### Mark attendance `/mark/[sessionId]` (phone-first)
Sticky header (batch·date·time). Roster rows: avatar (colored initials) + name +
three big segmented buttons **Present(green) / Late(amber) / Absent(red)** —
selected state fills with the semantic color, unselected is outline. This screen
should be the most colorful — it's all status. Submit = brand bar, sticky bottom.

### Dashboard `/dashboard` (owner cockpit)
Follow the researched F-pattern (`dashboard-research.md`): **6–8 KPI tiles max**,
top-left = attendance %, then defaulters (danger), active students/batches. Below:
**per-batch attendance bars** (value-colored), **defaulters list** (danger-tinted
rows), **curriculum rollup** (amber bars), **audit list**. Violet section accent on
header + KPI icons in mixed section colors. Charts use the §2.6 palette.

### Timetable `/timetable` (owner)
Weekly grid; each batch block tinted by its **section/subject color** (low-chroma
fill, colored left edge). **Clash banner**: room/teacher clash = danger banner;
student overlap = warning banner. Cyan section accent.

### Students `/manage/students`
Searchable table (blue accent). Row: avatar + name + phone + batch chips + active
chip (green/gray) + attendance % badge (value-colored). Export = secondary button.
Profile `[id]`: header card + tabs (Details / Enrollments / Attendance / **Fee
ledger**). Ledger = immutable rows, dues red / paid green.

### Batches `/manage/batches`
Table: name + subject chip (subject color) + teacher + room + fee (tabular) +
#students. Teal accent. `[id]/progress` = big curriculum progress ring/bar (amber)
with chapters done/total.

### Fees `/manage/fees` (the money screen — make it feel valuable)
Emerald section identity. Period picker. **KPI cards**: Expected (ink) · Collected
(emerald) · Outstanding (danger) · Students-with-dues (danger count). Defaulters
table with danger-tinted amount column. Ledger drill-down. This screen currently
feels flattest — emerald + danger contrast fixes it instantly.

### Curriculum `/manage/curriculum`
Amber accent. Course cards with progress. Chapter detail: checkbox list; completed
chapters get an emerald check + strike. Progress % ring amber.

### Teachers/Staff `/manage/teachers`, `/manage/staff/*`
Rose accent. Staff table + role chips (owner=brand, teacher=info). Attendance grid
uses the same present/absent/leave/half-day semantic colors. Payroll = tabular
money, bonus=success, deduction=danger.

### Portal `/portal/*` (NEW — Phase 1)
Indigo, warm and friendly (this faces parents). Home = 3 big tiles: **Attendance %**
(ring, value-colored), **Fees due** (₹, danger if owing / emerald if clear),
**Next class**. Clean, reassuring, mobile-first. Pay button (Phase 2) = brand.

### Tests `/portal/tests`, builder (NEW — Phase 3)
Purple accent. Taker: one question per screen (phone), option cards, brand-selected
state, progress dots, timer chip (warning when <1 min). Result: score ring
(pass=green / fail=danger), class average line.

### States
- **Loading:** skeletons in `surface-2`, subtle shimmer.
- **Empty:** section-colored icon, one line, one action.
- **Error:** danger icon + retry (secondary button). 404 = friendly, brand button home.

---

## 6. Migration (low-churn rollout)

1. **Add tokens** to `globals.css @theme` (§2). Set `--brand: #4f46e5` alias so all
   existing `bg-brand`/`text-brand` gain color free.
2. **Recolor primitives once** in `src/components/ui.tsx`: `StatusPill`,
   `LedgerStatusPill`, `PctBadge`, `RoleChip`, `ActiveChip`, `OnTrackChip` → subtle
   bg + colored text + dot (per §4). The audit already flags merging these into one
   `<Pill tone>` — do that here, recolor in one place, whole app updates.
3. **Add section accent** as a per-route constant (map route → hue); apply to
   header underline + nav active bar + section icon.
4. **Swap chart colors** to §2.6 in `src/components/charts/*`.
5. **KPI cards** get colored icon chips.

Steps 1–2 alone (a few hours) kill ~80% of the monochrome feel. 3–5 finish it.

---

## 7. Do / Don't

**Do**
- Keep white canvas + ink text + hairlines (the professional base).
- Use section color for identity, semantic color for meaning, brand for action.
- Tabular numerals on all money/%/counts.
- AA contrast; visible focus rings.

**Don't**
- Don't color for decoration or use >1 brand hue on a screen's chrome.
- Don't return status chips to gray.
- Don't put flat gray bars in charts.
- Don't introduce one-off hex — extend tokens only.

---

## 8. QA checklist (per page)

- [ ] Chrome neutral; color only on action / status / section / data.
- [ ] Every status pill has bg + colored text + dot (no gray).
- [ ] Attendance/progress bars colored by value vs threshold.
- [ ] Primary action = brand-600; focus ring visible.
- [ ] Money: dues danger, paid success, tabular nums.
- [ ] Section accent present on header + active nav.
- [ ] AA contrast on all text; reduced-motion respected.
- [ ] Mobile: tap targets ≥44px on Today/Mark/Portal.
