# OpenRouter primary / direct OpenAI fallback: offline groundwork

Prepared 2026-10-28. **Live CV generation remains disabled. Neither route is proven strict EU-only.** This is a technical readiness assessment for owner review, not a compliance certification. Nothing was deployed, enabled, purchased or sent for inference. No existing secret values were read.

## Existing flow and chosen boundary

Current endpoint, configuration, context minimization, wording approval and execution limits are
owned by [CV ingestion and enrichment](cv-import-enrichment.md). This document retains
only historical strict-EU research and dated cost candidates, not the activation policy.

The exact context projection lives in
[`careerContext`](../../packages/contracts/src/intelligence/context.ts), with synthetic
[enhancement checks](../../apps/api/tests/enhancement.test.mjs). The separate fixed-prompt
connection check and synthetic dashboard are documented in [OpenAI/admin preparation](openai-admin.md).

## Bounded provider flow and accounting

See the current [enhancement behavior](cv-import-enrichment.md#enhancement-behavior) and
[durable accounting contract](cv-import-enrichment.md#durable-operationattempt-accounting).
The [OpenAI/admin guide](openai-admin.md#api-and-estimate-rules) owns versioned price snapshots
and estimate arithmetic. Provider-reported request charges exclude credit-purchase fees and
separately invoiced BYOK charges; they are not invoice reconciliation.
[Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting),
[pricing/fees](https://openrouter.ai/pricing).

## EU evidence matrix

All linked official pages were fetched publicly on **2026-10-28**, without account credentials or customer data. These observations are not proof of this application's account entitlements or infrastructure. A self-authored evidence record merely gates the rehearsal; it cannot substitute for external contracts/technical evidence.

| Segment | Verified official statement | Account-dependent evidence / unresolved gap | Historical strict-EU assessment |
| --- | --- | --- | --- |
| Application/client ingress, API execution, persistence and observability | Existing app uses a Cloudflare Worker and Supabase; this change adds no regional deployment configuration. | Owner must demonstrate EU-only TLS termination/execution, database/backups, logs, exception capture and support/subprocessor access for CV content. A database location alone cannot prove the request path. No signed-in account inspection performed. | Unverified; disabled. |
| OpenRouter gateway and shared inference | Regional API decrypts in-region and restricts shared endpoints; incompatible features fail. Published Europe region includes EU/EEA, UK and Switzerland. [In-region routing](https://openrouter.ai/docs/guides/features/in-region-routing) | Business/Enterprise entitlement, exact EU-country gateway/inference restrictions and endpoint allowlist, no global/BYOK routing. Published regional guarantees are broader than strict EU. | Incompatible with strict EU proof as currently evidenced. |
| OpenRouter contract, subprocessors and retention | DPA Exhibit A needs a written election and covers API payload processing in EU/EEA; standard security schedule describes US hosting. Employment information is within its Sensitive Data definition, requiring agreement for processing. [DPA, sections 1.15, 2.6, Schedule 2 and Exhibit A](https://openrouter.ai/data-processing-agreement) | Executed applicable agreement covering CV employment data, EU-member-only restriction rather than EEA, full subprocessors/remote access, transient/cache/security/log exceptions and legal exceptions. Exhibit A does not establish strict EU-member-only processing. No account agreement verified. | Unapproved; no CV content sent. |
| OpenRouter logging/privacy | Regional input/output logging is skipped; provider retention remains provider-specific. [EU routing business page](https://openrouter.ai/business/eu) | Evidence that content-bearing security/abuse logs, downstream caches and observability never leave the EU; selected provider's contractual retention/access terms. A no-training or ZDR label alone is insufficient. | Unverified. |
| Direct OpenAI fallback | Europe processing region is EEA + Switzerland. Non-US residency requires abuse-monitoring approval and a Modified Retention amendment; eligible endpoint/model required. TLS uses regional handling. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) | Owner key/project eligibility, applicable contracts/retention, EU-member-only restriction, supported pinned snapshot and subprocessor path. Ordinary personal key or `store:false` is insufficient. | Broader published geography; strict EU not proven. |

**Historical conclusion:** neither generic regional hostname establishes a strict EU-member-only path; EEA/Europe must not be described as EU-member-only. GDPR/SCCs, retention controls and geographic guarantees answer different questions. The [current processing policy](cv-import-enrichment.md#owner-configuration-paid-mode-remains-off) supersedes strict EU as an activation requirement; this matrix remains evidence of the limits of any geographic claim.

## Cost candidates, conditional only

No currently reviewed candidate is approved for **strict EU-only** operation. The following are inexpensive candidates for later eligibility/quality evaluation, not selected models or approval to call them:

| Route / candidate | Public observation (USD per 1M input/output tokens) | Remaining gate |
| --- | --- | --- |
| OpenRouter `openai/gpt-5-nano` | Regional metadata lists $0.055 / $0.44 and structured outputs / `max_completion_tokens`. [Public EU model metadata](https://eu.openrouter.ai/api/v1/models) | Conditional schema-compatible candidate; exact endpoint, EU-member geography, retention and Romanian/English factual quality remain unverified. |
| OpenRouter Amazon Nova Micro 1.0 | Regional catalog lists $0.035 / $0.14. [Official EU catalog](https://openrouter.ai/business/eu) | Public metadata omits structured outputs: excluded from the current strict-schema request seam. Geography/retention also unapproved. |
| OpenRouter Amazon Nova Lite 1.0 | Regional catalog lists $0.06 / $0.24. [Official EU catalog](https://openrouter.ai/business/eu) | Also lacks advertised structured outputs in current metadata; excluded from current request seam. Catalog listing is broader Europe eligibility, not EU proof. |
| Direct `gpt-5.4-nano-2026-03-17` | Base input/cache/output $0.20/$0.02/$1.25; published regional uplift 10%. [Official model page](https://developers.openai.com/api/docs/models/gpt-5.4-nano) | Eligible regional snapshot is listed in data controls, but account and strict geography remain unapproved. Hypothetical uplifted input/cache/output: $0.22/$0.022/$1.375; not installed as a price snapshot. |
| Direct `gpt-5.4-mini-2026-03-17` | Base input/cache/output $0.75/$0.075/$4.50. [Official model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini) | Quality escalation candidate only; regional uplift/entitlement and strict geography must be reconfirmed before use. |

Existing standard OpenAI price fixtures omit regional surcharges and must not price a regional
route. Historical price snapshots remain immutable.

Use small scoped prompts, bounded output and one proposal at a time. Do not automatically escalate models for validation failures, introduce free/global routers, or opt into prompt logging for discounts. Regional/provider-specific pricing and fees must be snapshotted at activation; availability and prices can change. No quality benchmark or paid experiment was performed.

## Activation checklist and owner inputs

Use [current owner configuration](cv-import-enrichment.md#owner-configuration-paid-mode-remains-off).
The strict-EU synthetic checklist in [`region.ts`](../../apps/api/src/ai/region.ts) remains a
rehearsal only. Its invented evidence cannot authorize execution or certify residency. Any future
strict-EU variant would require externally verified route/account, retention, subprocessor and
application-path evidence, not an environment flag or browser attestation.

## Verification scope

The [enhancement checks](../../apps/api/tests/enhancement.test.mjs) exercise the historical
synthetic evidence gate. Current connected checks and their limits are owned by the
[connected setup guide](cv-import-enrichment.md#offline-checks). No live model quality, account
entitlement or geographic guarantee follows from injected transports.
