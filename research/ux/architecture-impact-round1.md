# UX impact of architecture review feedback round 1

Date relayed: 2026-10-23 via task inbox `004.msg`. Exact adapter presentation is preserved as `artifacts/v1/sources/architecture-feedback-round1.txt` (complete: 6 declared / 6 presented annotations; no malformed items). Raw source material is retained in the task-owned discovery checkpoint and is excluded from the portable proposal.

## Feedback and UX disposition

| Annotation / exact source lines | Feedback | UX disposition |
|---|---|---|
| 1, lines 13–21 | Preference for Supabase + Cloudflare Worker API + Browser Run; prefers this architecture option. | Treat as owner preference to carry into architecture v2, not a production approval. UX PRD records the preference and still requires runtime, memory, data residency, external-processing and cost checks. |
| 2, lines 22–28 | Positive reaction to confirmation-first scoring, approved RO/EN equivalents and qualitative evidence. | Retain evidence-first behavior and explain qualitative accomplishments without requiring invented metrics. Existing UX-F02 status precedence remains one primary state with separate evidence/equivalence badges; architecture owns match-engine representation. |
| 3, lines 29–520 | Full ATS-01 specification: deterministic evidence scoring; category weights 30/25/15/10/10/5/5; required/unspecified/preferred priorities 3/2/1; evidence strengths 1/.75/.4/0; independent eligibility; separate Candidate–Job Fit and CV–Job Match; separate ATS Readability; persistent eligibility warnings; category/requirement explanations and recommendations. | Update product/screen requirements to distinguish full confirmed-profile fit from selected-document match, show eligibility separately with three states, classify hard gates independently of ordinary required requirements, and report PDF readability independently. The original hold on fixture changes was superseded by the integrated [architecture snapshot](../architecture/README.md); current assessment semantics are owned by [PRD §8](../../docs/product/prd.md#8-job-fit-cv-match-eligibility-and-recommendations). |
| 4, lines 522–530 | Try to remain on Supabase Free Plan initially. | Record as a cost/operations preference, not a promise that production infrastructure or AI is free. Preserve privacy, service-limit, availability, egress and migration checks. |
| 5, lines 531–537 | Browser Run if initially within a free zone. | Carry Browser Run as a preferred rendering/runtime candidate for architecture comparison. Validate browser limits, isolation, regional processing, memory/time constraints, queueing, observability and PDF fidelity before scope approval. |
| 6, lines 538–546 | OpenAI initially, with future flexibility for OpenRouter or similar. | Record provider preference and require a provider adapter / migration boundary in the architecture review. Do not run paid model experiments or imply inference cost is zero. |

## Current contracts and integration status

The [PRD assessment contract](../../docs/product/prd.md#8-job-fit-cv-match-eligibility-and-recommendations) owns terminology and evidence invariants; [screen specifications](screen-specifications.md) describe current demo behavior. The [architecture snapshot](../architecture/README.md) supplies the integrated versioned method and canonical Mara fixture, superseding the earlier instruction to await v2 pointers or retain legacy score examples. These discovery artifacts do not validate production scoring.

Free-tier/provider preferences remain preferences until the owner approves budgets, service limits, privacy/residency and provider policy; see the [technical integration contract](../../docs/product/prd.md#11-technicalcost-integration-snapshot).
