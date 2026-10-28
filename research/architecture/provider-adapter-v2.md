# AI provider boundary — preparation contract

The [enhancement groundwork guide](../../docs/setup/openrouter-enhancement.md)
owns the current provider order, disabled rehearsal, EU evidence and activation
requirements, superseding the discovery round-1 provider order. Neither adapter
is activated by the target-vacancy contract. The architectural requirements below
describe the future integration. Domain modules depend on a small structured
generation/matching port; they do not depend on router-specific SDK objects or
allow models to set final scores.

Request contract: operation,tenant/operation IDs,selected confirmed evidence/requirements,locale,prompt/schema version,approved model/routing policy,max input/output/reasoning tokens,timeout,region policy and idempotency metadata. Response: proposed structured requirements/evidence/prose,validation errors,provider request ID,requested/resolved model,actual upstream provider,usage and billing provenance. Stream tokens may improve UX but only validated complete output can be accepted into facts/mappings. No raw source PII in meter logs.

Both adapters sit behind the same port. Record router request ID **and** upstream provider/model/endpoint,quantization/context/pricing mode where reported,router/upstream reported usage,estimated versus actual billed costs/currency/fee schedule and data-policy version. Unknown upstream usage or router fee stays unknown. No assumption that router prices/cache/tokenization equal directOpenAI. Re-run authorized synthetic quality/cost/contract regressions before switching; deterministic scores replay accepted mappings regardless of the original model.

Require provable EU-only processing before CV/job content leaves the application
boundary, including fallback. Each operation must retain evidence of the approved
route configuration, actual upstream provider/model/endpoint and applicable
region/data-policy version, bound to its pinned input versions. If that route
cannot be proven before dispatch, fail closed without inference. The executable
evidence checklist and its activation limits are described in the
[groundwork guide](../../docs/setup/openrouter-enhancement.md#activation-checklist-and-owner-inputs);
production evidence binding to pinned input versions remains pending. This
groundwork certifies no provider or deployment. Proof records must exclude raw
CV/job content, URLs, tokens and keys.

Allowlist approved providers/endpoints/models; disable unapproved fallbacks. Require structured-output parameter support and approved retention/training policy. A provider outage may queue/fail safely instead of transferring private CVs to another region. Router and upstream terms remain separate; a Europe routing label alone does not prove strict EU-only processing. The dated E-27 research snapshot is not proof that a route meets the requirement. Recheck exact account/model/endpoint eligibility before activation. Keep input/output logging off unless specifically justified/approved; minimize PII before either adapter.

First implementation can use one provider and a handful of adapter methods. No orchestration framework,multi-agentservice or runtime auto-model marketplace needed. Secrets stay server-side; quotas/spend ceilings apply before each attempt. Hard total/model usage caps,timed retries andunknown-cost reconciliation prevent hiddencosts. All actual prices and operational eligibility must be rechecked when integration is authorized. SourcesE-06/E-27 in sources.md.
