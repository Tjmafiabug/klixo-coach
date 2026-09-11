# KLiXO Coach — UI/UX Research 2026 (3 personas + motion)

> Web research, Sept 2026. Complements `docs/UI-DESIGN-SPEC.md` (colour system,
> already implemented) and `dashboard-research.md` (owner-dashboard content).
> This doc covers: what each persona's screens should look like, and the exact
> motion system to make it feel premium.

---

## 0. Where we already stand (audit, not aspiration)

Implemented and good — do not re-litigate:
- Indigo brand + amber secondary + vivid semantics, AA-fixed (`globals.css`)
- One `Pill` primitive, `PctBadge`, `Banner`, shared `fieldClass` — token-driven
- Portal = sticky header + 5-tab bottom bar, 56px targets (`PortalShell.tsx`)
- `framer-motion` installed; `Reveal` + `CountUp` respect `prefers-reduced-motion`
- Geist sans + mono; mono used for pills/numbers (tabular discipline already there)

Gaps this research targets:
1. Teacher surface still desktop-shaped (sidebar shell) — teachers are on phones.
2. Motion is scroll-reveal only. No state-change, list, or route motion.
3. Three personas share one visual voice; taste per role is undifferentiated.
4. No Cmd+K, no shared-element route transitions, no optimistic-mark feedback.

---

## 1. The 2026 consensus (what "minimal but modern" means now)

From the trend sweep, five points survive scrutiny — the rest is decoration:

- **Strategic minimalism ≠ sparse.** Every element must advance a goal; one
  primary CTA per screen. Reference set designers actually study: Linear
  (restraint), Stripe (data tables), Vercel (deployment dashboard), Attio,
  Mercury, Plausible, Supabase.
- **Calm design.** Typography carries hierarchy, not icons or borders. Default
  view shows only the current workflow; advanced behind progressive disclosure.
- **Command palette (Cmd+K)** is now table stakes for the admin surface.
- **Density comes from typography, not chrome.** Right-aligned tabular numerals,
  muted gridlines, chart-as-summary + table-as-truth (the Stripe lesson).
- **Emotional design crossed into B2B.** Celebration micro-animations on task
  completion, human-voiced empty states — correlated with first-30-day retention.
- **Bento grid** for the owner overview: asymmetric cards, big card = read first.

Mobile (teacher + student):
- 44×44pt / 48dp minimum targets — now written into enterprise contracts, not a nicety.
- Bottom third = thumb safe zone. Put high-stakes actions center-bottom.
- Bottom tab bar beats hamburger for returning users (measurably higher engagement).
- Cold start < 2.5s p90, tap response < 100ms, critical content above the fold.

---

## 2. Per-persona design direction

Same tokens, three different *postures*. One design system, three tastes.

### 2.1 Teacher — "fast, thumb-first, forgiving"
Job: mark a batch in under 20 seconds, standing, mid-class, on a mid-range Android.

- **Bottom tab bar on mobile** (Today · Timetable · Students · Me). The sidebar
  shell stays for `md:` and up. Mirrors `PortalShell` — reuse, don't re-invent.
- **Mark screen = one thumb-reachable column.** Student rows tall (≥56px), the
  present/absent/late control a segmented 3-up in the row, not a dropdown.
- **"Mark all present" first, then correct the exceptions** — the real-world flow
  in every India coaching product. Default optimistic; exceptions are the edit.
- **Sticky bottom Save bar** with count ("28 marked · 2 left"), inside thumb zone.
- Big, calm empty states: "No classes today. Enjoy it." — human voice, one action.
- Offline-tolerant: optimistic UI on tap, reconcile after; never block on Sheets latency.

### 2.2 Owner/Admin — "cockpit, not report"
Job: 5-second read on whether the centre is on track; then drill.

- **Bento overview**, 6–8 KPIs max on the landing view (matches `dashboard-research.md`).
  Large card = the one thing that matters today (attendance % + defaulters);
  smaller cards = money band, teachers-who-haven't-marked, PTM queue.
- **"Needs You" queue** — verb-first action tiles, each pairing a signal with its
  remedy (teacher hasn't marked → Remind). This is the differentiator.
- **Table is the truth.** Right-aligned tabular numerals (`font-mono tabular-nums`
  — already the `PctBadge` pattern), muted gridlines, charts as summary only.
- **Cmd+K palette**: jump to any student/batch, run any action. 14 manage routes
  already exist — navigation cost is the real tax, and this erases it.
- Progressive disclosure: the 12-item Manage list collapses to recents + search.

### 2.3 Student/Parent — "reassuring, personal, lightly celebratory"
Job: am I OK? attendance, fees, syllabus, tests — answered without reading.

- Keep the existing 5-tab bottom bar. Warmer than the admin surface: amber
  accents, rounded cards, avatar-forward.
- **Lead with a single verdict**, not a table: a big attendance ring + one
  sentence ("92% — comfortably above the 75% mark").
- **Streaks and celebration**: amber spark on a present-streak; a confetti-free,
  one-shot scale+fade on a milestone. B2C polish, B2B restraint.
- Fees: status pill + amount + one CTA. Never a ledger unless expanded.
- Tests: score card, not a spreadsheet.

---

## 3. Motion system — "super smooth" made concrete

The rule that separates polished from AI-default: **springs for interactive UI,
easing for decorative/sequential.** Defaults everywhere (300ms ease-in-out, 20px
slide, no overshoot) are the tell.

### 3.1 Calibration table (adopt as tokens)

| Class | Duration | Config | Amplitude |
|---|---|---|---|
| Micro (hover, toggle, pill) | 150–200ms | spring `stiffness 200, damping 20`, bounce < 0.1 | scale 1.02–1.05 (never 1.2) |
| Entrance (modal, sheet, toast) | 250–400ms | spring, slight overshoot | slide 8–12px (never 20) |
| Exit | faster than entrance (~150–250ms) | ease-out | same distance |
| Page / scroll reveal | 400–500ms | cubic-bezier `[0.16, 1, 0.3, 1]` | y 14px ✅ already used |
| Stagger between list items | 30–50ms | — | — |

Non-negotiables:
- Animate **only `transform` and `opacity`** (GPU). No `height`/`top`/`box-shadow` animation.
- `useReducedMotion` on every motion component — already the house pattern, keep it.
- `AnimatePresence` for exits; without it, exits don't exist.
- Test on a real mid-range Android, not a MacBook.

### 3.2 The four patterns to actually build

1. **Entrance/exit** — mark-confirmation toast, modals, the mobile nav sheet.
2. **Layout transitions** — `layout` prop on student rows so a filter/sort reflows
   smoothly; the Needs-You queue shrinking as items are cleared. Highest
   perceived-quality-per-line-of-code in the whole app.
3. **Gesture** — swipe a student row present/absent on the mark screen; drag-to-dismiss
   the bottom sheet.
4. **Scroll-linked** — already have `Reveal`; keep it restrained on the admin surface.

### 3.3 Route transitions
View Transitions API is production-viable in 2026 (Chromium + Safari stable,
Firefox behind a flag). Next 16 App Router: use the **browser API directly** —
React's `<ViewTransition>` is still experimental behind `experimental.viewTransition`.
Highest-value use: shared-element morph from a student row → student detail, and
batch card → batch detail. Zero JS animation code; a `view-transition-name` per element.

### 3.4 Signature moments (pick 3, not 30)
- **Mark saved**: the Save bar collapses into a green check that scales in at
  spring bounce ~0.15, then the row list settles via `layout`. This is the
  moment teachers hit 40× a day — it deserves the most tuning.
- **CountUp on dashboard KPIs** — exists; extend to the bento numbers.
- **Attendance ring draw-in** on the student portal home, once, 600ms ease-out.

---

## 4. Anti-patterns (explicitly banned)
- Glassmorphism/neumorphism on data surfaces — kills contrast and AA.
- Animating a spinner where an optimistic update would do.
- >8 KPIs on the owner landing view.
- Hamburger-only nav on any mobile surface.
- A second brand hue. One indigo, one amber, semantics. Section hues stay
  confined to icon + active-nav + header underline (spec §2.5).
- Dark mode as a "trend" item — only worth it if owners ask; it doubles QA.

---

## 5. Recommended build order (highest value first)
1. Teacher mobile bottom nav + mark-screen thumb layout + optimistic mark.  ← biggest UX win
2. Motion tokens (§3.1) + `layout` transitions on lists + the mark-saved moment.
3. Owner bento overview with the Needs-You queue, capped at 8 KPIs.
4. Cmd+K palette over the 14 manage routes.
5. View Transitions shared-element morphs (row → detail).
6. Student portal: attendance ring verdict + streak spark.

---

## Sources
- https://www.saasui.design/blog/7-saas-ui-design-trends-2026
- https://adminlte.io/blog/saas-dashboard-design-examples/
- https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/
- https://blog.vibecoder.me/animation-patterns-framer-motion-ai
- https://projectsupply.in/blog/framer-motion-performance-2026-guide
- https://nextjs.org/docs/app/guides/view-transitions
- https://medium.com/ui-ux-designing-trends/mobile-app-navigation-design-2026-ux-best-practices-5b2db901790d
- https://www.forasoft.com/blog/article/mobile-app-ux-design-best-practices
- https://phone-simulator.com/blog/mobile-navigation-patterns-in-2026
- https://www.teachmint.com/features/attendance-management-system
