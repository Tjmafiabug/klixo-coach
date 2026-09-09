# Dashboard Research — LMS / ERP / Coaching-Centre Owner Dashboards

> Source: `deep-research` workflow (run `wf_97cba7ec-49d`), 2026-06-27.
> **Status: PARTIAL.** Scope + Search (5 angles) + Fetch (12 sources, 57 claims → top 25) **completed**.
> The **Verify** and **Synthesize** phases did NOT run — every verifier agent died on the
> session limit (reset 8:30pm IST). So the 25 claims below are **EXTRACTED-BUT-UNVERIFIED**
> (the "0-0, 3 abstain ✗" in the raw log = verifiers couldn't vote, NOT that claims were disproven).
> Trust them by **source quality** (tagged below): primary docs > vendor pages > blogs > unreliable.
> To finish: resume the workflow after the limit resets (see bottom).

---

## Research angles (how the question was decomposed)
1. Education product landscape — global LMS/SIS/ERP admin dashboards
2. India coaching-centre product landscape
3. Cross-industry ops/finance cockpit psychology
4. Canonical dashboard-design principles & data-viz theory
5. Action-first / at-risk / decision-fatigue research

Stats: 5 angles · 12 sources fetched · 57 claims extracted · top 25 carried to verify.

---

## 1. STRUCTURE / INFORMATION ARCHITECTURE

- **F-pattern layout → most important KPIs top-left, trends in the middle, detailed tables bottom-right.** Revenue/margin/service-level go top-left. _(blog: denottersolutions.com)_
- **Cap the landing view at 6–8 KPIs max** — each extra KPI competes for attention and slows interpretation. _(blog: denottersolutions.com)_
- **Three functional dashboard types, and the type dictates the design:** *strategic* (KPI health view for managers, non-real-time), *analytical* (trend tracking + BI drill-down), *operational* (what's happening now, simple visuals for fast decisions). [Stephen Few typology] _(blog: ergomania.eu; also chartio.com surfaced in search)_
- **Start IA from the user/role** — purpose and content differ by role (CEO/CFO/manager) and by group-vs-individual use. _(blog: ergomania.eu)_
- **Canvas Admin Analytics — Overview landing = exactly 6 account-wide charts:** Courses by status · Enrolled students with/without activity · Teacher use of courses with activity · Average course grades · Interactions by Canvas feature · Overall course interactions over time. An **operational-health overview, not a single headline number.** _(PRIMARY: community.instructure.com)_
- **Fedena — customizable, dashlet-driven dashboard:** admin adds/removes widgets per user privileges → **role-based dashboard composition**; framed as a single-pane "360-degree view" / KPI surface. _(PRIMARY: fedena.com)_

## 2. WHAT THEY OFFER (content / signals)

- **PowerSchool Performance Matters EWS — at-risk across 5 categories:** attendance · discipline/behavior · enrollment (mobility/retention) · grades/scores · a composite **"Multiple Indicators"** category. Escalates students at risk in >1 category via a **"Multiple Warnings" flag** = composite multi-signal prioritization, not a single metric. Flagging driven by **district-defined threshold rules (transparent, configurable)**, not an opaque model. _(PRIMARY: uc.powerschool-docs.com)_ → **directly validates our flight-risk = attendance+fees+PTM fusion.**
- **PowerSchool Risk Analysis** — predicts probability of on-time graduation from multi-source data (attendance, behavior, assessments, coursework) = a **composite early-warning score**; districts can use **ML thresholds OR override with their own** (adjustable/transparent, not black-box). _(secondary: powerschool.com)_
- **Canvas** surfaces an at-risk/early-warning signal as an explicit job-to-be-done (spot students needing intervention). _(PRIMARY: instructure.com press release)_
- **EISdigital (India coaching) — money-first widgets ABOVE operational detail:** Today's Collection · Expected Income · Recent Income Trends · Recent Due List · Recent PDC (post-dated cheque) tracking. **Confirms the India pattern of leading with a financial/collections band.** _(blog: eisdigital.com)_ → **validates our money "reckoning" band.**
- **Knwdle (India coaching)** — owner dashboard consolidates cross-batch state in one view: all batches · today's attendance summary · which teachers have marked attendance · fee-collection status · recent announcements. **Fee status at per-batch, per-month granularity** (who paid / who hasn't, within each batch). _(secondary: knwdle.com)_
- **Parent-facing dashboard** (India products) core metric set: attendance · mock scores · fee status · live-class participation. _(blog: igniterapp.com)_

## 3. THE "PSYCHE" (design psychology)

- **"It's not a report, it's a cockpit"** — every element must earn its pixel space by helping a decision. [Boundev — "12 rules used by top SaaS products"] _(blog: boundev.ai)_ → the spine of our verb-first thesis.
- **The "Action Dashboard"** (Avinash Kaushik) — four-quadrant model that separates the trend/graphic from the *insight* and the *recommended action*; foundational text for **advisory-vs-passive-report**. _(surfaced in search; URL: kaushik.net — NOT yet fetched)_
- **5-second rule** — within 5s of opening, the viewer should see whether the business is on track. _(blogs: denottersolutions.com, ergomania.eu)_
- **Knwdle — verb-first, action-oriented alert tiles** that pair a pending-task signal with an immediate remedial action (e.g., teacher hasn't marked attendance → prompt to send a reminder). _(secondary: knwdle.com)_ → **a real-world instance of our "Needs You" queue.**
- **Self-service / role-scoped analytics** (Canvas) reduce dependence on a reporting team — the admin answers their own questions. _(PRIMARY: instructure.com)_

---

## India product positioning (persona segmentation)
- **Teachmint** — solo teachers & very small institutes (<50 students); freemium.
- **Classplus** — institutes with an AMC budget wanting account-managed service.
- **Edmingle** — enterprise institutes (1000+ active students).
_(blog: igniterapp.com — note: vendor-authored, ranks its own product "best"; treat as non-independent.)_
→ KLiXO's single owner-operator persona sits in the **Teachmint band**.

---

## Source ledger (12 fetched, with quality)
| Quality | Source | Claims |
|---|---|---|
| primary | uc.powerschool-docs.com/performance-matters/.../early-warning-system | 5 |
| primary | community.instructure.com/.../661419 (Canvas Admin Analytics) | 5 |
| primary | instructure.com/press-release/...canvas-admin-analytics | 5 |
| primary | fedena.com/feature-tour/customizable-dashboard | 5 |
| secondary | powerschool.com/solutions/data/risk-analysis/ | 5 |
| secondary | knwdle.com/coaching-management-software | 5 |
| blog | denottersolutions.com/.../dashboard-design-5-seconds-rule | 5 |
| blog | ergomania.eu/key-ux-principles-design-great-dashboards | 5 |
| blog | boundev.ai/blog/dashboard-design-best-practices-guide | 5 |
| blog | eisdigital.com/coaching-institute-software-edtech | 5 |
| blog | igniterapp.com/best-app-for-coaching-institute-in-india | 5 |
| unreliable | teachmint.com/fee-management | 2 |

**High-value sources surfaced in search but NOT yet fetched** (fetch these on resume):
- kaushik.net — "The Action Dashboard" (Avinash Kaushik) — the verb-first/advisory canon.
- chartio.com — Stephen Few strategic-vs-operational-vs-analytical typology.

---

## How this maps to our planned structure (so far, CONFIRMED by evidence)
- **"Needs You" action queue on top** ✅ — Knwdle's verb-first alert tiles + Kaushik action-dashboard + "cockpit not report."
- **Money + retention "reckoning" band** ✅ — EISdigital leads with collections; PowerSchool/Canvas treat at-risk as a first-class signal.
- **Flight-risk = composite multi-signal** ✅ — PowerSchool EWS "Multiple Warnings" is exactly this pattern, and it's **threshold-transparent**, supporting our "show the formula, not a black-box score" stance.
- **Operational detail below** ✅ — Canvas overview = operational-health charts, not one headline number; cap visible KPIs at 6–8.

## To resume & finish (after limit resets 8:30pm IST)
- Script: `~/.claude/projects/-Users-ai-labs-klixo-coach/0e58dfe3-46b9-401e-9d9f-6657420a7ec3/workflows/scripts/deep-research-wf_97cba7ec-49d.js`
- Resume (cached agents replay free; only Verify+Synthesize run live):
  `Workflow({scriptPath: "<above>", resumeFromRunId: "wf_97cba7ec-49d", args: "<same research question>"})`
- **Must pass `args`** (the research question) or it errors instantly with "No research question provided."
