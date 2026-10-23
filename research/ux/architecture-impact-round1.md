# UX impact of architecture review feedback round 1

Date relayed: 2026-10-23 via task inbox `004.msg`. Exact adapter presentation is preserved as `artifacts/v1/sources/architecture-feedback-round1.txt` (complete: 6 declared / 6 presented annotations; no malformed items). Raw source material is retained in the task-owned discovery checkpoint and is excluded from the portable proposal.

## Feedback and UX disposition

| Annotation / exact source lines | Feedback | UX disposition |
|---|---|---|
| 1, lines 13–21 | Preference for Supabase + Cloudflare Worker API + Browser Run; prefers this architecture option. | Treat as owner preference to carry into architecture v2, not a production approval. UX PRD records the preference and still requires runtime, memory, data residency, external-processing and cost checks. |
| 2, lines 22–28 | Positive reaction to confirmation-first scoring, approved RO/EN equivalents and qualitative evidence. | Retain evidence-first behavior and explain qualitative accomplishments without requiring invented metrics. Existing UX-F02 status precedence remains one primary state with separate evidence/equivalence badges; architecture owns match-engine representation. |
| 3, lines 29–520 | Full ATS-01 specification: deterministic evidence scoring; category weights 30/25/15/10/10/5/5; required/unspecified/preferred priorities 3/2/1; evidence strengths 1/.75/.4/0; independent eligibility; separate Candidate–Job Fit and CV–Job Match; separate ATS Readability; persistent eligibility warnings; category/requirement explanations and recommendations. | Update product/screen requirements to distinguish full confirmed-profile fit from selected-document match, show eligibility separately with three states, classify hard gates independently of ordinary required requirements, and report PDF readability independently. Keep the present prototype’s existing numeric fixtures frozen until architecture provides v2 method/fixture pointers; do not claim the requested weighting or method is implemented. |
| 4, lines 522–530 | Try to remain on Supabase Free Plan initially. | Record as a cost/operations preference, not a promise that production infrastructure or AI is free. Preserve privacy, service-limit, availability, egress and migration checks. |
| 5, lines 531–537 | Browser Run if initially within a free zone. | Carry Browser Run as a preferred rendering/runtime candidate for architecture comparison. Validate browser limits, isolation, regional processing, memory/time constraints, queueing, observability and PDF fidelity before scope approval. |
| 6, lines 538–546 | OpenAI initially, with future flexibility for OpenRouter or similar. | Record provider preference and require a provider adapter / migration boundary in the architecture review. Do not run paid model experiments or imply inference cost is zero. |

## Required terminology and screen contract

- **Candidate–Job Fit** evaluates the complete confirmed professional profile against the job. Never show it as computed when that profile is unavailable.
- **CV–Job Match** evaluates only facts in the selected CV. This is the closest description of the current prototype's single illustrative value, but the visible v1 fixture remains unchanged pending method pointers.
- **Eligibility** is a separate state, based only on identified non-compensatory hard gates: Requirements satisfied; Needs verification; Confirmed requirement gap. Do not treat every occurrence of “required” as an eligibility gate. Keep strict-gate warnings beside any score, and repeat them in comparison and export preview.
- **ATS Readability** is independent from both semantic values. If no actual PDF extraction/read-order test ran, show Not tested; never let formatting change the semantic match value.
- Candidate Fit must remain unchanged when the same verified facts are reorganized or rewritten in a CV. CV Match may change only when verified facts are added/selected or a factual gap is resolved; wording, keyword repetition and layout alone earn no semantic points.

## Numeric and product boundary

The reviewed architecture spec proposes seven category weights (30, 25, 15, 10, 10, 5, 5), priority multipliers (3, 2, 1) and match strengths (1, .75, .4, 0), but those values are architecture review input, not a validated or approved UX method. The current prototype values and dimensions (including 62.5 → 82.5 → 87.5 and the 90/100 edge fixture) are preserved exactly until architecture v2 provides the canonical method version, fixture pointers and calculation receipts. They are not to be mixed with the new weights. Reconciliation and implementation remain subject to the consolidated owner gate `cvmaker-v2-discovery-approval`.

## Dependencies to Firstmate

Await architecture v2's method/version and canonical fixture pointers before changing numeric demo examples or comparison deltas. Descriptive UI labels may mark the existing number as a legacy CV–Job Match without calculating Candidate–Job Fit. UX can update semantics and acceptance copy now; any subsequent mockup update must keep the old numeric fixture identified as legacy/illustrative or replace it only with architecture-owned v2 receipts. Preserve free-tier and provider preferences as preferences until the owner approves budgets, service limits, privacy/residency and provider policy.
