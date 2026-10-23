# UX → architecture handoff v1 — 2026-10-23
Phase 1; ready for cross-review. Discovery only; product decisions unapproved.

## Verified inputs
Authoritative product-brief.md and approved dispatch read. Workspace contains README and .gitignore only, no theme/tokens. Inventory v1 has 44 PNGs plus ten Zone.Identifier metadata files; PNG dimensions/mtime/hash measured deterministically. Evidence S01–S06 are 1920px-wide long-page captures (10,249–12,756px tall); S07–S32 primarily narrow/cropped onboarding images, so narrow width alone is not proof of mobile design. S07 visibly asks whether the user is seeking a job with three choices, progress and Continue. Remaining screen classification is in progress, not claimed observed yet. Canonical inventory: research/ux/inventory.json.

## Flow contract derived from the baseline (requirements, not screenshot behavior)
A account → upload OR manual → asynchronous extraction → field-level structured review → explicit confirmation → immutable Base CV v1. Upload file retained separately from facts. Unconfirmed extracted fields never become trusted evidence automatically.
B missing-context question → editable answer → evidence summary → explicit confirmation → new Base version. Questions must allow skip/unknown/no metric. Preserve question, answer, provenance, confirmation and source version.
C URL/text/manual/extension capture → review parsed job → distinguish required/preferred → analyze against selected Base version. URL failures recover via paste; extension is a simulated consented capture only.
D estimated score → evidence-linked keyword statuses → useful section recommendation → confirm real content → recalculate with versioned inputs. Scores illustrative until architecture supplies methodology.
E proposed before/after edits → per-change accept/reject → new job CV version → structured editor → template → PDF preview/export concept. New facts may be offered back to Base with a separate approval. Rewrites must not silently mutate Base.
F choose 1/3/6-month term → simulated checkout → account entitlement states → renewal/cancel/failure. No commercial prices selected.

## Editor/API needs for feasibility feedback
- Two independent positioning titles; employment titles remain factual. UI locale and CV language separate.
- Separate professional/technical skill arrays with evidence IDs, independent order/selection.
- Dates {year, month?}; current employment explicit. Unknown month stays unknown. Localized rendering; validation end >= start only at available precision; experience totals avoid overlap/double count and display uncertainty.
- Experience: role, employer, location, short context; default 3–4 verified bullets; selection/order; missing metrics prompt, never generated numbers.
- Stable IDs for sections/roles/bullets; document ordering independent of data order; add/remove/rename/reorder optional sections; undo/history/restore as new versions.
- Provenance states extracted_unconfirmed / user_confirmed / suggestion_pending. Single-bullet/summary changes separately reviewable.
- Job CV branch references Base version and job version. Optimistic concurrent-edit/conflict behavior needed. Save/failure/retry distinct from confirmation.
- Keyword statuses included / verified_omitted / verified_equivalent / awaiting_confirmation / unsupported. Bilingual equivalence evidence visible, e.g. gestionarea părților interesate ↔ stakeholder management; do not equate adjacent credentials/tools.
- Score response needs semantic dimensions, formatting dimensions, required/preferred coverage, per-item evidence/reason, method version and input versions. Required missing qualification stays visible regardless of score.
- Section recommendation response needs job evidence, verified facts available, unanswered questions, proposed content and limitations; no empty sections.
- Export requested version/language/template, rendering status/retry, PDF text-order validation separate from semantic score.

## Dependency questions (please relay architecture response)
AR1 simplest partial-date/overlap representation and localization? AR2 proposed version/undo granularity and Base-vs-job save contract? AR3 method version + score dimensions/weights and illustrative fixture values? AR4 export format/rendering/PDF validation simplification? AR5 supported URL import boundary and MVP extension scope? AR6 async state enum/retry/cancel and entitlement read-only contract?

## Reviewable options (not selected product policy)
PD1 first-run: short account/upload path with optional enrichment later (recommended for lower friction) vs mandatory guided interview.
PD2 job-change approval: per-change acceptance plus explicit optional Base promotion (recommended) vs one document-level approval.
PD3 export entitlement: preview freely then enforce published plan limits at export vs gate analysis; commercial limits/prices belong to owner.
PD4 MVP extension: defer extension while preserving paste/manual recovery vs minimal consented capture at launch.
These do not block a reversible prototype showing both paths. Record owner choices through Firstmate before implementation.

## Limitations
Static evidence cannot establish network behavior, extraction accuracy, server persistence, score validity, payment behavior, responsive breakpoints or successful export. Browser startup returned BRIDGE_NOT_READY on first attempt; investigating supported local target before claiming verification. No production app/services, model calls or payments.
