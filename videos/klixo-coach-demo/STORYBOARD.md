---
format: 1920x1080
duration: 70s
message: "Klixo Coach replaces paper, WhatsApp and spreadsheets with one system"
arc: Hook → Hook → 6× Feature Reveal (one with a real stat, one with a chip cascade) → Closing/CTA
audience: coaching-centre owners evaluating Klixo Coach
mode: collaborative
---

## Frame 1 — Hook A

- status: outline
- src: compositions/01-hook-a.html
- duration: 8s
- transition_in: cut
- scene: Ghost wordmark drifting behind a slammed headline; no product yet.
- voiceover: "Running a coaching centre is hard. Hundreds of students. Dozens of classes. A timetable that changes every week."

Cold Open. Headline slams in via `kinetic-beat-slam` (single phrase, one beat — the pain
statement). Body line rises a beat later on a plain `fromTo` (not a named rule; supporting text).
Ghost wordmark ("KLIXO") drifts at 4-6% opacity behind, idle from t=0 via `sine-wave-loop`.

## Frame 2 — Hook B

- status: outline
- src: compositions/02-hook-b.html
- duration: 8s
- transition_in: cut
- scene: Three pain-point words cascade in, then the punchline slams.
- voiceover: "Still running on paper? Registers. WhatsApp threads. Excel sheets. By the time you know who's falling behind, it's already too late."

"Registers." / "WhatsApp threads." / "Excel sheets." cascade via `waterfall-entry` (3 short
elements, one accelerating wave). The punchline ("By the time... too late.") lands after via
`kinetic-beat-slam`, distinct entrance axis from Frame 1's headline per the rule's "different
entrance per phrase" constraint.

## Frame 3 — Meet Klixo Coach

- status: outline
- src: compositions/03-login.html
- duration: 7s
- transition_in: chromatic-glitch
- scene: First screenshot — login.png — arrives inside the screen-frame.
- voiceover: "Meet Klixo Coach. Phone plus PIN login. No app to install. No training needed."

First Feature Reveal. This is the ONE `chromatic-glitch` use in the whole piece (Hook → first
product beat) — scarce per motion.md, never repeated. Screen-frame entrance via
`spring-pop-entrance` (smooth `power3.out`, no bounce — the current doctrine corrects motion.md's
earlier `back.out` note) + `motion-blur-streak` riding the same arrival window.

## Frame 4 — Teacher's Day

- status: outline
- src: compositions/04-teacher-today.html
- duration: 6s
- transition_in: whip-pan
- scene: teacher-today.png in the screen-frame, no body copy — headline only.
- voiceover: "Teachers see their day at a glance."

Feature Reveal. `spring-pop-entrance` (screen) + `motion-blur-streak`. Whip-pan CSS quick-pick in
from Frame 3 (beat-direction.md's connective-tissue default between Feature Reveals).

## Frame 5 — Attendance

- status: outline
- src: compositions/05-teacher-mark.html
- duration: 6s
- transition_in: whip-pan
- scene: teacher-mark.png; a cursor-ring calls out the mark-attendance action.
- voiceover: "Attendance in seconds. Present. Absent. Late. Done."

Feature Reveal + `cursor-click-ripple` (ring-only per frame.md's `cursor-ring` component,
restraint over a full traveling cursor) landing on the attendance action right before the beat
ends — content-appropriate since the VO is literally describing a click action.

## Frame 6 — Owner Visibility (real stat)

- status: outline
- src: compositions/06-owner-dashboard.html
- duration: 9s
- transition_in: whip-pan
- scene: owner-dashboard.png; "87%" counts up beside it with an ambient glow bloom.
- voiceover: "The owner sees everything. 87% attendance. Defaulters flagged automatically. Full visibility."

Feature Reveal + `counting-dynamic-scale` on "87%" (real figure from the existing script — never
invented) + `ambient-glow-bloom` (hero-bloom form) behind the stat. Longest beat (9s) — this is
where the "prove it" moment lives, matches motion.md's Stat Callout intent merged into a real
Feature Reveal rather than a separate invented beat.

## Frame 7 — Timetable Engine

- status: outline
- src: compositions/07-timetable.html
- duration: 7s
- transition_in: whip-pan
- scene: timetable.png in the screen-frame.
- voiceover: "Smart timetable engine. Weekly rules. Real-time clash detection. No more double-booked rooms."

Feature Reveal. `spring-pop-entrance` + `motion-blur-streak`, same family as Frames 4/7/9.

## Frame 8 — Manage Everything (chip cascade)

- status: outline
- src: compositions/08-manage-hub.html
- duration: 7s
- transition_in: cut
- scene: manage-hub.png settles, then 4 feature chips cascade beneath it.
- voiceover: "Manage your entire centre. Students, teachers, batches, rooms — one place. No spreadsheet."

Feature Reveal (`spring-pop-entrance` on the screen) + `waterfall-entry` chip cascade
(STUDENTS / TEACHERS / BATCHES / ROOMS) replacing prose body copy — content-driven straight from
the existing VO line, not invented. Hard `cut` in (not whip-pan) to punctuate the pace-up before
the montage texture; this is the closest the cut comes to motion.md's Rapid-Fire Chip Montage
without inventing a contentless interstitial beat.

## Frame 9 — Mobile

- status: outline
- src: compositions/09-m-dashboard.html
- duration: 5s
- transition_in: cut
- scene: m-dashboard.png, tighter/punchier framing — shortest beat in the piece.
- voiceover: "Fully mobile. Any phone. Any browser."

Feature Reveal, compressed. `spring-pop-entrance` + a quick `motion-blur-streak`. Hard cut in to
match the beat's own brevity — no whip-pan runway at 5s.

## Frame 10 — Closing

- status: outline
- src: compositions/10-closing.html
- duration: 7s
- transition_in: blur-through
- scene: Ghost wordmark resolves to full opacity; CTA pill rises beneath it.
- voiceover: "One system for your entire centre."

Closing. Blur-through transition in (the one deliberate slow-down per motion.md's rhythm plan —
fast-fast-...-hold-fast-SLOW). Ghost wordmark opacity-resolves in place (no scale/position
change). CTA pill via `spring-pop-entrance` (smooth `power3.out`), always-on indigo glow. Final
frame — no transition out.
