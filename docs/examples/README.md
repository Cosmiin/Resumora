# Shared synthetic examples and acceptance checklist

All people, employers, answers and job inputs here are **synthetic**. This index reuses `mara-journey-1.0`; it adds no candidate history, scoring policy, schema, application feature or DB contract. IDs below are scoped to their source fixture: Ana schema coverage and the older Make/Integromat scoring case are separate from Mara. Never join them by coincidentally equal claim IDs.

Authority: [current PRD, sections 15–16](../product/prd.md), [journeys A–F](../../research/ux/journeys.md), [journey contracts v3](../../research/architecture/journey-contracts-v3.md). UI locale and CV language are independent; Mara uses UI `ro`, CV `en`. The reverse pair is also a scenario input, not evidence of translation execution.

## Fixture manifest

Paths are authoritative; no copies of canonical CVs are introduced.

| Source | Kind and stable IDs | Shared use |
|---|---|---|
| [Mara Base 1](../../schemas/cv/v1/fixtures/journey-mara-base1.json) | Valid canonical CV 1.0.0; `mara_base_1`, `mara_base` | A: reviewed initial facts, no measured achievement, no optional sections |
| [Mara Base 2](../../schemas/cv/v1/fixtures/journey-mara-base2.json) | Valid canonical CV; `mara_base_2`, parent `mara_base_1` | B: confirmed contribution, HR/payroll outcome and finance context from `source_mara_answer` / `prov_mara_answer` |
| [Mara current job CV](../../schemas/cv/v1/fixtures/journey-mara-jobcv1.json) | Valid canonical CV; `mara_job_cv_1`, Base `mara_base_2`, job `mara_job_1` | D/E: older/current presentation; selected evidence differs from complete Base |
| [Mara proposed job CV](../../schemas/cv/v1/fixtures/journey-mara-jobcv2.json) | Valid canonical CV; `mara_job_cv_2`, previous `mara_job_cv_1`, same Base/job | D/E: `prose_mara_result` supports truthful selection; no Base mutation |
| [Minimal](../../schemas/cv/v1/fixtures/minimal.json) | Valid canonical CV, separate Ana case | A: name-only manual start; absent optional sections and titles allowed |
| [Full RO](../../schemas/cv/v1/fixtures/full-ro.json), [tailored EN](../../schemas/cv/v1/fixtures/tailored-en.json) | Valid canonical CVs, separate Ana case | A/B/E: all optional kinds, approximate confirmed metric, pending prose, unconfirmed certification, suggested/rejected claims, privacy, independent ordering |
| [Mara journey](../../research/architecture/mara-journey-v1.json) | Scenario + reviewed assessment inputs/results, **not a CV** | C/D/E: job `mara_job_1`, requirements `mara_requirements_1`, scripted answer, version pins and before/after evidence |
| [ATS inputs](../../research/ats/fixtures-v1.1.json), [worked results](../../research/ats/worked-examples-v1.1.json) | Assessment inputs/results, **not CVs**; separate Make/Integromat case | D: evidenced equivalent, transferable evidence, unknown/confirmed credential gap, missing profile; never substitute its scores or tools into Mara |
| [Job language inputs](job-language-inputs.json) | New synthetic scenario input, **not a CV or replacement job snapshot** | C: EN atoms reused from Mara requirements; RO editorial translations; required/preferred/unspecified and hard gate preserved |
| [Review scenarios](review-scenarios.json) | New synthetic in-memory transformations, **not persisted CV versions** | A/B: extracted field, unconfirmed metric and suggested answer, using original values/source lineage |
| [Mara workspace v1.1](../../schemas/cv/v1/fixtures/journey-mara-workspace-v1.1.json) | Separate workspace companion, **not a CV** | Application continuation only; no payment/account proof for journey F |

`review-scenarios.json` is a declarative recipe: deep-copy `source`, set the named claims' `status`, remove `confirmedAt` and `confirmationActor` when requested, and set the named prose approvals. Preserve all other values, IDs and source/provenance links. Validate the resulting draft with the existing canonical consumer. These are independent counterfactual review states; do not write them back under the saved snapshot IDs or interpret them as revocations in Mara's actual sequence. They are valid draft documents after transformation, not deliberately invalid examples. Existing invalid counterexamples live in the validators, not alongside valid fixtures.

The bilingual job descriptions are assembled from reviewed requirement atoms, including positioning and outcome expectations absent from the shorter `job.text`. They are editorial renditions of the structured fixture, not verbatim source adverts or a claim an extractor inferred those atoms from that short text. Their requirement IDs/classifications point back to each existing atom; no new expected score is assigned.

## Compact acceptance checklist

These are future application acceptance expectations unless a local data check is explicitly reported. Checking JSON does not establish implemented UI/export behavior.

| Check | Source evidence / expected result |
|---|---|
| A: extracted vs confirmed | `extracted-before-confirmation` retains `claim_resp_a` / `prov_manual` but downgrades its prose to pending. Review can show it; export/approved text cannot attest it. Confirmation is a separate user action, not extraction or selection. Saved Base 1 is already reviewed, not a raw extraction fixture. |
| B: answer and missing achievements | Base 1 → Base 2 adds `claim_api`, `claim_hr`, `claim_impact_mara`, `claim_finance_collaboration` via `source_mara_answer`; `enrich_mara_1/2` target `role_a`. `answer-awaiting-confirmation` covers pending suggestions. Missing achievements prompt a skippable question; qualitative finance exception review is sufficient. Never invent a time-saving percentage or fill a bullet quota. |
| B: measurable evidence | Ana `claim_metric` is approximate 20 percent, linked by `enrichment_demo` to `role_a` and `claim_achievement_a`; it is not Mara evidence. `metric-awaiting-confirmation` makes that same value unconfirmed. Pending `prose_bullet`, `claim_suggestion` (team of 50), `claim_certifications` and `claim_rejected` must not be promoted/exported as confirmed facts. |
| C: job review and language | Job-language atoms preserve `automation/sql/api` as required technical tools, `workflow` required responsibilities, `hr` preferred domain context, `years` required experience, `work_authorization` required qualification/hard gate; `impact/communication/positioning` remain unspecified priority. Skill/tool labels do not change professional/technical skill groups. Locale choice never establishes proficiency or credential recognition. |
| D: included | Mara current `automation/sql` have confirmed profile and selected-CV evidence. Show included with source claims; repetition adds no points. |
| D: available only in Base | Mara current assessment `api/hr/impact` → `verified_base_omitted` (PRD display `verified_omitted`). Offer selection from `mara_base_2`; do not ask the model to invent facts. Tailored assessment includes these via `prose_mara_result`. |
| D: evidenced synonym | Separate ATS `before` requirement `make`, relation `approved_equivalent`, explanation Make/Integromat → `verified_equivalent`. Dictionary `ro-en-1.1` is pinned. This is an existing tool alias, not proof of arbitrary RO/EN matching, interchangeable tools or legal qualification equivalence. |
| D: awaiting confirmation | Review scenarios show pending facts even when wording contains the keyword. The scorer's existing suggested-impact guard gives zero semantic credit to suggested evidence; a pending-only requirement displays `awaiting_confirmation`. No exact new scenario score is specified. |
| D: unsupported / required qualifications | Mara `work_authorization` has no supporting claim: engine `missing_unsupported` / PRD `unsupported`, independent eligibility `needs_verification`. This does not prove inability or lack of authorization. Separate ATS `confirmedGap` uses a sourced negative attestation, not silence. City, high score or translated diploma cannot satisfy the gate. |
| E: optional section with rationale | Ana `entry_projects` / `claim_projects` demonstrates a supported optional entry; tailored EN moves `section_projects` independently. Generic labels demonstrate schema shape only, not job relevance. Require real task relevance before selection. Mara has no optional entries; do **not** add Ana `entry_volunteering` or an empty projects section to Mara to improve a number. No supported/relevant Mara optional source exists. |
| A/E: dates | Mara `role_a` overlaps ongoing `role_b`; union intervals before totaling. `claim_start_c={year:2019}` and `claim_end_c={year:2020}` retain unknown months; no January default. Ongoing `role_b` retains null end. Freeze analysis at 2026-10-23; [duration helper/result](../../research/architecture/duration-worked-v1.json) names elapsed-date-bounds-1.0 and 68–92 completed months, including 51–52 for role_b. Analytical day bounds never become stored facts. |
| E: immutable branching and job edit | Job CV 2 references Base 2 and prior job CV 1, preserving claim content/source IDs. Before/after selection is job-only; Base 2 remains byte-for-byte unchanged. A changed job must become a separate job snapshot and invalidate its analysis; never overwrite `mara_job_1` or silently promote job prose to Base. Restore/promotion need explicit new versions. This edit invariant has no separate executable app test here. |
| E: remaining gaps and future PDF | Keep authorization warning through comparison/export preview; reject unsupported metrics/credentials. PDF/readability remains `untested`, exportId null. Future actual-file acceptance: selected confirmed facts + approved supported prose only, chosen contact privacy, text extraction/reading order/headings/date/contact checks on pinned renderer/template/font/language. No PDF was produced or tested here. |

## Scoring and provenance boundaries

Use [ATS-01 v1.1](../../research/ats/method-v1.1.md), `compatibility-1.1.0`, weight profile `baseline-1.1`, dictionary `ro-en-1.1`, normalizer `reviewed_mara_1`, matcher `synthetic_reviewed_mara_1`, as-of `2026-10-23`. The executable [structured evaluator](../../research/ats/score_v1_1.py) can replay Mara's `inputCurrent` and `inputTailored`; no natural-language extraction/matching engine is implemented.

Mara's published platform estimates are Candidate–Job Fit **90 → 90**, selected CV–Job Match **62.5 → 90**. The [comparison](../../research/architecture/mara-journey-v1.json) attributes +27.5 to API, HR, impact and communication context selection; `profileChanged=false`. The unchanged profile does not gain relevance from wording. These uncalibrated synthetic estimates are never employer ATS scores, interview predictions or PDF test results. Keep candidate relevance, CV coverage, required qualification status and readability separate. New language/review scenarios are **invariant-only**, with no invented exact expected scores.

Known semantic limits: Mara assessment `documentItemIds` include abstract `item_*` handles that are not canonical section/prose IDs; `prose_mara_result` is a real canonical ID. They represent reviewed assessment bindings, not a validated renderer selection map. Do not claim cross-document referential integrity for those abstract handles. Canonical validation checks internal claims/provenance/sections; assessment validation checks requirement bindings. Full RO selects an unconfirmed certification section in a reviewable draft, while tailored EN hides it: schema validity alone is not export eligibility. PRD qualitative review supersedes the older journey contract's proposed numeric readiness rubric; no new readiness score is introduced.

## Focused verification

Run the existing consumers from the repository root (installed Python/jsonschema; no new dependencies):

```sh
python3 schemas/cv/v1/validate.py
python3 schemas/cv/v1/validate_assessment.py
```

For focused replay, import `validate` / `export_projection` from the canonical validator; materialize the review recipes in memory and validate them. Validate Mara `inputCurrent/inputTailored` with `assessment-input-1.1.schema.json`, then use `score_v1_1.evaluate` and `compare` against the saved analysis/comparison. Use `duration_bounds_v1.duration` on canonical roles for the pinned date result. Importing these functions avoids regenerating unrelated fixtures. Existing scorer/duration script main routines write research files, so avoid running those just to inspect results.

Delivery checks and results are recorded in the PR. Scope excludes app suites, provider calls, browser tasks, DB queries, hosted changes and real personal data. Existing Mara contact `mara@example.test` is reserved synthetic fixture data and retained for lineage; new inputs add no contact/account details. No real CV screenshots, credentials or external identities are needed.
