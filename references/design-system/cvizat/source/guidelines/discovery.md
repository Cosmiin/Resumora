# Resumora — discovery findings

Source: https://github.com/Cosmiin/AI-CV-Maker-V2 (main, read 2026-10-23). Repo is a discovery package — PRD, UX specs, architecture/ATS/cost research, CV schemas and a synthetic Romanian-first prototype ("atelier cv", not an approved brand). No production code.

## 1. Product in one paragraph
Resumora helps (primarily Romanian-speaking, resumora.ro) job seekers turn one trustworthy, versioned **Base CV** into an honest **job-specific CV** for each application. It reads a job ad, explains which requirements the candidate already shows, which they have but didn't include, what needs confirming, and what's genuinely absent — then proposes changes the user approves one by one. It never invents facts, metrics, titles or credentials, and never promises hiring outcomes.

## 2. Confirmed requirements (must do)
- Persistent, versioned Base CV; job CVs branch from it and never silently change it.
- Import via upload (PDF/DOCX) or manual entry, with field-level review and explicit confirmation.
- Two optional positioning titles; separate professional and technical skill groups; month/year partial dates with "unknown"; durations as ranges, overlaps counted once.
- Job input by paste/manual first (URL, browser extension later), with required vs preferred requirements.
- Four separate assessments: Candidate–Job Fit (whole confirmed profile), CV–Job Match (this document), Eligibility (satisfied / needs verification / confirmed gap), PDF Readability (Not tested until a real PDF is checked).
- Five keyword states: included, verified_equivalent, verified_omitted, awaiting_confirmation, unsupported. RO↔EN equivalence visible.
- Strict-gate warnings persist next to scores, comparison and export.
- Per-change approval; Undo/history; explicit, separate "promote to Base".
- Templates change presentation only. UI language ≠ CV language. Romanian primary, English secondary.
- Lean application records: latest CV, tailored/not, contact, next action, sent count.
- 1/3/6-month subscriptions (prices TBD); RO/EN; 44px touch targets, focus ring, reduced motion.

## 3. Proposed solutions in the repo (open to challenge)
- 21-route prototype with a 9-item left nav (Overview → Create → Base → Enrich → Jobs → Compatibility → Tailor → Templates → Account) + review guide.
- Home leads with "Start here · prepare for a job" and "Create my Base CV".
- Five qualitative Base checks (Content, Structure, Job optimisation, Writing, Readiness) — no combined score.
- Score display: 0–100 uncalibrated, illustrative (Fit 90; Match 62.5 → 90).
- Clar (serif) and Contur (sans) single-column templates.

## 4. Open questions (decision register D-01–14, all unresolved)
Capture scope (URL/extension/OCR), score display & calibration, template breadth, pricing/limits/gates, initial segment, post-cancellation access, data residency, enrichment blocking policy, unknown-field export policy, keyword status precedence, quota fallback, application-tracking depth, LinkedIn import depth. Also: final brand name/logo (Resumora given by user; repo uses "atelier cv").

## 5. UX opportunities & proposed departures
| What we challenge | Problem | Proposal | Why it's simpler |
|---|---|---|---|
| 9-item nav mirroring the data model | Users must understand Base/Enrich/Compatibility/Tailor as separate places | **4 places**: Home, My CV, Jobs, Account. Everything job-related happens inside one guided flow | Navigation matches goals, not internals |
| Separate Jobs → Requirements → Compatibility → Compare → Editor → Templates → Preview screens | 7 hops to one outcome | **One 4-step flow**: Add job → See your match → Improve CV → Download, with a Stepper and Exit | One objective + one primary action per step |
| Four scores shown side by side | Hard to tell which matters; invites misreading | **Verdict sentence first**, one primary number ("This CV vs the job"); Fit and Readability secondary; method behind disclosure | "What does this mean for me?" answered in one line |
| Findings listed by technical status (5 enums) | Status names describe the system, not the action | Group by **what to do**: Ready to add · To check · Already strong · Not in your experience | Every group implies its next step |
| Gaps shown in red | Feels like failure; pushes users to fake it | Absent experience is **neutral grey**; only confirmed strict-gate gaps use rose | Encourages honesty, reduces anxiety |
| Enrichment interview as its own destination | Questions out of context | Ask **inside the match report**, at the moment a question unlocks a fix (e.g. right-to-work dialog) | Questions feel useful, not like homework |
| Base promotion as a separate modal/route | Users may not notice it | Ask once at **save** ("Only this job / Update Base too") | Decision made at the natural moment |
| Templates and preview as two steps | Extra step | Template + language picked **on the Download step** beside a live preview | Fewer screens |

Preserved: per-change approval, honest gaps, persistent eligibility warning, Base immutability, partial dates, separate CV language, synthetic Mara/Northstar fixture.

## 6. Information architecture
- **Home** — next application (primary), active applications, Base CV health.
- **My CV** — Base CV editor, versions/history, improve-my-CV questions, import.
- **Jobs** — list/search of applications; each opens its job workspace (match, CV versions, status, contact, next step).
- **Account** — plan, language, data export/delete.
- **Guided flow (full-screen)** — Add job → Match → Improve → Download. Also a first-run flow: Upload/Type → Check details → Save Base.

## 7. Main journeys
1. **First run**: Upload CV → review extracted fields (unconfirmed highlighted) → confirm → Base v1 → immediate 3-line health check → "Add your first job".
2. **Prepare for a job** (core): paste ad → verdict + findings → answer any check → approve changes → save (optional Base update) → download → mark sent.
3. **Return**: Home shows the active application and its next action; one click resumes the right step.
4. **Improve Base**: targeted, skippable questions from health checks; each answer becomes a proposed fact the user confirms.
5. **Plan**: value shown first (Base health + one job comparison), then 1/3/6-month choice at download.

## 8. Visual direction
Friendly-professional: pine green + sage neutrals inherited from the prototype, warmed with marigold for attention and celebration. Rounded but not bubbly (8–18px), flat bordered cards, a tactile 2px press on buttons (the one Duolingo-like nod), a display grotesk with character for verdicts and numbers, and a calm serif for the CV page itself.
