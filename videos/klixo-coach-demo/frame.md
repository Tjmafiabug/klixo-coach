---
version: alpha
name: Klixo Coach — Frame (video / frame layer)
description: >
  Video-first design system for the Klixo Coach product-demo rebuild. The unit is the frame
  (1920×1080). Three colors only — near-black ground, near-white type, brand indigo accent
  (#4f46e5, matches the live app's --brand token) — carrying every headline, screenshot frame,
  chip, and CTA. Space Grotesk (display/kinetic type) + JetBrains Mono (UI labels/chrome,
  matches the app's Geist Mono) in fixed roles. Fast, dense, screen-recording-led; atoms sacred,
  composition free.
unit: the frame — 1920×1080 primary; 9:16 documented for social cutdown
principle: atoms are sacred · composition is free · three colors, no exceptions

colors:
  bg: "#0a0a12"
  bg-raised: "#111120"
  primary: "#4f46e5"
  primary-bright: "#6366f1"
  text: "#fafaff"
  text-muted: "rgba(250,250,255,0.6)"
  text-dim: "rgba(250,250,255,0.35)"
  accent-fill: "rgba(79,70,229,0.14)"
  accent-border: "rgba(79,70,229,0.4)"
  glow: "rgba(79,70,229,0.55)"

radii:
  screen-frame: "16px"
  chip: "100px"
  card: "12px"
  cursor-ring: "50%"

typography:
  # — chrome / UI ramp (JetBrains Mono — labels, tags, captions, timestamps) —
  eyebrow:  { fontFamily: "JetBrains Mono", cqw: 0.85, weight: 700, tracking: "0.14em", upper: true, color: "primary-bright" }
  chip-label: { fontFamily: "JetBrains Mono", cqw: 0.75, weight: 700, tracking: "0.06em", upper: true, color: "text" }
  caption:  { fontFamily: "JetBrains Mono", cqw: 0.7, weight: 400, color: "text-dim" }
  counter:  { fontFamily: "JetBrains Mono", px: 13, weight: 400, tracking: "0.05em", color: "text-dim" }
  # — kinetic / display ramp (Space Grotesk — everything the eye lands on first) —
  h3:       { fontFamily: "Space Grotesk", cqw: 1.6, weight: 500, lineHeight: 1.2, tracking: "-0.01em", color: "text" }
  stat-num: { fontFamily: "Space Grotesk", cqw: 5.5, weight: 700, lineHeight: 0.95, tracking: "-0.03em", color: "primary-bright" }
  h2:       { fontFamily: "Space Grotesk", cqw: 3.2, weight: 700, lineHeight: 1.05, tracking: "-0.02em", color: "text" }
  h1:       { fontFamily: "Space Grotesk", cqw: 5.5, weight: 700, lineHeight: 0.98, tracking: "-0.03em", color: "text" }
  wordmark: { fontFamily: "Space Grotesk", cqw: 2.0, weight: 700, tracking: "-0.02em", color: "text" }

spacing:
  pad-x: "6cqw"
  pad-y: "6cqw"
  gap-chips: "0.8cqw"
  screen-glow-spread: "80px"

components:
  screen-frame:
    backgroundColor: "{colors.bg-raised}"
    border: "1px solid {colors.accent-border}"
    rounded: "{radii.screen-frame}"
    shadow: "0 40px 120px {colors.glow}, soft ambient only — never a hard drop shadow"
    description: "Browser/device chrome wrapping a screenshot PNG. Thin indigo hairline + soft indigo glow is the ONLY depth cue — no skeuomorphic bezel."
  feature-chip:
    backgroundColor: "{colors.accent-fill}"
    border: "1px solid {colors.accent-border}"
    rounded: "{radii.chip}"
    typography: "{typography.chip-label}"
    description: "Rapid-fire feature callout, one per beat (e.g. ATTENDANCE · FEE COLLECTION · TIMETABLES). Mono, uppercase, never sentence case."
  cursor-ring:
    border: "2px solid {colors.primary-bright}"
    rounded: "{radii.cursor-ring}"
    description: "Pulsing ring that lands on a UI element inside a screenshot right before a whip-cut, standing in for a real cursor click."
  stat-callout:
    typography: "{typography.stat-num} + {typography.caption} label beneath"
    description: "Oversized indigo numeral, tabular-nums, mono caption underneath. No card wrapper — floats on bg."
  cta-pill:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text}"
    rounded: "{radii.chip}"
    typography: "Space Grotesk 700"
    shadow: "soft indigo glow, always-on (not hover-only — this is video, not a webpage)"
    description: "The one solid-fill element in the whole system. Closing frame only."
  progress-rail:
    backgroundColor: "rgba(250,250,255,0.08)"
    fill: "{colors.primary-bright}"
    size: "2px tall, bottom edge"
    description: "Persistent scene-progress strip, barely-there."
  ghost-wordmark:
    typography: "{typography.h1} at 4-6% opacity, oversized (10-14cqw), no color change"
    description: "Background layer decorative — 'KLIXO' or a feature word bleeding off-frame, very large, slow drift. Depth without a second color."
---

# Klixo Coach — Frame (video / frame layer)

## Overview

Three colors, no exceptions: **near-black ground** (`#0a0a12` — cool-tinted, never pure `#000`),
**near-white type** (`#fafaff` — cool-tinted, never pure `#fff`), and **brand indigo**
(`#4f46e5`, identical to the live app's `--brand` token) carrying every accent — chips, glows,
cursor rings, the CTA, the progress rail. Register: **modern SaaS demo, dark and fast** — closer
to a product-launch trailer than a tutorial. Screens are the hero; typography is the pace-setter
that punches between them.

Two voices in fixed roles, crossing the sans/mono boundary on purpose: **Space Grotesk** performs
(kinetic headlines, big stat numerals, the wordmark — this is the font that *moves*) and
**JetBrains Mono** recedes (eyebrows, feature chips, captions, timestamps — this is the font that
*labels*). JetBrains Mono is a deliberate echo of the Geist Mono already used in the live app UI —
the video should feel like it was cut from the same brand as the product, not a separate agency job.

**Key characteristics at frame scale:**

- **Cool near-black ground** on every frame; **indigo** is the only accent, no second hue.
- **Space Grotesk** (kinetic display/numerals) + **JetBrains Mono** (UI chrome) — extreme weight
  contrast (700 display vs 400 mono, pushed further by the size axis — 5.5cqw vs 0.85cqw), never two sans.
- **Screenshots are framed, not pasted** — thin indigo hairline + soft ambient glow, floating on
  the dark ground, slightly scaled/parallaxed, never edge-to-edge.
- **Ghost wordmark / oversized ghost text** as the background depth layer — ties every scene to
  the brand without adding a color.
- **One solid-fill moment**: the closing CTA pill. Everything else is line, glow, or type.

## The Frame

### Frame Craft Bar

Three eyeball tests gate every frame before any structural or motion check:

- **Squint** — one thing dominates: a Space Grotesk headline, a stat numeral, or a single
  glowing screenshot. Never two competing focal points.
- **Silence** — even the "busy" screenshot beats stay uncluttered outside the screen-frame itself;
  the dark ground is doing real work, not empty by accident.
- **Restraint** — indigo never appears twice for two different reasons in one frame (e.g. don't
  glow the screen AND fill a chip AND ring a cursor all at once — pick the one the beat needs).
- **Reference** — aim at a Linear / Vercel / Raycast launch-trailer, not a Loom walkthrough.
  Failure looks like a corporate explainer with a stock blue gradient.

- **Primary:** 1920×1080 (16:9), 30fps, matches source screenshots (1920×1080 native).
- **Vertical:** 1080×1920 (9:16) for a social cutdown — screen-frame shrinks, stacks with headline above/below.
- **Safe area:** `pad-x` 6cqw; bottom-right corner reserved for the counter, bottom edge for the progress rail.

## Colors

`{colors.bg}` cool near-black is the universal ground — never pure `#000` (there is a hair of
indigo in it, verify by eye against `#000` side by side). `{colors.text}` cool near-white carries
all display and chrome type. `{colors.primary}` / `{colors.primary-bright}` indigo is the **only**
accent hue: screen-frame borders/glow, chips, cursor rings, stat numerals, progress rail, the one
CTA fill. No green/red, no gradient, no second brand color anywhere. `{colors.accent-fill}` /
`{colors.accent-border}` are indigo at low opacity — the only "tint" moves in the system.

## Typography

Two ramps, hard separation of duty. The **kinetic ramp** (Space Grotesk 700, its heaviest real cut, tight tracking
−0.02 to −0.03em) is what enters, slams, and exits — headlines, the wordmark, stat numerals. The
**chrome ramp** (JetBrains Mono 400–700, uppercase, 0.06–0.14em tracking) is what sits still and
labels — eyebrows, feature chips, captions, the scene counter.

- **Legibility floor:** any load-bearing line ≥ 1.4cqw at 1920×1080; this is a feed-agnostic demo
  video (YouTube/site embed primary), so full-screen sizing applies — body/caption ≥20px equiv,
  headlines ≥60px equiv, chip labels ≥16px equiv.
- **Weight contrast is extreme by construction**: Space Grotesk 700 headlines (its heaviest real cut) against JetBrains
  Mono 400 captions — never settle for 700-vs-400, that reads flat in motion.
- **Numerals** always `font-variant-numeric: tabular-nums` on `stat-num` — this demo will show
  real product numbers (student counts, attendance %, batches) and columns must not jitter.

## Depth & Surface

Depth comes from **glow and line**, never from a card stack or drop shadow:

- **Screen-frame glow** — a soft, wide (80px spread), low-opacity indigo glow behind every
  screenshot is the primary depth cue. It should breathe (slow scale/opacity pulse), not sit static.
- **Hairline borders** — 1px indigo-tinted borders on screen-frames and chips; never a heavier
  outline, never opaque.
- **Ghost wordmark layer** — oversized, near-invisible (4–6% opacity) type drifting slowly behind
  content is the system's only "second layer." It replaces gradients/particles as the background
  interest.

**Ceiling:** no drop shadows (glow only), no opaque indigo fills except the closing CTA, no
gradients, no third color introduced "just for this one beat."

## Shapes

- **16px** — screen-frame corners (matches the product's own card radius family).
- **100px** — feature chips, the CTA pill.
- **12px** — any incidental card (rare; screens and type should carry almost everything).
- **50%** — cursor-ring only.
- **2px** — progress rail height. No square corners anywhere else in the system.

## Components

- **screen-frame** — the workhorse: every one of the 27 existing screenshots gets wrapped in this,
  never shown raw/edge-to-edge.
- **feature-chip / cursor-ring** — rapid-fire beat furniture: chip announces the feature in mono,
  ring calls out the exact UI element being demoed a beat before the cut.
- **stat-callout** — for real product numbers pulled from the script (batches, students, %).
- **cta-pill** — the single solid-color moment, closing frame only.
- **progress-rail / ghost-wordmark** — persistent chrome + background depth, both barely-there.

## Frame Treatments

> Recipe: ground · container · composes · focal · chrome · accent · silence · Fixed/Free · density.

### 1 · Cold Open / Hook (identity · move: ghost wordmark drift · centered-left)

**Ground** near-black + drifting ghost wordmark bleeding off the right edge. **Composes** eyebrow,
h1 hook line, thin accent-line. **Focal** a 2–4 word Space Grotesk `h1`, white, tight tracking —
the pain point or promise, not the product name yet. **Chrome** none (cold open has no counter).
**Accent** the ghost wordmark only. **Fixed** near-black ground, one hook line. **Free** the hook
copy itself. **Density** very low — this beat is under 2s.

### 2 · Feature Reveal (screen · move: screen-frame slam + parallax)

**Ground** near-black. **Composes** eyebrow (feature name, mono), feature-chip row, one
screen-frame (glowing, slightly scaled on entry, subtle parallax drift while held). **Focal** the
screenshot itself — full glow, framed, centered or rule-of-thirds offset. **Chrome** counter +
progress rail. **Accent** the screen-frame glow + one feature-chip. **Silence** the ground around
the screen does nothing else. **Fixed** screen-frame treatment, indigo glow. **Free** which
screenshot, which chip label. **Density** standard — this is the repeating workhorse beat, ~15–20
of these across the cut at fast pace.

### 3 · Rapid-Fire Chip Montage (feature-list · move: chip stagger, whip-pace)

**Ground** near-black, ghost wordmark faint behind. **Composes** 4–6 feature-chips entering in
fast stagger (~0.08–0.12s apart), each with a 1-word mono label. **Focal** the chip row sweeping
across in under 2s total. **Chrome** progress rail only. **Accent** every chip's indigo border.
**Silence** none needed — this beat IS the density. **Fixed** chip shape/typography. **Free** which
features, how many. **Density** highest in the piece — deliberately breathless.

### 4 · Stat Callout (data · move: numeral count-up)

**Ground** near-black. **Composes** stat-callout (numeral + mono caption), optional faint
screen-frame ghosted behind at low opacity. **Focal** an oversized indigo `stat-num` counting up,
tabular. **Chrome** counter + progress rail. **Accent** the numeral color + a thin accent-line
under it. **Silence** high — numeral is alone on the frame. **Fixed** numeral treatment, tabular
nums. **Free** the actual figure (from script/product data — never invented). **Density** low.

### 5 · Closing / CTA (closer · move: wordmark assemble + CTA rise)

**Ground** near-black, ghost wordmark resolves to full-opacity real wordmark. **Composes**
wordmark, one-line promise, cta-pill. **Focal** the Klixo Coach wordmark in Space Grotesk 700,
white, with the indigo `cta-pill` rising beneath it — the one fully solid-indigo element in the
whole video. **Chrome** none (final frame). **Accent** the CTA glow. **Silence** ~60%, this is the
one moment the video slows down. **Fixed** solid CTA, resolved wordmark. **Free** CTA label/URL.
**Density** low.

## Composition Rules

### Do

- Start every frame on **cool near-black**; let **indigo carry every accent** — glow, chip,
  numeral, rail, the one CTA fill.
- Wrap **every** screenshot in `screen-frame` — never a raw, un-glowed, un-bordered PNG cut
  straight to frame.
- Pair **Space Grotesk 700 kinetic type** against **JetBrains Mono 400–700 chrome** — keep the
  roles fixed, never swap which font performs vs labels mid-video.
- Use the **ghost wordmark** as the recurring background-depth device instead of gradients,
  particles, or a second color.
- Let **Rapid-Fire Chip Montage** beats carry the "fast paced" mandate — that's where breathless
  pace lives; Feature Reveal beats can breathe slightly longer to let the screenshot register.

### Don't

- No second accent hue, ever — not for positive/negative states, not for "just this one chart."
- No pure `#000` / `#fff` — always the cool-tinted near-black/near-white pair.
- No drop shadows — glow (soft, wide, indigo) is the only depth cue.
- No gradient text, no neon-on-dark cliché beyond the one indigo glow this system already commits to.
- No raw/unframed screenshots; no stock cursor-click sound-alike VFX beyond the cursor-ring.
- Don't invent product numbers — every `stat-num` traces to the script or the real product data.

## Aspect-Ratio Behavior

| Treatment              | 16:9                          | 9:16 (social cutdown)              |
| ----------------------- | ------------------------------ | ----------------------------------- |
| Cold Open / Hook        | hook line left, wordmark bleed right | hook line centered, wordmark bleeds top |
| Feature Reveal          | screen-frame centered, chip top-left | screen-frame full-width, chip below |
| Rapid-Fire Chip Montage | horizontal chip row             | 2×3 chip grid stagger               |
| Stat Callout            | numeral centered                | numeral centered, larger cqw        |
| Closing / CTA           | wordmark + CTA stacked, centered | same, tighter vertical rhythm       |

## Approved Entities

Real product: **Klixo Coach** (coaching-center management app). Screens come from the existing 27
PNG captures in `video/public/` (dashboard, rosters, timetables, batches, fees, teacher/owner
views, mobile views). No placeholder logos/customers needed — this is the actual product.

## Numerals & Claims (hard rule)

Never invent figures for `stat-callout`. Any number shown (student counts, attendance %, batch
counts, etc.) must come from the existing voiceover script/narration or be confirmed with the user
before the build step. Render unresolved slots as `— figure —` until confirmed.

## Known Gaps

- **Full motion choreography intentionally out of scope here** — this file specifies brand,
  composition, and pacing *targets* (see Frame Treatments density notes); exact GSAP easing,
  whip-pan/glitch-cut mechanics, and stagger timings are an `hyperframes-animation` build-time
  concern, briefed by this doc's "move" tags per treatment.
- **Space Grotesk is not a pre-bundled font** — it auto-fetches from Google Fonts at build time
  (real font, not banned). Fine for local/preview renders; if this project ever needs a
  distributed/cloud render, either confirm network reachability or swap to the bundled
  **Archivo Black** as a same-register fallback for `h1`/`wordmark` only.
- **9:16 cutdown is guidance**, not yet verified against a real render — chip-grid reflow and
  screen-frame scale-down need an eyeball pass once the 16:9 cut is locked.
