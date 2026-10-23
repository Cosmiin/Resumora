# AI CV Maker V2 — integrated product requirements draft v1.0

Date:2026-10-23. **Discovery review draft; implementation, release scope, weights, prices and commercial/privacy policy are unapproved.** Consolidated review decisions: D-01–14 remain open in the linked strategy register; these do not block review of the discovery proposal. Opening a review is not approval. No production app/backend/infrastructure/payments or model calls have been built or tested.

## 1. Product problem and desired behavior

Romanian job seekers need a trustworthy career record and a clear way to select relevant experience for each role. A generic rewrite can hide gaps, lose source facts or add unsupported claims. The proposed product keeps a persistent versioned Base CV, asks for missing context, structures a job’s requirements, explains confirmed matches and gaps, and creates an independently editable job CV only after the user approves proposed changes.

Primary interface Romanian; English secondary. Desired document language is independent of interface language. Facts remain factual through localization: translated diplomas do not establish professional authorization, positioning titles never alter employment history, and new prose never becomes evidence by itself. No hiring probability, employer ATS score, application success promise or invented accomplishment.

Working product name in the prototype is synthetic “atelier cv”; it is not an approved brand. Reference screenshots inform functions and UX only; no proprietary source, protected identity or brand assets are reused. No previous CVTailor content was accessed.

## 2. Authority, sources and confidence

The approved `product-brief.md` governs discovery coverage; kickoff notes awaiting dispatch are superseded by approved setup. This PRD integrates the following dated snapshots. UX inspected the references and ran its own prototype checks; other lanes’ technical/research checks are attributed reports, not independently rerun validation.

| Source | Durable snapshot / owner | What it supports / limits |
|---|---|---|
| 44 screenshot references | [Inventory](../../research/ux/inventory.json), [evidence map](../../research/ux/evidence-map.md), UX | Dimensions/hash/mtime and visible components. Static captures do not prove behavior, accuracy, persistence or responsive rules. Six long marketing pages treated as illustrations, not app execution. |
| Approved baseline | Firstmate-provided product brief and kickoff scope (reviewed at task start) | Full required discovery scope and six journeys. No commercial/release selection. |
| Architecture handoff v1 | [Relayed snapshot](../../research/ux/sources/architecture-handoff-2026-10-23.md) | Stable fact IDs, immutable snapshots, partial dates, proposed weights, simple stack alternatives and cost assumptions. Uncalibrated/unmeasured. |
| Architecture phase2 | [Cross-review snapshot](../../research/ux/sources/architecture-cross-review-2026-10-23.md) | AR1–AR6/SR1–SR6: interval bounds, revision/409, pinned exports, async states, server entitlements, staged URL/extension. Final technical package remains architecture-owned. |
| Architecture owner feedback round 1 | [UX impact summary](../../research/ux/architecture-impact-round1.md) | Six complete owner annotations. Preferences and proposed ATS semantics/weights are relayed, not a verified method or production approval. Current v3 schema/method/fixture pointers are integrated below; the score remains illustrative and uncalibrated. |
| Strategy handoff v1 | [Relayed snapshot](../../research/ux/sources/strategy-handoff-2026-10-23.md) | Initial primary-source evidence, bounded competitor shortlist, paste-first/one-PDF MVP proposal. Not a market census or validated demand. |
| Strategy CR-01–20 | [Final cross-review snapshot](../../research/ux/sources/strategy-cross-review-2026-10-23.md) | Calibration, required-gap warning, alias/qualification limits, input/PDF scope, cohort cost sensitivity and D-01–14 register. The current strategy publication candidate, backlog, decision cards and sources are linked from the repository index. |
| UX cross-review | [Dispositions](../../reviews/ux/cross-review.md) | Q-01/02/05, UX-O01–06, final UX-F01–03 and disposition of relayed concerns. |

Evidence confidence labels: **observed** = visible reference/UI or executed local check; **source-reported** = dated research/technical snapshot; **proposed** = design or implementation recommendation; **unresolved** = owner choice or missing validation. Do not promote a hypothesis to a requirement by copying it into a plan.

Strategy source-reported evidence, accessed2026-10-23: Greenhouse lists resume parsing failures and manual-entry recovery, including columns/tables/image-based content as risks ([parser documentation](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse)); this supports separate extraction review, not a universal ATS pass guarantee. Jobscan advertises skills/title/degree/keyword priorities but does not disclose a validated employer-equivalent formula ([tutorial](https://www.jobscan.co/jobscan-tutorial)). Europass separates a persistent profile from multiple selected CVs and supports document languages ([Europass CV](https://europass.europa.eu/en/create-europass-cv)). ESCO offers classification APIs, a possible source of curated bilingual concepts after licence/version review ([ESCO API](https://esco.ec.europa.eu/en/use-esco/use-esco-services-api)). Country/profession-specific recognition must not be inferred from translated labels ([Your Europe](https://europa.eu/youreurope/citizens/work/professional-qualifications/regulated-professions/index_en.htm), relayed CR-07). UX has not independently reverified these pages; complete source ownership stays with strategy.

## 3. Users, outcomes and validation hypotheses

Provisional segment: Romanian-speaking people applying locally and/or in English. Their willingness to pay, frequency of job search, document formats and need for extensions remain untested. No target conversion, retention, interview uplift or market share is asserted.

Desired outcomes to validate with future consented user studies: create a usable Base without fabricated facts; recognize unconfirmed extraction; explain a missing required credential despite a high score; approve job changes without overwriting Base; recover from failed import; export a readable document. Measure task completion/time, correction burden, misunderstanding of score and confirmation, accidental Base mutation and accessibility barriers. Do not optimize for a higher score alone.

Proposed first-use experience: account→upload/manual→structured review→Base; short optional enrichment after first save. The alternative mandatory interview remains a review option. Two positioning titles are grouped and the second is optional/unknown; no invented title or blocked first save. Skill categories have examples and can be reviewed after initial extraction rather than creating an unnecessary gate.

## 4. Scope: discovery coverage and proposed first release

Discovery/prototype covers every baseline journey, URL/text/manual/extension import, distinct templates, PDF concept, error/empty/validation/retry and 1/3/6-month subscription lifecycle. Staging a feature for later implementation does not remove discovery coverage.

**Recommended smallest useful release, pending review of D-01–14:** persistent versioned Base; PDF text/DOCX/manual import with confirmation; targeted enrichment; pasted/manual job text; required/preferred requirements; deterministic explainable matching with curated RO/EN aliases; truthful approved job variant; structured editor/history; one tested single-column PDF; RO/EN UI and independent CV language; privacy/account/server entitlements if commercial launch is approved.

**Reviewable later scope:** URL fetch behind security limits, minimal extension, OCR, more templates, wider language coverage, DOCX export, broad semantic embeddings. Reference-only application tracking, automated job applications, job discovery, cover letters and predicted interview timelines are outside this proposed core. Their marketing presence is not evidence they are needed in the MVP. Implementation agents may begin only after explicit requirements/UX/architecture/MVP/budget approval.

## 5. Canonical career record

Separate source facts, generated text and presentation. Stable IDs identify claims, roles, sections and prose. Each fact carries source type/hash/locator/extractor version, confirmation state and scope; generated prose carries supporting claim IDs, generator/prompt versions and approval. Proposed statuses: extracted_unconfirmed, user_confirmed, externally_verified, suggested, rejected. “Confirmat de tine” is not independent verification.

Required supported entities and fields:

- Professional name; two independent positioning-title slots. Historical role titles stay separate and factual. Unknown second title remains blank without inference.
- Email/phone/city-country; optional full address and professional links. Address omission never reduces compatibility. Contact visibility is explicit at export.
- Concise natural summary from supported experience and relevant accomplishments/skills. Relevant-year calculations union overlapping intervals, keep uncertainty and a fixed as-of date, and never add concurrent periods twice.
- Professional skills and technical skills independently selected/ordered, each linked to evidence. A tool name is not inferred from a neighboring skill.
- Experience: role/employer/location, structured partial month/year start/end or ongoing, short scope/context, normally3–4 concise action+scope/technology+supported result bullets. Older/less relevant work may be shorter. Qualitative results count; missing numbers prompt a question rather than invention. Select/reorder roles and bullets.
- Education: institution/qualification/field/location/partial dates plus useful distinctions/coursework. Certifications include actual credential/status/evidence. Projects, portfolio, languages with level basis, leadership/publications/volunteering/achievements and custom evidenced sections are optional modules.
- Section-instance identity and independent document order/display label/visibility. Add/remove/rename/reorder without conflating presentation and source data.

Dates retain known precision: `{year:2021}` renders2021; exact month renders localized Month YYYY. Unknown month never becomes January. Ongoing is explicit, not an invented end date. Validate only what precision supports, using interval bounds for uncertain ordering. No penalties for career gaps or uncertain dates. Architecture owns exact schema/union calculations; prototype only checks year/month values/order.

## 6. Versioning, approval and recovery

Base immutable checkpoints occur at explicit save, confirmed enrichment and restore. Draft undo uses local inverse changes; restore creates a new version. Each job snapshot owns independent tailored versions referencing Base and job snapshot IDs. A template changes presentation. Job save, translation or recommendation never silently mutates Base.

Per-change approval is proposed for summaries, individual bullets and added sections. Rejecting suggestions preserves original content. New facts can be offered back to Base with selected claim IDs, destination confirmation and expected Base head. Production optimistic revision/ETag mismatch returns409 preserving local edits and changed IDs for review. No automatic full regeneration on autosave; selective rewrite is the default proposal.

Persist questions/answers/confirmation/source/version. Unknown/skip is allowed and earns no evidence. Cancel/retry must retain previous saved state. Architecture operation states: queued/running/needs_input/succeeded/failed_retryable/failed_final/cancel_requested/cancelled/expired, with safe error codes/version refs/retry hint. A cancelled operation cannot publish a late result into a newer version; already incurred cost remains metered. Prototype only simulates running, retryable failure, cancellation and local success.

## 7. Jobs, matching and keywords

Four discovery input modes converge on editable structured job review. Pasted text/manual is the recommended initial implementation. URL failures must offer paste, never promise access to login/captcha-restricted content. Extension concept: explicit active-page capture, preview/edit/consent and account-scoped submission, minimal permissions; no history/cookies/background scraping. Duplicate normalization/hash, SSRF/egress rules, supported-site policy and PKCE live in architecture’s contract. No extension is installed in the prototype.

Job requirements retain source sentence/location, required/preferred/unspecified basis, category, importance and AND/OR groups/negation. User can correct inferred priority. Ambiguity is visible, not silently converted to required. Job edits create a new version and invalidate stale analysis. Requirement-to-dimension dedup and sensitivity to boilerplate/repetition need calibration.

Five exclusive primary keyword statuses (proposed display mapping for D-11):

| Precondition | Primary status | Additional badges / behavior |
|---|---|---|
| Confirmed fact, exact selected CV term | included | Exact/RO↔EN equivalence and confirmation basis may be badges. |
| Confirmed fact, only approved equivalent selected | verified_equivalent | Explain contextual RO/EN phrase and alias version. |
| Confirmed fact, neither exact nor equivalent selected | verified_omitted | Offer relevant content selection; no fabricated claim. |
| Plausible evidence still unconfirmed | awaiting_confirmation | Ask for confirmation even when a proposed sentence already contains the word. |
| No supported or plausible evidence | unsupported | Explain gap; never insert it to optimize score. |

Confirmation/source validation comes before term matching. Exact+equivalent selected uses included plus equivalence badge. Qualification recognition cannot be established by alias matching. Java≠JavaScript; stakeholder collaboration≠people-management seniority; diploma translation≠country-specific licence. Candidate aliases from ESCO require curation; no claim of perfect multilingual matching.

Categories include professional/technical skills, tools, domain knowledge, responsibilities, qualifications, industry terminology and seniority. Rank by source-backed required/preferred indications; expose rationale. “Important” is an estimate, not an employer’s hidden ranking.

## 8. Job fit, CV match, eligibility and recommendations

Architecture owner feedback round 1 asks for two distinct semantic measures. **Candidate–Job Fit** covers the complete confirmed professional profile. **CV–Job Match** covers only the facts selected into the evaluated CV. Never show Candidate–Job Fit as computed when the full confirmed profile is unavailable. Do not increase Candidate–Job Fit when the same facts are merely reorganized or rewritten. CV–Job Match changes only when supported facts are added/selected or a factual mismatch is resolved; keyword repetition, layout and cosmetic wording do not earn semantic points. Each score needs its own inputs/version references and explanation. The current method and fixture snapshot are architecture-owned and linked in section 16; numeric output remains uncalibrated.

The owner feedback proposes eligibility as an independent three-state assessment over genuinely non-compensatory hard gates: **Requirements satisfied**, **Needs verification**, **Confirmed requirement gap**. “Required” language in a job description is not by itself a hard gate. Preserve the source and basis of every hard-gate decision. Keep an unmet/unverified strict-gate warning beside all relevant score cards and repeat it in comparison and export preview. High aggregate values never imply eligibility. A translation or semantic alias never establishes a regulated credential. Do not block export based on the mockup’s legal or occupational judgement.

**ATS Readability** is its own operational assessment, separate from both semantic measures. It checks extracted text, reading order, headings, work/date readability, contact extraction and layout interference on the actual rendered file. Without a real PDF extraction test, show **Not tested**. Formatting must not change Candidate–Job Fit or CV–Job Match.

The relayed architecture feedback spec proposes category weights of technical skills/tools/methodologies 30, responsibilities/domain 25, relevant experience 15, accomplishments 10, qualifications 10, professional/transferable skills 5 and title/positioning 5. It proposes required/unspecified/preferred multipliers 3/2/1 and evidence strengths 1/.75/.4/0. These are versioned, configurable architecture inputs, not validated UX policy. The aligned UX prototype uses the current architecture fixture `mara-journey-1.0` with `compatibility-1.1.0` / `baseline-1.1`; it displays Candidate–Job Fit 90 and CV–Job Match 62.5→90. These are illustrative replays of versioned structured inputs, not predictions or live analysis.

Requirements have stable IDs, a primary category, job-source evidence, required/preferred/unspecified basis, hard-gate eligibility flag, evidence references and one match-strength classification to avoid accidental double-counting. An architecture proposal models category coverage from requirement priority × evidence strength and excludes/renormalizes a category only when the job truly has no applicable criteria. Effective weights and calculation inputs must be visible and version-pinned. The current versioned equations, aggregation behavior, alias version and synthetic fixtures are in the linked architecture snapshot; natural-language matching quality and calibration are not proven.

Recommendations explain requirement relevance, current match status, exact supporting evidence, whether content exists in Base but not this CV, what is insufficiently demonstrated, or what is absent, plus a truthful next action. They identify whether an edit uses confirmed facts or needs confirmation. Never add empty/irrelevant sections for points, invent credentials or suggest that unsupported experience should be claimed. Before/after comparisons use the same job requirements, method and hard-gate decisions; isolate fact selection from wording effects.

The aligned Mara/Northstar example has a non-compensatory right-to-work-in-Romania requirement whose evidence is unconfirmed. Show **Needs verification** beside the 90 Candidate–Job Fit and CV–Job Match values, keep the warning through comparison/export preview, and permit an explicit user attestation to change the state. This is not a legal determination, employer ATS result or hiring estimate. See section 16 and architecture v3 inputs.

Calibration and deterministic acceptance remain architecture/strategy-owned: repeated evaluation with unchanged inputs and method must be stable; evidence values and category contributions explain the total; duplicates/boilerplate do not add points; transferable skills do not satisfy strict credentials unless the job explicitly accepts equivalence; profile fit is invariant to presentation edits; CV match reflects supported selection changes; missing dimensions and renormalized effective weights are visible. Test language, role family, seniority, partial dates, overlap, OR/negation and qualification conflation. No predictive validity claim before suitable evidence.

## 9. Editor, templates and export

Structured content stays separate from rendering. Desktop side-by-side draft/preview; mobile stacked accessible fields and explicit refresh in demo. Fixed section kinds with reorder/rename plus custom evidenced sections are the preferred initial simplification. Two independent titles and two skill groups remain visible. Single-bullet/summary proposal review, optional sections, bullet/role order, undo/history and source details are core.

Distinct Clar/Contur one-column templates in discovery show typography/layout differences without changing facts. Recommended MVP tests one layout thoroughly before expanding. No photo/full address requirement. Contact projection is explicit. Translation is a proposed approved text version; changing UI language never changes document text. Prototype translates only known synthetic fixture text; custom text remains for manual review.

Production PDF request pins snapshot/content hash/template+font+renderer versions/locale/visible contact IDs. Validate snapshot, reserve entitlement, render, independently extract text and check reading order/contacts/skills/headings/RO diacritics before publishing an export ID. Editing while rendering creates a newer draft, never silently substitutes content. Standard headings, machine-readable text and logical reading order; tables/columns/decorations are risks to test, not universal incompatibility claims.

Prototype has HTML preview, simulated PDF preparation and actual synthetic JSON portability only. No PDF was generated or extracted. Real PDF regression fixtures, pagination/multipage/font extraction/accessibility checks are release gates owned by architecture.

## 10. Account, subscriptions, entitlements and privacy

Discovery covers1/3/6-month terms, recurring renewal concept, pending/declined/active, cancel-at-period-end and resume. Prices are `— RON` placeholders; commercial amounts/discounts/refunds/VAT/limit/grace policy are unapproved. No cards/real payments/invoices. Proposed monthly allowance windows for every term avoid front-loaded6-month usage, but final limits remain D-05/07 decisions.

Production Checkout success redirects never authorize access. Signed/idempotent webhook handling and server-side entitlement reservation/enforcement are required. Entitlement read is informational with revision/status/period/features/remaining/reserved/resetAt. Editing/history/preview should not consume AI units; export/analysis/AI gates are commercial choices. Prototype illustrates one export activation path, not an approved monetization gate.

EU/privacy-oriented product proposal: private per-user storage/RLS/access controls, minimized logs, encryption, explicit external processing consent, retention for raw files/versions/answers, portability/deletion and recovery/backups, regional/subprocessor tradeoff review. Strict EU-only processing is stronger than EU storage; edge/remote inference/rendering eligibility must be verified. Legal/tax/privacy specialists must review release policy. No legal determinations or actual GDPR actions are performed by this prototype.

## 11. Technical/cost integration snapshot

Owner feedback round 1 prefers Supabase + Cloudflare Worker API + Browser Run, initially using free tiers where feasible, but does not approve production infrastructure. The architecture v3 proposal records that preference alongside compared alternatives; validate service limits, availability, operational burden, worker memory, PDF runtime, data residency, remote processing and migration risk. Do not treat free tiers or inference as zero-cost. Prefer a modular domain service plus Postgres jobs before Redis/vector databases/microservices. Architecture owns schemas/APIs/security/renderer/queues, provider pricing and runnable models; the current portable v3 architecture, canonical schema, ATS and cost snapshots are linked from the repository index and are not rewritten by UX.

Model assumptions from relayed snapshots: active-user scenario per30days includes .25 uploads,4 interview turns,8 parses,4 full tailors,8 selective rewrites,20 analyses,6 exports;20% app-cache and5% extra attempts/renders,10sec/render,10MB live blobs and1MB DB/user. These are modeled steady state, not onboarding/observed usage. Add onboarding, intensive search/free-user cohorts,0%-cache, render bursts/long PDFs, correlated failures and retention sensitivities. Active users≠paid subscribers. Selective rewrite token reduction is modeled, not measured quality/latency. No selling price follows from modeled cost.

Owner feedback prefers OpenAI initially with a later provider-flexible boundary (for example, OpenRouter); this is a preference, not authorization for paid experiments. Published infrastructure/provider prices in architecture’s handoff are dated source-reported inputs only; this PRD does not reprice them or select a vendor/budget. Versioned schema/method/cost snapshots and their owner-reported validation receipts are included in this discovery package; their technical artifacts remain architecture-owned.

## 12. Journey acceptance and current evidence

Detailed scripts: [A–F](../../research/ux/journeys.md); full fields/states: [screen specifications](../../research/ux/screen-specifications.md). Prototype sources: [HTML](../../prototype/index.html), [logic](../../prototype/app.js), [styles](../../prototype/styles.css), [portable review](../../prototype/review.html).

- A account/upload/manual/extraction/review/save operable; confirmation required; invalid email/month rejected; partial month absent.
- B contribution answer→claim review→confirmation→destination→new version; unknown adds no claim.
- C four import concepts→reviewed required/preferred job; URL/extension recovery explicit simulations.
- D five evidence statuses, bilingual synonym, mandatory-gap warning, useful supported recommendation and explicit recalc; semantic/PDF separation.
- E per-change comparison→job editor→templates→preview; Base remains byte-for-byte unchanged by job-only saves; undo/restore and separate promotion.
- F1/3/6-month choice→placeholder checkout→active/pending/declined→cancel-at-end/resume. No real payment.

Iteration-1 evidence:56 deterministic DOM/state checks across A–F;27 Chrome interactions. Iteration-2 verification is captured separately in the updated task report and v2 snapshot; v1 receipts are historical. No horizontal overflow or console messages remained in the final browser session. Screenshots and logs in `reviews/ux/`. Browser library issue was centrally resolved by Firstmate; only task-owned verified session used. DOM checks do not establish actual backend/PDF behavior. Final browser receipts and known limits are recorded separately; local review opening is not owner approval.

Responsive/accessibility proposal: desktop split view, tablet stacked content, mobile scoped horizontal navigation and stacked forms,44px controls, visible focus/native labels/dialogs/live statuses/reduced motion, text alongside status color. Screen-reader, touch-device, Safari/Firefox, full WCAG audit and production rendering remain unverified.

## 13. Release gates and unresolved decisions

The strategy publication candidate contains the current D-01–14 decision register and seven-question review blueprint. These product choices remain open; this discovery proposal can be reviewed without closing them. Local prototype controls and terminal visual feedback are not approvals.

| Topic | Reviewable options / recommendation | Gate |
|---|---|---|
| First-release input/extension/OCR | Paste/manual+text PDF/DOCX first; URL/extension/OCR later vs immediate breadth | D-01/02/04, exact scope in strategy register |
| Score display/calibration | Uncalibrated0–100 with explicit required warning and separate format vs withhold numeric release until calibration; no employer equivalence | D-03 |
| PDF/template scope | One tested PDF initially vs multiple templates/export formats | D-04 |
| Terms/limits/entitlement/grace/refunds | Proposed1/3/6 terms and monthly allowances; amounts/limits/gates unknown | D-05/07 and commercial policy |
| Stack, budget, EU processing/retention | Architecture alternatives; budget ceiling and strictness need owner direction | Consolidated technical/privacy decisions |
| First-use/enrichment | Quick Base then optional targeted interview (recommended) vs mandatory guided interview | D-09 / final register mapping |
| Two titles | Optional second/unknown without invention (recommended) vs require confirmed two-title positioning later | D-10 |
| Keyword precedence / completeness | Exclusive primary status with separate evidence/equivalence badges; completeness diagnostic separate from score | D-11 and score acceptance |
| Validation and implementation promotion | Review UX/requirements/architecture/MVP/budget; then production agent plan | D-12 / consolidated gate |

The linked strategy D-01–14 register is authoritative for the unresolved product choices; this topic table is a navigation aid, not a replacement. No unresolved choice is silently selected. The iteration-2 Guided journey supersedes this earlier five-question list; see the five current choices below. The demo fixture is aligned in section 16; fixture alignment is a synthetic-coherence choice, not product policy. The first option marked recommended is a discussion aid only. Selections stay local, can be copied into feedback, and never record approval. Reconcile each option with D-01–14 in the linked strategy register.

## 14. Known gaps before implementation

The current architecture v3 schemas, methods, cost model and strategy publication candidate are integrated as linked, versioned snapshots. Strategy retains ownership of its decision register and prioritized backlog. Real extraction/OCR/URL/extension/translation/model quality, production auth/privacy/payment/security/concurrency, PDF extraction/pagination and calibration are not proven by a static prototype. Education/optional modules are editable text in the mockup while production requires structured entities. Full visible per-job history, conflict-resolution UI, account email/reset and exhaustive async states remain specified follow-up designs.

No implementation authorization is inferred from this draft or local checks. D-01–14 remain explicit review decisions. Any eventual production task requires separate approval and technical validation.

## 15. Iteration 2 integrated product direction

This section supersedes conflicting first-release flow, application tracking, readiness and score examples above. It integrates Firstmate-relayed strategy/architecture snapshots and the UX Lavish round-1 annotations. It remains a proposal; neither review nor prototype interaction records owner approval.

### Product outcome and entry

The product’s immediate outcome is a credible, reviewed job-specific CV attached to a user-controlled application record. The Home workspace leads with “Prepare your next application,” with a primary **Start here · prepare for a job** action and a visible **Create my Base CV** alternative. This job-specific emphasis follows strategy’s response to owner feedback; the two paths converge on one Base → job CV → application loop. Returning users see an active application with status, attached CV version, contact and next action/date. The application workspace always surfaces the latest generated CV with an explicit tailored/not-tailored state, offers search across saved applications, and counts explicit submission attestations independently of later Interview/Closed stages. Tracking is lean and manual; reminders, reporting and outbound contact are not included in this proposal.

### First-use and return loops

1. Create a Base from upload or manual entry; show extracted facts, field provenance/unknowns and structured confirmation.
2. Immediately review Base structure and content. Present five qualitative checks—Content, Structure/format, Job optimization, Writing quality, and Application readiness—with concrete next actions. Do not combine them into a readiness score.
3. Ask only section-specific questions after the user has seen the review. Skip/unknown remains safe; every answer is a proposed, source-linked claim. Apply rewrite proposals through before/after, user confirmation, explicit append/replace or destination choice, and undo.
4. Import a job by paste/manual first, with URL and extension concepts showing consent, preview and fallback. Review requirements as required/preferred and separately attest strict eligibility gates.
5. Keep Candidate–Job Fit (confirmed profile), CV–Job Match (selected CV), eligibility (satisfied / needs verification / confirmed gap) and PDF readability as four separate states. Link each to evidence/version/method. Do not claim hiring probability.
6. Compare the current and proposed CV, edit a job-specific version without mutating Base, preview a distinct template and record the application next step. Before any future payment ask, show a useful Base diagnostic and one job-specific comparison. This gate recommendation remains open for the owner.

### Canonical Base structure and evidence rules

Canonical fields: full professional name; two positioning titles (second optional and blank when unknown); contact/social links; optional full address; summary grounded in experience duration, accomplishments and best skills; professional and technical skill groups; each role’s historical title, company, city, month/year dates, short context and 3–4 selected confirmed accomplishment bullets. Include education, certifications, languages, projects and custom sections only when useful and supported. Keep ordering editable, provide Undo/history, and separate Base promotion from job-only edits.

Offer manual skill entry plus deterministic AI concept suggestions derived only from confirmed experience. Preview explicit append or replace behavior and preserve undo. Achievement helpers first capture personal contribution and outcome/validation; users may state that no metric was measured. Only then offer a wording proposal. Never create an achievement, number, date, tool, title or qualification that the user did not support.

Partial month/year dates use month and year selectors with an explicit unknown option. Display per-role and cumulative duration as a range when month precision is absent, include an “as of” date, and union overlapping employment periods so concurrent roles are not counted twice. Unknown dates remain unknown. The v2 prototype uses a synthetic as-of date of 2026-10.

### Assessment fixture and language

Use the shared architecture v3 Mara case `mara-journey-1.0`: `mara_job_1`, `mara_base_2`, current `mara_job_cv_1`, tailored `mara_job_cv_2`, `mara_requirements_1`, rules `compatibility-1.1.0`, profile `baseline-1.1`, dictionary `ro-en-1.1`, normalizer `reviewed_mara_1`, matcher `synthetic_reviewed_mara_1`, as-of 2026-10-23. Candidate–Job Fit is 90 for both documents; CV–Job Match moves from 62.5 to 90 when the tailored document represents existing confirmed API/HR/outcome/context evidence. Missing work authorization in Romania needs verification; PDF readability is untested. Method weights and sample score are uncalibrated. This is a replay of structured synthetic evidence—not a connected AI scorer, employer ATS, hiring likelihood or legal determination. Do not carry prior fixture values into this case.

### First guided review questions (proposal only)

The job-specific entry focus with a visible Base alternative is recorded direction and is not reopened.

1. Application continuity: create a lean editable record when a job is added (strategy recommendation) / create only after choosing Track / full board and reminders.
2. Clarification timing: progressive, skippable section questions after immediate Base review (shared recommendation) / mandatory interview / on-demand only.
3. Capture scope: pasted/manual LinkedIn plus previewed, consented click capture with text fallback (strategy recommendation) / deeper profile connection / staged extension; no hidden scraping or credential requests.
4. Value before payment: useful Base advice plus one job-CV comparison (shared recommendation) / Base advice only / earlier analysis or export gate.
5. Quota fallback: bounded queue and manual editing during limits (architecture recommendation) / capped paid upgrade after an owner-approved ceiling / pause the affected feature.

Each option has visible consequences. Selections remain local and reversible and never constitute approval. The prototype and linked technical artifacts now share Mara / Northstar People — Business Systems Analyst — Automation and the versioned IDs above. This resolves example coherence only; D-01–14 product-policy choices remain open in the linked decision register.

### Acceptance / visual follow-up

Iteration 2 keeps major controls local and meaningful, exercises journeys A–F, includes loading/empty/error/retry/validation and consent states, and is browser-checked at desktop/mobile widths. The fifty selected desktop layout-warning IDs were matched in task-owned Lavish state and all recorded resolved at revision 26 after a complete 1560px pass. The board later ended terminally with “This is ok” and was retired; this is visual feedback, not product approval. No new Lavish session is required for this integrated draft.



## 16. Integrated discovery snapshot v3 — shared synthetic case and open decisions

Inbox 012 relayed the current architecture v3 case, the complete strategy publication candidate, and the decision-interview blueprint as explicit read/copy inputs. This section supersedes earlier stale fixture and integration statements in sections 8, 11, 13–15. The shared demo uses synthetic Mara Ionescu applying to Northstar People for **Business Systems Analyst — Automation**. The stable case is `mara-journey-1.0`; job `mara_job_1`; Base `mara_base_2`; current CV `mara_job_cv_1`; tailored CV `mara_job_cv_2`; requirements `mara_requirements_1`; rules `compatibility-1.1.0`; profile `baseline-1.1`. The canonical fixtures, schema, ATS demonstrator, cost model, and strategy contribution are linked from the repository [`README`](../../README.md).

The example keeps Candidate–Job Fit at 90 and changes CV–Job Match from 62.5 to 90 when the tailored CV represents already confirmed API, HR/payroll, outcome and context evidence. No time-saving metric is supplied or invented. The non-compensatory right-to-work requirement is `needs_verification`, not a claim that the candidate lacks authorization; actual PDF readability is `untested`. These synthetic review inputs and uncalibrated example weights do not estimate hiring likelihood or establish legal eligibility. Score is secondary to the evidence-backed readiness checklist.

The prototype's local Guide retains five UX-level interaction choices. The integrated strategy package maintains the full D-01–14 register and its seven primary decision cards, consequences and recommendations; all remain **unresolved** unless the owner separately records a decision. The synthetic fixture selection above is resolved for demo coherence only. This package is ready for review as a discovery proposal; review is not policy approval, implementation authorization or a paid-service decision.

Architecture and strategy contributions are included as versioned snapshots under `research/architecture/`, `research/ats/`, `research/costs/`, `schemas/cv/v1/`, and `research/strategy/publication/`. The architecture/strategy teams own their technical and research artifacts. Do not treat their methods, cost scenarios, source summaries, or test receipts as production guarantees.

## 17. Integrated package verification and readiness

The portable prototype has 67 deterministic local-state assertions across A–F and a complete 39-interaction Chrome journey pass at desktop and mobile sizes. The final integrated-v3 label was spot-checked after rebuild at 1560×1000 and 390×844; both layouts fit their viewport and the browser console was empty. The ten-route mobile sweep and current technical artifact checks are itemized in [`reviews/ux/verification.md`](../../reviews/ux/verification.md). Checks validate local discovery fixtures only.

The architecture-owned canonical CV, assessment, workspace, ATS/readiness, duration and current v1.2 cost demonstrators pass their documented checks. The retained historical `research/costs/cohorts_v1_1.py` is not verified in this snapshot because its imported `model_v1_1.py` is absent; it is excluded from current cost claims. No production service, real model call, payment, PDF renderer, calibrated hiring outcome, or browser support outside the checked Chrome environment is established. The complete proposal is packaged for cross-review/promotion; D-01–14 remain explicit owner choices.
