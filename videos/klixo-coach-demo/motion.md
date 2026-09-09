# Klixo Coach — Motion Direction

Companion to `frame.md` (brand/composition — read that first). This is the choreography layer:
which atomic rules and transitions fill in the "move" tag on each of frame.md's five Frame
Treatments. Build-time reference for `hyperframes-animation`, not itself a spec of colors/type.

## Rhythm

**fast-fast-SLAM-fast-fast-hold-fast-SLOW.** Cold Open hooks in under 2s → Feature Reveal beats
run ~2.5–3.5s each (screenshot needs to actually register) → every 3rd or 4th beat a Rapid-Fire
Chip Montage breaks the rhythm at double speed → one Stat Callout mid-video is the first real
breath → Closing/CTA is the one deliberate slow-down, ~60% silence. Energy peaks at the Chip
Montage beats — that's where "fast paced, trending" lives; Feature Reveals are the connective
tissue and get sound-conscious pacing, not rushed.

## Trending-effects menu used in this cut

Named atomic rules from `hyperframes-animation/rules-index.md` — reference during build, don't
reinvent:

| Beat                     | Entrance / idle                          | Transition out                    |
| ------------------------ | ----------------------------------------- | ---------------------------------- |
| Cold Open / Hook         | `kinetic-beat-slam` (scale-slam variant)  | `chromatic-glitch` (entrance stretch form) |
| Feature Reveal           | `spring-pop-entrance` + `motion-blur-streak` on the screen-frame's arrival | whip-pan (CSS quick-pick or `whip-pan` shader) |
| Rapid-Fire Chip Montage  | `waterfall-entry` (binary opacity, ≤0.5s cap for the group) | hard cut (percussive, no transition) |
| Stat Callout             | `counting-dynamic-scale` (numeral) + `ambient-glow-bloom` (backdrop) | blur-through / crossfade (this is the breath) |
| Closing / CTA            | `spring-pop-entrance` on the CTA pill, ghost-wordmark resolves via opacity tween | — (final frame) |

Cursor call-outs inside Feature Reveal beats use `cursor-click-ripple` (the ring in frame.md's
`cursor-ring` component is this rule's visual, simplified to ring-only — no traveling cursor glyph,
keeps the system quiet per frame.md's Restraint rule).

## Per-Beat Direction

### 1 · Cold Open / Hook

**Concept.** The viewer lands mid-thought, not mid-pitch — a pain point SLAMS into frame like the
video already started before you opened it. No logo yet, no product shot. Just the problem, stated
hard.

**Choreography.** The hook line (2–4 words) `kinetic-beat-slam`s in on a single shared beat — scale
overshoot via `back.out`, not a fade. The ghost wordmark behind it DRIFTS (`sine-wave-loop`,
already idle from t=0, not triggered by this beat).

**Transition out.** `chromatic-glitch`, entrance-stretch form — RGB-split snap, quantized-time hash
(never `Math.random`), brief vibration then clean resolve into the first Feature Reveal. This is
the video's signature "trending tech" transition; reserve it for THIS cut only (hook → first
feature) so it reads as a deliberate punctuation, not a repeated tic.

**Depth layers.** BG: near-black + ghost wordmark. MG: none. FG: hook line only.

**SFX cue.** A single low sub-hit under the slam; the glitch transition gets a short digital
stutter, not a whoosh.

### 2 · Feature Reveal (repeating workhorse, ~15–20 instances)

**Concept.** Each instance is a confident, unhurried beat inside an otherwise fast video — this is
where the product actually gets to be seen. The screen-frame arrives like it's being placed by
hand, not thrown.

**Choreography.** Screen-frame `spring-pop-entrance` (scale 0.92→1, `back.out(1.4)`, no overshoot
past 1.03 — restrained per frame.md) with `motion-blur-streak` on the fastest part of the arrival
only (peaks mid-tween, resolves to zero at settle). Feature-chip label CASCADES in a beat after
the screen (single-item `waterfall-entry`, not a group). If the beat calls out a specific UI
element, `cursor-click-ripple` lands on it ~0.3s before the transition out cues the cut — the ring
pulses, no traveling cursor.

**Transition out.** Whip-pan — CSS quick-pick (`x:-400, blur:24px, 0.3s power3.in` exit /
`x:400→0, blur:24px→0, 0.3s power3.out` entry) for most cuts; swap in the `whip-pan` shader
(0.3–0.5s) for the 2–3 Feature Reveals the script marks as highest-priority features, so the
premium transition stays scarce and lands where it matters.

**Depth layers.** BG: near-black, ambient-glow-bloom breathing behind the screen (already
specified as the screen-frame's own glow in frame.md — this is that glow, animated). MG: the
screen-frame. FG: eyebrow (mono) + one feature-chip.

**SFX cue.** Soft whoosh synced to the whip-pan's peak velocity; a faint UI-click tick under the
cursor-ring pulse.

### 3 · Rapid-Fire Chip Montage (the pace beat, recurs 3–4×)

**Concept.** The video visibly speeds up — this is the "trending, fast-paced" mandate made
literal. Four to six features assert themselves in under 2 seconds, then it's over.

**Choreography.** `waterfall-entry` across the whole chip row — binary opacity (never fade an
arrival), each chip's tween starting before the previous settles, stagger capped so the whole
group reads as ONE beat (~0.08–0.12s offset × up to 6 chips ≤ 0.5s per the rules-index contract
ceiling). No idle motion once settled — they hold static for a beat, then hard-cut out.

**Transition out.** Hard cut. No transition — per beat-direction.md's own rule, rapid-fire
sequences of 3+ quick tempo-matched switches want the cut itself, not a transition eating into the
tempo.

**Depth layers.** BG: near-black, ghost wordmark faint. MG/FG: the chip row only — no screen-frame
in this beat, chips carry it alone.

**SFX cue.** A rapid tick per chip (pitched up slightly chip-to-chip), or one composite riser under
the whole group — pick one, not both (avoid clutter).

### 4 · Stat Callout (the one breath, single instance mid-video)

**Concept.** The video stops accelerating for a moment and lets one real number land. This is
the "prove it" beat, positioned after the features have been shown, before the close.

**Choreography.** `counting-dynamic-scale` — the numeral counts up with transform-scale growing
alongside the value for escalating emphasis (tabular-nums, `Math.round`, seek-safe onUpdate).
Backdrop gets `ambient-glow-bloom`, single-pass, blooming in behind the numeral and holding at a
bounded idle breathe (peak opacity ≤0.45).

**Transition out.** Blur-through (`blur:20px, 0.3s` exit / `blur:20px→0, 0.25s power3.out` entry)
or a plain crossfade — this is the one place a soft dissolve is correct; it's the deliberate tempo
drop, don't whip-pan out of it.

**Depth layers.** BG: near-black + the glow-bloom. FG: numeral + mono caption, nothing else.

**SFX cue.** The count-up gets a very quiet tick per digit-step (or none — silence can carry this
beat harder than sound). No sub-hit here; save impact sounds for the slam/chip beats.

### 5 · Closing / CTA

**Concept.** The one moment the video lets itself slow all the way down. Everything that's been
fast until now resolves into stillness — the ghost wordmark finally becomes the real wordmark.

**Choreography.** Ghost wordmark (already drifting at 4–6% opacity since scene 1's background
layer) OPACITY-tweens to full strength in place — no scale change, no repositioning, it just
resolves. `spring-pop-entrance` on the CTA pill beneath it, slight overshoot (`back.out(1.6)`, a
touch more spring than the Feature Reveal screens get — this is the one place a little extra
bounce is earned).

**Transition out.** None — final frame, hold to black or end card per the composition's outro
contract.

**Depth layers.** BG: near-black. MG: resolved wordmark. FG: CTA pill, its own soft indigo glow
(always-on per frame.md, not hover-only).

**SFX cue.** Everything drops out except a single warm chime on the CTA pill's spring-settle.

## Cross-Beat Rules

- **Binary arrivals only.** Every entrance in this system (`kinetic-beat-slam`, `waterfall-entry`,
  `spring-pop-entrance`) sets initial opacity via `tl.set`/`fromTo`, never a fade — this system's
  "fast" feeling depends on arrivals reading as snaps, not dissolves. The Stat Callout's soft
  transition is the sole intentional exception.
- **Glitch is scarce.** `chromatic-glitch` appears exactly once (Cold Open → first Feature Reveal).
  Repeating it flattens its impact and reads as a tic, not a signature.
- **Whip-pan is the default connective transition** between Feature Reveal beats; the `whip-pan`
  shader is reserved for the 2–3 highest-priority features per the script.
- **Velocity-match every whip-pan and shader cut** per beat-direction.md: accelerating ease + blur
  ramp out, decelerating ease + blur clear in, meeting at the cut.
- **No transition competes with a chip montage.** Those beats hard-cut in and out, full stop.
