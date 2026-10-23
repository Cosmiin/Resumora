# Architecture initial handoff v1 — 2026-10-23
Status: phase 1 ready for cross-review; hypotheses are proposals, not approved requirements. No production application or paid inference.

## Core boundaries
H-01: Base CV immutable snapshots reference stable facts/claims. Extracted/unconfirmed, user-confirmed, independently verified, suggested and rejected claims are distinct. User confirmation is not external verification. Generated summary/bullets reference supporting claim IDs and have their own approval state. A template changes presentation only. Each job snapshot has independent tailored versions; selective changes never mutate Base CV without a separate explicit confirmation command.
H-02: Canonical JSON represents every baseline section with independent section-instance ordering. Two positioning title slots remain separate from employment titles. Dates retain year/month precision; experience is interval union with lower/upper bounds, fixed as-of date and no addition of overlapping roles. Contact export visibility is explicit; full address is optional.

## Initial scoring proposal
H-03: Deterministic 0–100 estimated compatibility: technical 25, professional skills 20, responsibilities/domain 20, relevant experience 15, qualifications 10, positioning title 5, evidence-backed accomplishments 5. Redistribute absent job dimensions proportionally. Required items initially weight 3, preferred 1, unspecified 2; job emphasis multiplier capped at 1.5 and grounded in sentence evidence. No score cap for one missing requirement: show critical gaps separately. No penalties for employment gaps, address omission, age proxies or missing optional sections. PDF extraction/readability is a separate pass/warn/fail result; semantic completeness appears as an editorial recommendation, not score padding. These weights need calibration and explicit critique; no predictive validity claim.
H-04: Only confirmed evidence can earn confirmed matches. Unconfirmed suggestions show possible coverage separately. Exact/approved bilingual equivalents can match deterministically; ambiguous semantic links await review. CV-visible match score is distinct from Base CV potential, preventing unsupported generated words earning points.

## Stack alternatives
H-05: Compare A managed Postgres/Auth/private Storage (Supabase) + Cloudflare static/Worker API + bounded renderer; B one EU Node/Postgres host with local isolated Chromium and managed backups; C hybrid Supabase + EU Node container for extraction/rendering. Prefer one modular domain service and Postgres job table initially; avoid Redis/vector DB/microservices. Cloudflare runtime limits and EU processing guarantees must be checked before selecting A.
E-01 https://supabase.com/pricing (accessed 2026-10-23): Pro $25/month, Micro compute credit; usage overages matter.
E-02 https://developers.cloudflare.com/workers/platform/pricing/ (accessed 2026-10-23): paid minimum and CPU/request billing.
E-03 https://developers.cloudflare.com/browser-run/pricing/ (accessed 2026-10-23): paid 10 browser hours then $0.09/hour; concurrency priced separately for sessions.
E-04 https://developers.openai.com/api/docs/pricing (accessed 2026-10-23): use dated standard token rates, optional EU uplift, no free inference assumptions.
E-05 https://stripe.com/en-ro/pricing (accessed 2026-10-23): standard EEA cards 1.5% + RON 1; Billing 0.7% extra. Commercial plan amounts remain null/unapproved.

## Initial cost assumptions to challenge
H-06: Per active user per 30-day period: 0.25 uploads, 4 interview turns, 8 job parses, 4 full tailoring requests, 8 selective rewrites, 20 deterministic analyses, 6 PDF exports. 20% application response-cache hits on parse/tailor/rewrite; 5% extra inference attempts; 5% extra renders; 10 seconds/render; 10 MB live blobs and 1 MB database/user; explicitly model staging, backup storage and no prompt-cache discount in baseline. AI tokens include prompt/context and billed reasoning output. Cost at 100/1,000/10,000 active users is a scenario, not measured demand or capacity.

## Questions for UX and strategy, via Firstmate
Q-01 UX: Can the initial editor use fixed section kinds plus reorder/rename and custom evidenced sections, with per-bullet approval? Need confirmation that undo/version history and two independent titles are visible.
Q-02 UX: Can repeated analysis be deterministic/cached and single-bullet regeneration be the default? Avoid automatic full-tailor generation on each edit. Need score-delta presentation and explicit unconfirmed facts.
Q-03 strategy: Critique required/preferred weighting, no hard cap, and semantic/PDF separation; send primary ATS evidence and examples of regulated credentials. Do not label our metric an employer ATS result.
Q-04 strategy: Confirm proposed monthly-use assumptions/limits are defensible for MVP; price and paid conversion unknown. Need roadmap recommendation for extension and URL fetch versus paste first.
Q-05 both: Initial proposal favors paste-first job import, manual confirmation, one-column PDF and a small template set. Which baseline promises need retained UI even when implementation is staged?

## Dependency and decision register
D-01 awaits cross-review: final stack recommendation and staged module choices.
D-02 owner decision later: budget ceiling, commercial prices, residency strictness/provider processing consent, limits/grace policy/retention and extension launch timing. Preserve alternatives; no silent selection. These do not block independent discovery.

## Next
Implement discovery-only JSON Schema + synthetic validation, reproducible scoring fixtures, auditable runnable cost calculations, complete API/security/operations design, and browser-verified Lavish architecture/budget review. Cross-review not yet received; integrated package not complete.
