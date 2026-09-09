---
workflow: general-video
flow: companion
storyboard: no
message: "Klixo Coach replaces paper, WhatsApp and spreadsheets with one system"
destination: website/social (generic)
aspect: 1920x1080
language: en
length: 70s
angle: product-demo-rebuild
---

## Intent

Rebuild of an existing basic product-demo video (`video/` — a Remotion slideshow) into a
modern, fast-paced, kinetic-typography treatment. Same real content and real voiceover as the
original — this is a visual/motion upgrade, not a new script. Register: modern SaaS demo, dark
and fast, closer to a product-launch trailer than a tutorial.

## Assets

- `assets/voiceover.mp3` — the existing recorded narration (69.85s), reused verbatim; scene
  durations are locked to the original slide timings that were tuned against it.
- `assets/screens/login.png`, `teacher-today.png`, `teacher-mark.png`, `owner-dashboard.png`,
  `timetable.png`, `manage-hub.png`, `m-today.png` — the 7 real product screenshots the
  original script actually narrates over (out of 27 available; the rest weren't used by the
  original script and stay unused here too — no content invented). Note: the original used
  `m-dashboard.png` for the "Fully mobile" beat, but that capture shows the app's error state
  ("Something went wrong"), not real content — swapped for `m-today.png` (same mobile UI,
  same dimensions, real session data) since the VO line ("Any phone. Any browser.") isn't
  tied to specific screen content.
- `frame.md` — approved design spec (colors, type, components) — moodboard reviewed and
  approved by the user.
- `motion.md` — approved motion direction (per-treatment choreography, rhythm, named
  animation-library rules) — reviewed and approved by the user via a live artifact.

## Customizations

- Real number "87%" (attendance) from the original script renders via `counting-dynamic-scale`
  — not invented, traced to the existing narration.
- `manage-hub` beat's feature list ("Students, teachers, batches, rooms") renders as a
  rapid chip cascade (`waterfall-entry`) instead of prose — content-driven, not decoration.

## Notes

- Scope is a re-skin: same 10 beats, same voiceover, same screenshots. No new scenes, no new
  claims, no new numbers.
- Design/motion already approved (moodboard + motion artifacts); proceeding straight to build
  per user's "cool, go" — no further storyboard-board review requested.
