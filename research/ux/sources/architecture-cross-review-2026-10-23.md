# Cross-review dispositions v1 — 2026-10-23

Phase 2 input: Firstmate relayed the authorized UX and strategy handoffs, both read in full. Findings below are architectural recommendations, not product approvals. No direct worker contact or additional private-output inspection.

## UX response

**AR1 accepted:** persist `{year:2021,month:1}` or `{year:2021}` with `ongoing:true,endClaimId:null`; unknown start remains null. Render exact months with locale-aware Intl month names, year-only as2021 and ongoing asPrezent/Present. Never replace missing months withJanuary in facts or UI. Scoring computes bounds only: complete-month union with fixed as-of2026-10-23; overlaps counted once. Synthetic roles yield71–94 calendar-month envelope. Date gaps are not score penalties. Employment end validation compares possible ranges at known precision, not invented exact dates. Details [method](../ats/method-v1.md), fixture [full](../../schemas/cv/v1/fixtures/full-ro.json).

**AR2 accepted:** stable section/role/prose IDs; autosave drafts with revision/ETag and immutable checkpoints at explicit save, confirmed enrichment, accepted tailoring batch and restore. `If-Match` mismatch returns409 with current revision and changed IDs, preserving local changes. Undo within draft is local inverse patch; restore creates a new version. Tailored context `{kind:'tailored',baseSnapshotId,jobSnapshotId,previousTailoredSnapshotId}` never promotes facts into Base. Explicit promotion command carries selected claim IDs and expected Base head. Two independent positioning title slots; employment title claims stay separate. See [contracts](contracts.md).

**AR3 accepted with clarification:** method `compatibility-1.0.0`; technical25/professional20/responsibilities20/experience15/qualifications10/positioning5/achievements5. Absent dimensions renormalize; required3/preferred1/unspecified2 with evidence-based emphasis<=1.5. Method labels remain uncalibrated. Synthetic Base62.5→tailored87.5; delta20 for confirmed process evidence selected into document,5 for newly confirmed impact, not wording alone. Required credential missing can score90 while showing a critical gap; numeric score is not eligibility. Date-only uncertainty ranges62.5–66.25 and87.5–91.25 are envelopes, not statistical confidence intervals. Keyword statuses map to UX names included/verified_omitted/verified_equivalent/awaiting_confirmation/unsupported. [Runnable examples](../ats/worked-examples-v1.json).

**AR4 accepted:** request `{snapshotId,templateVersionId,locale,contactIds,expectedContentHash}`; operation emits export ID only after snapshot validation, entitlement reservation, PDF render and independent text-order checks. Local pinned Chromium for recommended stack; no browser print dialog used as authoritative export. One single-column template minimizes test burden. Font embedding and RO diacritics require extraction fixtures. PDF pass/warn/fail never changes semantic number. Production PDF extraction is designed, not executed in this discovery; browser artifact is a review surface. [PDF design](../ats/pdf-tests.md).

**AR5 staged recommendation:** paste/manual first implementation proposal; URL fetching behind egress/SSRF limits and clear paste fallback. Chrome extension discovery remains covered: activeTab+scripting+identity and API-host permission only; preview/edit text before upload; no browsing history/cookies/background scraping; PKCE scoped auth; duplicate job hash and canonicalURL per tenant. Defer launch pending explicit scope approval, store review and supported-site policy. No claim to bypass login/captcha/robots. [Extension](extension-billing.md).

**AR6 accepted:** shared async enum queued/running/needs_input/succeeded/failed_retryable/failed_final/cancel_requested/cancelled/expired; phases scanned/extracted/normalized/review_ready/rendered/validated. `GET /v1/operations/:id` supplies retryAfterMs, safe errorCode, progress and input/output version refs. Cancellation cooperative with post-call persistence fence; already incurred provider cost remains metered. Entitlement read `{revision,status,periodStart,periodEnd,features,remaining,reserved,resetAt}` is informational; POST commands reserve/enforce on server. Payment pending never becomes paid by redirect query. Proposed term1/3/6months, monthly feature allowance windows; commercial prices and final limits remain unapproved.

## Strategy response

**SR1 accepted — inputs:** PDF text/DOCX/manual are feasible minimum. Detect encrypted/image-only/low-confidence extraction and request review/manual paste; OCR is a candidate post-MVP local process, not an undisclosed paid fallback.10MB/20pages and extraction time/memory budgets are proposed operational limits, not competitor requirements.

**SR2 accepted — provenance:** extracted_unconfirmed/user_confirmed/externally_verified/suggested/rejected stored separately; source hash+locator/extractor version; interview answers require explicit confirmation. Generated prose has supporting claim IDs, approval and model/prompt version. Immutable snapshots store source lineage and undo via new versions.

**SR3 accepted — aliases:** versioned curated RO/EN concept table with contextual exclusions; ESCO can seed candidate concepts after license/version/term review. No runtime taxonomy API dependency required. SQL exact and approved equivalent can match; Java≠JavaScript, stakeholder collaboration≠people-management seniority, adjacent credentials≠equivalent licenses. Unknown semantic relation is awaiting review, not automatically earned score.

**SR4 accepted — readability evidence:** E-ATS-01 supports separate parser and semantic concerns; proposed one-column PDF and independent extractors align. Greenhouse2.5MB is vendor-specific, not a universal platform export limit. Strategy E-COMP-01 is advertised method evidence only; our weights are not validated by it.

**SR5 accepted — cost/simplification:** selective rewrite scenario1200input/180output versus6000/1800 full tailor reduces per-call modeled tokens and cost. At list-price Luna with EU uplift, before retries/cache: USD0.000231 vs0.00165 (~86% reduction), with unmeasured quality/latency. No automatic full rewrite on autosave; deterministic analysis is inexpensive and cached. Model explicitly includes broader activity/20% app-cache/5% extra attempts and10% premium escalation, not paid inference evidence.

**SR6 product decisions preserved:** paste-first, OCR deferral, one-template launch, extension timing, score acceptance, export gates and commercial limits are shared approval questions. They are recommendations to consolidate in Firstmate's decision register, not removed baseline promises. Architecture recommends monthly allowance renewal for all term lengths to avoid front-loaded6month use; no prices or billing behavior implemented.

## New constraints and questions for consolidated review

CR-01: UX should label user-confirmed separately from independently verified; ordinary self-report is not external verification. Keep provenance details progressively disclosed.
CR-02:80–100 compatibility does not override a missing license/degree/mandatory language. Keep critical gap visible beside the score and in before/after.
CR-03: Full PDF export must pin content, language, template/font/renderer version and privacy projection; editing while rendering produces a newer draft, not silently a different export.
CR-04: Monthly allowances for3/6month terms reduce worst-case cost; candidate limits10uploads/100AIunits/100newanalyses/30PDFexports per entitlement month remain proposals. Previews/manual editing/history should not incur AI units.
CR-05: Strict EU-only private processing can exclude edge/remote renderer configurations even when storage is EU. Provider/model/account regional eligibility and legal review must precede final provisioning recommendation.
CR-06: Browser startup diagnosis remains centrally owned by Firstmate per inbox001. Need the working session/target or explicit blocker disposition before claiming Lavish browser verification. No repeat startup attempts from this lane.

## Evidence and status

Schema validator:3 synthetic valid fixtures,15 invalid cases rejected; score demonstrator8cases with arithmetic/union checks; Decimal cost calculator baseline100/1000/10000 plus18sensitivities. Written contracts and methodology links are being completed in the same v1 package. Report completion, review approval and production readiness are not claimed. Firstmate should relay AR1–AR6/SR1–SR6 and return any objections or corrections through this inbox.

## Second relayed round — inbox002

Authorized UX cross-review.md read. UX-O01 **accepted**: persistent mandatory-gap banner required on score, before/after and export preview; no eligibility implied by high score. UX-O02 **accepted**: confirmed qualitative outcomes earn the same achievement evidence credit as supported metrics; metric count/size never adds points. User can decline confidential figures. UX-O03 **accepted and corrected**: readability enum includes untested/pass/warn/fail; synthetic score output now explicitly untested. Browser preview is not PDF extraction evidence. UX-O04 **accepted**: UI locale and document locale separate, no automatic translation of factual fields; translation is a reviewable generated proposal with the same claim references. UX-O05 **accepted**: discovery contracts preserve URL/text/manual/extension and multiple-template possibilities; paste/one-template is a proposed phase boundary only. UX-O06 **accepted**: mock entitlements remain local simulations with no real invoice/payment; production state derives only from server-confirmed provider events/reconciliation.

Browser blocker cleared centrally by Firstmate inbox002; use only task-owned session cvmaker-v2-architecture-verified with supplied pinned executable/MCP paths. No shared browser/session changes. Detailed contracts, PDF test design and review will carry these six constraints.
