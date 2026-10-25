# Resumora customer journeys for future frontend implementation

Reference date: **2026-10-25**. Status: **documentation proposal; frontend implementation remains on hold**. This document consolidates the existing product and data rules into complete user flows. It does not approve release scope, commercial/privacy policies, providers or infrastructure. “Must” and acceptance criteria below describe the proposed future implementation contract, not working features or owner approval.

## Authority, availability and evidence

Use the [PRD, especially §§15–16](prd.md), [decision register D-01–14](../../research/strategy/publication/docs/product/decisions.md), [UX journeys A–F](../../research/ux/journeys.md), [screen specifications](../../research/ux/screen-specifications.md), [canonical CV/workspace schemas](../../schemas/cv/v1/README.md), [journey contracts v3](../../research/architecture/journey-contracts-v3.md), [authentication preparation](../setup/authentication.md) and [shared synthetic examples](../examples/README.md) together. Later PRD direction takes precedence over the older architecture proposal for a numeric readiness rubric: retain five qualitative checks, no additional readiness score. This consolidation does not modify those sources or resolve their open decisions.

| Availability label | Meaning in this checkout |
|---|---|
| **Implemented local foundation** | React development shell, Worker health endpoint and development proxy. Static source inspection confirms health reports authentication `not_implemented` and database `not_connected`; auth route contracts return 501. See [local foundation](../setup/local-development.md), [Worker source](../../apps/api/src/index.ts) and [shell source](../../apps/web/src/App.tsx). No app was run for this document. |
| **Reference/demo only** | The synthetic discovery prototype and imported design examples. They illustrate interactions; they do not establish real accounts, parsing, model analysis, persistent hosted versions, payments or PDF output. Some prototype JSON portability works only on synthetic local state. |
| **Planned** | Every customer product flow J01–J19 below. They require separately authorized application work and relevant dependencies. No end-to-end customer journey is implemented by the foundation. |
| **Owner decision** | Remaining depth, access, privacy, retention, policy and release choices. Recommendations are discussion options, not selections. |
| **Deferred candidate** | URL fetching, extension, OCR, extra output formats/templates, Google and other later integrations. Discovery coverage is retained; inclusion/timing remains an owner choice. |

The [updated design receipt](../../references/design-system/cvizat/update-2.md), [ZIP](../../references/design-system/cvizat/CVizat%20Design%20System%20%282%29.zip) and [ordered inventory](../../references/design-system/cvizat/update-2.manifest.json) identify the current supplied reference. Paths such as `ScrBase.jsx` below are ZIP members under `ui_kits/web-app/`, not app modules or new filesystem routes. The original extracted tree remains the older reference. The [adoption guide](../frontend/design-system-adoption.md) records integration gaps.

### Flow index

| Flow | Customer intent | Earlier journey / design evidence | Availability / dependencies |
|---|---|---|---|
| [J01](#j01--register-and-verify-email) | Register and verify email | A; UX02, `OnbStart.jsx`, `OnbApp.jsx` | Planned; Auth, email, session boundary |
| [J02](#j02--log-in-resume-and-log-out) | Log in, resume, log out | H; AUTH01/AUTH05, `ScrSystem.jsx` | Planned; Auth, session/draft ownership |
| [J03](#j03--change-password-while-signed-in) | Change a known password while signed in | Account; auth policy gap | Planned; owner decision on reauthentication and sessions |
| [J04](#j04--recover-a-forgotten-password) | Recover a forgotten password | H; AUTH02–AUTH04, `ScrSystem.jsx` | Planned; purpose-bound recovery, email |
| [J05](#j05--add-a-cv-by-upload-or-manual-entry) | Upload or manually add a CV | A; UX03–UX04, `OnbImport.jsx` | Planned; private upload/extraction; OCR deferred candidate |
| [J06](#j06--review-confirm-and-save-base-cv) | Confirm, save and review Base CV | A; UX05–UX06, `OnbReview.jsx`, `ScrBase.jsx` | Planned; canonical persistence and conflict handling |
| [J07](#j07--enrich-facts-skills-and-wording) | Enrich facts and improve wording | B; UX08, `ScrEnrich.jsx` | Planned; persisted answers; optional bounded AI |
| [J08](#j08--edit-undo-and-restore-base-or-job-versions) | Edit, undo and restore versions | A/E; UX06–UX07/UX14, `ScrBase.jsx`, `ScrEditor.jsx` | Planned; independent version branches |
| [J09](#j09--add-a-job-by-paste-url-or-manual-input) | Add a job and recover failed import | C; UX09, `ScrJobs.jsx` | Paste/manual planned; URL/extension deferred candidates |
| [J10](#j10--review-requirements-match-and-eligibility) | Review requirements and evidence | C/D; UX10–UX12, `ScrJobs.jsx`, `MatchReport.jsx` | Planned; versioned requirements/evidence/method |
| [J11](#j11--tailor-approve-and-optionally-promote-to-base) | Tailor and approve a job CV | E; UX13–UX14, `Improve.jsx`, `ScrEditor.jsx` | Planned; explicit approval and scoped versions |
| [J12](#j12--templates-language-preview-and-pdf-export) | Choose presentation, preview and export | E; UX15–UX16, `ScrEditor.jsx` | Planned; actual PDF renderer/readability; format breadth open |
| [J13](#j13--applications-latest-cv-contact-and-sent-record) | Track an application and mark sent | G; UX20, `ScrApps.jsx` | Planned; manual application/sent records |
| [J14](#j14--review-supplied-linkedin-text) | Review own LinkedIn text | G; UX21, `ScrApps.jsx` | Planned discovery scope; launch depth D-14 |
| [J15](#j15--select-a-plan-and-complete-checkout) | Choose a plan and complete payment | F; UX17, `ScrAccount.jsx` | Planned; pricing/access decision, payment confirmation |
| [J16](#j16--manage-a-subscription-cancel-or-resume) | Manage subscription and cancellation | F; UX18, `ScrAccount.jsx` | Planned; entitlement and cancellation policy |
| [J17](#j17--data-portability-and-account-deletion) | Export account data or delete account | F; UX18, `ScrAccount.jsx` | Planned; privacy/retention decision and deletion pipeline |
| [J18](#j18--extension-capture-and-unsupported-site-fallback) | Capture a job with an extension | C; `ScrJobs.jsx`, route notes | Deferred candidate; consent, permission/site review |
| [J19](#j19--global-failure-offline-and-safe-return) | Recover from service/session failures | I/H; SYS01–SYS04, AUTH05, `ScrSystem.jsx` | Planned; safe retry, drafts and operation fencing |

These J IDs are document-local navigation aids. Do not rename canonical journeys or treat exported screen IDs as approved routes. The export calls the guide A–G in some metadata but actually defines A–I; UX01/UX02 are reused across onboarding and workspace screens. Reconcile navigation and IDs before implementation.

## Rules shared by every journey

**Language contract L1:** UI defaults to Romanian, with English secondary; CV language is an independent document preference. UI switching translates controls, validation, status, dates/numbers and help without changing facts, document text or proficiency. Choosing CV language requests a separate reviewed document/text version where translation is needed; it never silently translates facts, historical titles into new roles, or qualifications into legal recognition. Keep RO diacritics, suitable plural/number formats and locale-aware dates. Every flow below inherits L1, including emails and accessible status/error text where supported; email locale is not CV language. New export screens have inline English, not completed localization.

**Data contract V1:** sources → extracted/unconfirmed draft → user-confirmed facts → selected facts and separately approved supported prose → immutable Base or job snapshot → pinned export → optional explicit sent attestation. Each transition has its own scope and user intent. Source/hash/locator/extractor references, stable entity/claim IDs, confirmation basis and generator/prompt versions must survive. “Confirmed by you” is self-report, not external verification. Generated text is never independent factual evidence. Portable CV content and tenant/account envelopes remain separate.

**Field contract F1:** preserve two independent positioning-title slots, with the second blank/unknown allowed; employment titles stay factual. Professional and technical skills are separately editable and evidence-linked. Keep role/company/location, context and useful accomplishment bullets, education and supported optional/custom sections. Three or four bullets are guidance, not a quota to fill with fiction. Full address/photo are not required. Preserve year-only/month-year/ongoing precision; never invent January, an end date, seniority, metrics, tools or credentials. Duration uses union of overlapping intervals, bounds when uncertain and a fixed as-of date. Missing detail is not proof of a gap or failure.

**State contract S1:** every flow needs idle/loading/success plus relevant validation, empty, cancelled, expired, conflict and retryable/final error states. State labels must say what was saved and what remains a draft. Async operations follow the architecture's queued/running/needs_input/succeeded/failed_retryable/failed_final/cancel_requested/cancelled/expired model where applicable. Keep the last saved snapshot visible; retain recoverable input according to approved privacy policy. Cancel prevents late results publishing over newer work. Retrying a write/payment/export cannot duplicate a version, charge, submission or entitlement reservation. Quota/provider failures offer a truthful manual/retry path; no automatic paid upgrade or repeated background generation.

**Session/access contract A1:** production authorization and ownership are server-enforced, independent of UI visibility. Browser → Worker → Auth follows the existing preparation: protected session/flow cookies, exact origin/CSRF checks for writes, verified identity and purpose-bound callbacks, no passwords/tokens in browser storage or logs. Feature access is a policy decision; no client redirect/timer grants entitlement. No real service is enabled by this reference.

**Frontend acceptance contract U1:** all flows require labeled fields, keyboard navigation, visible focus, text alongside color, accessible progress/errors, dialog focus/return/Escape handling, and usable mobile/zoom layouts. Preserve input on validation and focus the relevant error. Cancel/back and browser history must not silently discard unsaved edits. Responsive navigation is open: original horizontal navigation and the new five-tab proposal differ. Accessibility/mobile conformance has not been established by the references.

## J01 · Register and verify email

**Goal, entry, preconditions:** a new user chooses Create account from Welcome or a gated resume action. The implementation must have an approved Auth/email boundary and terms/privacy text; initially only explicitly authorized project-team email testing is in scope. Availability: planned; email/SMTP, terms and actual callback settings are dependencies.

1. Welcome explains the Base → job CV outcome. Account form collects required name/email/password and the applicable acknowledgment; link to Log in remains visible.
2. Validate locally and server-side; submit once with visible progress. Show a generic Check email response without disclosing existing-account status. Creating a record does not establish verified access.
3. Open the confirmation link in the initiating browser; validate the bound confirmation transaction and exchange the code. Only verified success establishes the session; remove callback credentials from the URL.
4. Continue to search goals and CV import, or the safely retained destination. A suggested document language may follow search goals but remains editable and independent under L1.

**Boundaries/outcome:** account identity is not a CV fact or Base version. Unconfirmed signup cannot access owned app records. Do not save passwords in drafts or telemetry. Success means verified identity and a usable session, not merely “email sent.”

**Recovery:** missing/invalid fields stay editable; handle duplicate submission, provider failure and rate limits with generic guidance. Unreceived/expired/used links offer a controlled new request. Missing verifier/another device restarts in that browser. Verification cancellation leaves the account unverified, with no fabricated CV/session.

**Acceptance:** unconfirmed, expired, replayed and wrong-purpose callbacks cannot enter the app; valid confirmation works once; known/unknown account responses do not reveal existence; email receipt is tested separately. Auth source governs actual link lifetime and cooldown, not the mock's 24-hour copy.

## J02 · Log in, resume and log out

**Goal, entry, preconditions:** a returning user opens Login or resumes after expiry. Availability: planned; confirmed account, real Worker session boundary and an approved draft-retention policy are required. Evidence: AUTH01/AUTH05 and authentication preparation.

1. Enter email/password and submit; show progress, generic invalid-credentials guidance and Forgot password.
2. Verify identity server-side, then return to a fixed safe destination or authorized retained app location. Returning Home shows the active application and latest completed CV; empty Home offers Add job and Create Base.
3. Refresh sessions safely; if refresh fails, show Signed out, explain what is actually retained, and allow login without losing the last saved version.
4. Explicit Logout requests server logout and clears session/flow cookies; display confirmation and Login. “Log out other devices” is a separate policy/action, not implied by local logout.

**Boundaries/outcome:** login/logout do not change Base/job snapshots or sent status. Retained private drafts must not appear to a different account on the same device; no promise of offline persistence before it exists. L1 preferences do not determine identity/provider.

**Recovery:** throttled login has bounded retry/reset guidance without confirming account existence; unavailable Auth preserves safe input, never password persistence. Logout failure cannot be shown as confirmed server revocation; expiry returns to a safe page. Handle another account and missing/deleted destinations explicitly.

**Acceptance:** only verified sessions see their own data; invalid/expired refresh fails closed; protected cookies are unreadable by page scripts; logout clears local session state and reports actual revocation limits. Source preparation notes already-issued JWTs may remain valid until expiry; do not promise instant global revocation.

## J03 · Change password while signed in

**Goal, entry, preconditions:** an authenticated user who knows their password opens Account → Security → Change password. Availability: planned with a **design/API gap**; the current preparation defines a recovery-only password update, not a signed-in change endpoint.

1. Show password requirements and approved reauthentication step (recommended: verify current password/recent authentication before change). Do not reuse ordinary login state as recovery proof.
2. Enter new password and confirmation; validate match and approved strength rules; submit once after explicit confirmation.
3. Server verifies the signed-in change authority, updates the credential and applies the approved session policy. Clear password fields and show success; direct the user to login again if that policy ends the session.

**Boundaries/outcome:** no career/version/entitlement change. New credentials never enter CV records, browser storage or logs. Success requires a confirmed update, not a toast. L1 controls labels; password content is never translated.

**Recovery:** wrong current password or stale reauthentication preserves non-secret page context; offer Forgot password if the old credential is unknown. Mismatch/weak password is field-level feedback. Expired session uses J02/J04; timeout must reconcile outcome before blindly resubmitting. Cancel changes nothing.

**Acceptance:** an ordinary session cannot invoke the documented recovery-only update; unauthorized/cross-account requests fail; after success the old password fails and the new one works. Architecture/security owner must specify endpoint, reauthentication method and other-device revocation before implementation; this document recommends a separate signed-in command and explicit session explanation, without selecting provider behavior.

## J04 · Recover a forgotten password

**Goal, entry, preconditions:** a signed-out user selects Forgot password. Availability: planned; purpose-bound email recovery and actual approved recipient/sender/callback setup are dependencies. Evidence: AUTH02–AUTH04 plus authentication preparation, which governs conflicts with the mock.

1. Enter email → submit → generic “If an eligible account exists, check your email.” Apply actual throttling; request acceptance does not prove delivery or account existence.
2. Open the recovery link in the initiating browser. Worker validates purpose/verifier, exchanges the code and establishes restricted, expiring recovery context.
3. Only then show New password and confirmation. Submit with valid recovery context and CSRF protection; consume/clear that context after successful update.
4. End the recovery session and require login with the new password. This follows preparation; the mock's automatic Home navigation and claimed logout everywhere are not adopted.

**Boundaries/outcome:** a request email, ordinary login, confirmation callback, URL flag or direct visit to reset form grants no recovery right. No CV version changes. L1 governs messages and email presentation.

**Recovery:** invalid/used/expired link or missing browser context offers a fresh request, not a bypass. Handle mail failure, rate limiting, resend, password mismatch, expired recovery during editing and ambiguous network result. Cancel clears transient secrets/context as appropriate; never expose provider tokens.

**Acceptance:** one verified recovery updates the intended account once; replay, wrong-purpose exchange and direct form submission fail; new login succeeds, old password fails. Link lifetimes, password rules and cooldowns come from reviewed configuration/policy; mock 1-hour/30-second/8-character claims are proposals, not verified settings.

## J05 · Add a CV by upload or manual entry

**Goal, entry, preconditions:** first-time user chooses Bring my CV, or returning user imports another source. Availability: planned; private object storage, extraction and operation ownership are dependencies; scan/OCR scope D-02 remains open. Evidence: UX03–UX04, `OnbImport.jsx`.

1. Explain supported types/size, handling and privacy from approved policy before upload; offer Start from scratch equally clearly. The demo's PDF/DOCX and 10MB limits are examples, not finalized service limits.
2. Select a file, validate actual type/size/safety server-side, upload privately and show named extraction stages with Cancel. A manual choice opens blank canonical fields without synthetic content.
3. Extraction returns a reviewable draft with source references and uncertainty. Route to J06; a later import compares/reviews a new source rather than replacing the existing Base silently.

**Boundaries/outcome:** original bytes and source provenance remain separate from normalized fields and generated text. Extraction produces unconfirmed claims, never a user-confirmed Base. Success is a usable review draft or manual draft; no “PDF readable” conclusion follows from import.

**Recovery:** empty selection, wrong type/size, corrupt/encrypted/scanned document, timeout and partial parsing show safe reasons with manual/paste/try-another-file options. Retry preserves last saved Base and avoids duplicate source/version creation. Cancel cannot publish a late extraction into a newer draft. No OCR promise while deferred.

**Language/acceptance:** preserve original language/diacritics; L1 document choice does not translate extraction silently. Missing name, two unknown titles, year-only roles and absent skills remain editable unknowns. Unsupported files reach manual entry without losing saved work; uploaded facts cannot be exported as confirmed before J06.

## J06 · Review, confirm and save Base CV

**Goal, entry, preconditions:** user reviews an extracted/manual draft to create a trustworthy Base, then sees what needs attention. Availability: planned; canonical persistence, provenance/confirmation and revision handling are dependencies. Evidence: UX05–UX06, `OnbReview.jsx`, `ScrBase.jsx`.

1. Inspect identity/contact, both title slots, summary, professional/technical skills, each role and dates, education and optional sections. Show source, unconfirmed status and ambiguity beside relevant fields; permit correction and missing/unknown values under F1.
2. Review/confirm selected facts or sections with clear scope. Correcting a source assertion creates appropriate claim/provenance records, not a forged extractor result. Explicitly acknowledge factual content before saving.
3. Save an immutable Base checkpoint with reason and parent reference; show version, saved state and preview. Later imports/edits create another checkpoint.
4. Immediately show Content, Structure/format, Job optimization, Writing quality and Application readiness as qualitative checks with next actions; pending/N/A is visible. Choose J07, edit, add a job or leave safely.

**Boundaries/outcome:** schema-valid draft is not export-eligible; unconfirmed/suggested/rejected facts and pending prose cannot become attested content. First-save minimum and progressive blocking policy remain D-09 / D-10. Do not require an invented second title or fill optional modules for a score.

**Recovery:** field/date/email errors preserve draft; empty sections show add/skip; save conflict preserves local changes for comparison, never overwrites the newer head. Failure keeps previous saved version. Cancel/back explains unsaved scope; retry is idempotent.

**Language/acceptance:** L1/F1 apply, including duration bounds/as-of/overlap. A confirmed save retains source/IDs, excludes unsupported inference and yields a retrievable checkpoint. Five checks never produce a new aggregate readiness number or treat absent job context as a pass.

## J07 · Enrich facts, skills and wording

**Goal, entry, preconditions:** from an immediate Base check, user explains a real contribution or fills a supported gap. Availability: planned; persisted section answers, revision-aware patches and optionally approved model operations are dependencies. Evidence: B/UX08, `ScrEnrich.jsx`, architecture helpers.

1. Open one relevant section/question linked to stable role/section IDs; show why asked. Answer contribution/tools/audience/result, revisit saved answer, Skip or I don't know. Qualitative/unmeasured results are valid.
2. Inspect extracted proposed facts and before/after wording with source/claim links. Explicit factual confirmation is separate from approval of generated prose.
3. Choose Base or one job CV destination. For skill/section changes, preview Append versus Replace of the selected target; accept only selected patches. Keep professional and technical groups distinct.
4. Save a new version with question/answer/source/reason; offer scoped Undo for unsaved changes and history/restore for committed work. Recalculate affected assessments explicitly.

**Boundaries/outcome:** skip/unknown adds no fact or semantic points. A model suggestion stays pending until confirmed, and wording approval does not manufacture evidence. Replacing a skill list does not delete career history. No question/helper makes a model call merely on each keystroke.

**Recovery:** empty answer, stale target, removed role, unsupported metric, generation timeout/quota and conflict preserve answer/draft. Retry only the requested proposal; manual editing remains available. Cancel discards unaccepted proposal, not prior saved facts. Do not repeat answered questions unchanged.

**Language/acceptance:** L1; translate a proposal only within chosen document scope and review it again. Accepted job-only enrichment leaves Base unchanged; confirmed answers retain their exact lineage. Unsupported tools, achievements and numbers are never silently added. Append/Replace/Undo affect only the identified target and preserve other sections.

## J08 · Edit, undo and restore Base or job versions

**Goal, entry, preconditions:** user edits an owned saved Base or independent job CV, or restores a prior checkpoint. Availability: planned; immutable version stores, draft revision conflicts and independent branch history are dependencies. Evidence: UX06–UX07/UX14 and canonical/workspace contracts.

1. Open a clearly labeled Base or job document with its source Base/job references. Edit structured fields, visibility, sections, order and selected prose; show unsaved state and preview.
2. Undo reverses a selected draft action within its scope. Explicit Save creates the next checkpoint; unchanged/no-op saves should not create misleading content history (proposed behavior).
3. Open history, inspect timestamp/reason/content and choose Restore with confirmation. Restore creates a new checkpoint; earlier snapshots remain intact. Full job history must be implemented separately from the reference's limited Base history.

**Boundaries/outcome:** changed factual content gets appropriate new claim IDs; unchanged facts retain lineage. Job save, template selection and translation do not mutate Base. Restoring content does not erase submission attestations or replace a previously sent snapshot. Older evidence/assessment pins remain inspectable and current dependent analysis becomes stale.

**Recovery:** no history offers import/create; invalid dates/empty bullets preserve edits; revision mismatch (proposed 409) compares changed IDs without clobbering either side. Undo conflict offers comparison; cancel restore changes nothing. Network retries do not duplicate checkpoints. Offline editing must not be claimed before approved persistence exists.

**Language/acceptance:** L1/F1; year-only data survives edit/save/restore and overlapping roles are not double-counted. Job-only saves leave Base byte-equivalent; restore retains history and reason, and unsaved Undo cannot rewrite a committed snapshot.

## J09 · Add a job by paste, URL or manual input

**Goal, entry, preconditions:** user starts a job-specific application from Home/Applications, with or without an existing Base. Availability: paste/manual planned; URL fetch a deferred candidate pending D-01/security/site policy. Evidence: C/UX09, `ScrJobs.jsx`.

1. Choose Paste, Manual or the proposed URL option. Paste text or enter known role/company/requirements; URL requires a supported public address and explicit intended capture. Preserve source and job language separately from UI/CV language.
2. Parse once per new accepted text/context with loading/cancel; retain original text for correction. Detect a duplicate and offer existing job versus explicit new snapshot, not a silent merge.
3. Open structured requirements in J10. If no Base exists, save/resume the job context and offer J05; do not fabricate Candidate–Job Fit from a CV alone.

**Boundaries/outcome:** a saved job/requirements snapshot has stable IDs, source text/hash and version; edits create a new snapshot and invalidate dependent analysis. Recommendation: create a lean editable application record at job save for continuity, subject to D-13. Adding a job is not tailoring or submission.

**Recovery:** blank/short/ambiguous text and incomplete manual fields receive actionable validation; demo thresholds are not finalized. Login/captcha/blocked/unsupported URL, timeout, access or parse failure falls back to editable paste/manual, never attempts bypass/login. Cancel preserves last saved job and available input. A retry cannot create duplicate application/job records.

**Language/acceptance:** L1; RO/EN job text must preserve required/preferred meaning and source evidence. All enabled entry modes converge on one editable review and offer explicit unsupported-import recovery. No actual URL/extension execution is present in the reference.

## J10 · Review requirements, match and eligibility

**Goal, entry, preconditions:** user wants to understand job demands, supported experience and missing evidence. Availability: planned; accepted profile/document/job/requirements versions, method/dictionary and evidence mapping are dependencies. Evidence: UX10–UX12, `ScrJobs.jsx`, `MatchReport.jsx`.

1. Correct requirement atoms, source sentences, category, required/preferred/unspecified basis, AND/OR/negation and ambiguity. Separately identify genuine non-compensatory hard gates; “required” wording alone is insufficient.
2. Select Base and evaluated CV versions; explicitly analyze. Show Candidate–Job Fit from the full confirmed profile, CV–Job Match from selected document facts, independent eligibility and actual PDF readability. Missing full profile means Fit unavailable, not invented.
3. Filter five primary keyword states: included, verified_equivalent, verified_omitted, awaiting_confirmation, unsupported. Explain evidence and alias/confirmation basis; propose selection of supported omitted facts or a question, not gap-filling fiction.
4. Answer/attest a hard gate explicitly where appropriate. Unknown stays Needs verification; a sourced negative attestation creates Confirmed requirement gap. Recalculate after relevant changes.

**Boundaries/outcome:** scores pin inputs/method/as-of and are uncalibrated estimates, never hiring probability/employer ATS. Confirmation precedes matching; a word appearing in pending prose does not earn evidence. Eligibility never alters semantic scores; PDF readability stays Not tested without actual-file checks. High scores never erase warnings through compare/export.

**Recovery:** no job/Base, empty extracted requirements, failed analysis, quota, stale versions and ambiguous credential equivalence have distinct guidance. Retry uses named versions; changed requirements invalidate the old result. Cancelled/late runs cannot overwrite newer analysis.

**Language/acceptance:** L1; dictionary version supports reviewed RO/EN equivalence, not arbitrary tool/legal equivalence. The shared synthetic Mara case pins Fit 90→90 and CV Match 62.5→90, authorization Needs verification and PDF untested; do not substitute the export's 62 or invent exact new scenario scores. Rewording/repetition/template-only changes cannot improve semantic scores.

## J11 · Tailor, approve and optionally promote to Base

**Goal, entry, preconditions:** user prepares truthful job-specific content from reviewed confirmed evidence. Availability: planned; J10 evidence, independent job branch and scoped approval are dependencies. Evidence: E/UX13–UX14, `Improve.jsx`, `ScrEditor.jsx`.

1. Start a job proposal from a pinned Base/job/requirements context. Show current versus proposed summary/bullets/sections, source evidence, factual additions versus wording changes and remaining gaps.
2. Approve/reject each change explicitly. Reject all retains the original selection; no preaccepted array is treated as consent. New facts route through J07 confirmation first.
3. Save chosen content as a job CV version with Base/job lineage. Open structured job editor for further changes using J08.
4. If new confirmed facts should enter Base, use a separate promotion dialog with exact selected claims, destination/Append–Replace scope and expected Base revision. Confirm to create a new Base checkpoint; otherwise Base remains unchanged.

**Boundaries/outcome:** selection, fact confirmation, prose approval and Base promotion are separate decisions. No irrelevant/empty section, invented metric/tool/title or repeated keyword is added for points. Only approved supported prose/confirmed selected facts enter export projection. A saved completed target-specific selection supplies tailoring provenance; analysis/template/export alone does not.

**Recovery:** unsupported proposal explains why unavailable; generation failure preserves current CV; stale input or Base-promotion conflict requires comparison/review, not silent regeneration. Cancel discards unapproved proposal only. Retry cannot apply the same patch twice. After a factual edit, old analysis is labeled stale.

**Language/acceptance:** L1/F1; each translation/prose proposal retains supporting claim IDs. Saving a job CV changes neither Base bytes nor prior snapshots; rejection preserves source content; promotion affects only reviewed selected facts. Keep hard-gate warnings visible and separate through J12.

## J12 · Templates, language, preview and PDF export

**Goal, entry, preconditions:** user obtains the exact reviewed saved job document to send. Availability: planned; actual renderer, fonts/template rights, export projection, readability checks, storage and approved entitlement policy are dependencies. Extra templates/DOCX are deferred candidates (D-04). Evidence: UX15–UX16, `ScrEditor.jsx` and PRD §9.

1. Choose supported template, document language and explicitly visible contact fields. Clar/Contur are design examples; presentation cannot alter facts. Translate/review selected text separately if required under L1.
2. Preview the exact saved snapshot, inspect content and unresolved eligibility warnings, then explicitly confirm. Unsaved edits require save/clear choice; private contacts/unconfirmed facts/pending prose are not silently included.
3. Request PDF; pin snapshot/content hash, template/font/renderer versions, language and contact projection. Server validates projection/access, reserves any approved entitlement and shows queued/render/check stages.
4. Render and independently extract/check actual text/order/headings/dates/contacts/diacritics before publishing export ID/download. Show accurate readability results and useful failure detail; download does not mark sent.

**Boundaries/outcome:** newer edits cannot change an in-flight export. HTML preview, timer or completed payment is not PDF success/readability proof. A content-supported PDF and its provenance identify the exact snapshot; neither changes Base or semantic scores.

**Recovery:** no saved CV, missing/invalid confirmed content, font/render/readability failure, quota or access failure offers save/manual correction/retry. Retain previous successful exports and pin retry context; changed input needs a new explicit request. Pending payment grants no access; approved gate returns through J15 without losing the CV. Cancel/timeout reconciles reservation/result safely.

**Acceptance:** the downloaded file matches pinned confirmed selection and approved prose, honors privacy, supports RO diacritics/multipage order and remains identifiable after later edits. No current real PDF or readiness pass is claimed. Export success never creates a sent attestation.

## J13 · Applications, latest CV, contact and sent record

**Goal, entry, preconditions:** user organizes one job, attached CV and next action, then records an external submission. Availability: planned; tenant-owned workspace/application/contact/sent records and D-13 depth decisions are dependencies. Evidence: G/UX20, `ScrApps.jsx`, workspace v1.1 contracts.

1. Open Applications; search/filter owned role/company/contact/next-action records, with explicit empty/no-results states and clear filters. Open a record showing job, latest completed branch CV, tailored/not-tailored label and separate chosen/sent versions.
2. Attach a specific existing CV/export; add optional private contact and next action/date. Keep no-CV explicit; pending/failed/cancelled/superseded generations cannot replace the latest completed document.
3. Send externally using the user's chosen channel (outside this product flow), then explicitly choose Mark as sent. Confirm actual attached CV/template/export and known send date; preserve that exact submitted snapshot.
4. Return later, update stage/contact/next step or create a newer tailored CV. Sent snapshot stays unchanged. Correcting a mistaken attestation is a distinct correction/retraction.

**Boundaries/outcome:** latest branch sequence is server-monotonic, not client timestamp/late-job arrival. Tailored means completed target-specific selection with provenance, not Base attachment or export. Count distinct applications with valid user-recorded sent attestations; moving to Interview/Closed does not alter that count. No automated applications, outreach, reminders or calendar integration is promised.

**Recovery:** missing attachment prevents sent confirmation; invalid dates, stale records, duplicate retry and removed contact preserve the application. Search error does not expose another tenant or erase filters. Unknown actual send date stays unknown; recorded-at is separate.

**Language/acceptance:** L1; freeform contact/action text is not silently translated or sent to career AI. New CVs do not overwrite submitted history; export/stage changes never increase sent count; repeated mark-sent retry counts once and cross-account access fails.

## J14 · Review supplied LinkedIn text

**Goal, entry, preconditions:** user compares their own profile text with Base and selects truthful improvements. Availability: planned discovery scope, launch depth D-14; broader import/connection is deferred candidate. Evidence: UX21, `ScrApps.jsx`.

1. Paste/manual-enter own profile text with clear scope/privacy handling; no LinkedIn credentials or actual profile access. Choose reviewed Base/document language context.
2. Explicitly request comparison. Show In both / Only LinkedIn / Only CV with source-backed evidence and limitations, not a fixed demo list presented as live analysis.
3. Review wording proposals and copy approved text manually. A LinkedIn-only factual claim remains unconfirmed until explicit confirmation and separate Base promotion; nothing writes to LinkedIn automatically.

**Boundaries/outcome:** pasted input, analysis and proposals have their own source/version/retention scope. External text is not verified truth or a CV fact by proximity. Success is a reviewable comparison/approved copy, not sync or actual platform update.

**Recovery:** empty/short/unsupported text gets correction guidance; no Base offers creation; timeout/quota keeps permitted input and allows retry/manual comparison. Cancel prevents publishing a stale review; a changed Base marks comparison stale. Delete input under approved policy rather than promising indefinite retention.

**Language/acceptance:** L1; compare meaning with reviewed language support, not automatic equivalence of credentials. No background scraping, credentials, silent Base overwrite or platform write occurs. New confirmed facts follow J07/J11. Recommendation: start with supplied text for consent and recovery clarity, pending D-14.

## J15 · Select a plan and complete checkout

**Goal, entry, preconditions:** user deliberately purchases approved access after seeing useful product value. Availability: planned; D-05 / D-07 / D-12 commercial terms, sender/provider setup and server entitlements remain dependencies. Evidence: F/UX17, `ScrAccount.jsx`.

1. Show free/paid scope and 1/3/6-month concepts with approved price, currency, tax, total, renewal/cancellation and usage reset explanation. Until approved retain `— RON`; no purchasable invented amount or unlimited/free promise.
2. Select term, review summary and explicit renewal acknowledgment if applicable; hand off to authorized provider checkout. No card fields or card storage in Resumora.
3. Return to visible Pending/Declined/Active state. Only validated signed, idempotent server confirmation activates access; redirect or UI timer cannot.
4. Resume the original CV/export action after confirmed entitlement, preserving saved version context and any required new user confirmation.

**Boundaries/outcome:** payment state, account entitlement and operation reservations are separate from CV versions. A receipt/active term derives from provider/server records. Show period/features/remaining/reserved/reset time only from actual policy/state.

**Recovery:** no chosen term, abandoned checkout, provider failure, duplicate callback, delayed confirmation and decline offer safe status/retry/return. Do not assert “nothing charged” on an ambiguous payment result; reconcile provider status before charging again. Pending never grants access. Cancel checkout preserves CV and does not delete account.

**Language/acceptance:** L1 for commercial disclosures; CV language is unchanged. Test duplicate/out-of-order confirmations and expired reservations; only confirmed paid state grants the approved capability. Recommendation: useful Base review and a job comparison before payment, but gate/price/limits remain owner choices.

## J16 · Manage a subscription, cancel or resume

**Goal, entry, preconditions:** subscribed user opens Account to understand access or stop renewal. Availability: planned; approved term/allowance/grace/proration/refund/cancellation policy and provider integration are dependencies. Evidence: F/UX18, `ScrAccount.jsx`.

1. Show current term/status/renewal date and approved allowance/reset information. Active, Pending, Cancel scheduled, Payment failed and Free states are distinct.
2. Choose Cancel renewal → review effective date/consequences → explicitly confirm. Proposed cancel-at-period-end preserves access until the stated end; it is separate from deletion.
3. Where policy permits, Resume before end or update payment through provider. Show confirmation only after server/provider acknowledgment; reconcile failed renewal and any approved grace/access state.

**Boundaries/outcome:** cancellation does not erase CVs/history, revoke confirmations or mark applications sent. It changes future billing/access according to policy, not facts. Post-term editing/export rights and retained data are unresolved D-07 / D-08; show approved consequences, not assumed access.

**Recovery:** empty/no subscription offers plans; provider unavailable or stale period shows last known state and safe refresh. Repeated cancel/resume is idempotent. Cancel the confirmation dialog leaves renewal unchanged. No timed mock state counts as provider confirmation.

**Language/acceptance:** L1 and explicit localized dates/timezone/currency. Cancellation, expiry and account deletion remain separate commands; invoice/refund or grace promises are absent until approved. Recommendation: clearly dated cancel-at-period-end with resume and a truthful access summary, pending D-05 / D-07.

## J17 · Data portability and account deletion

**Goal, entry, preconditions:** user retrieves owned data or deliberately removes the account. Availability: planned; authenticated export/deletion processes, retention/subprocessor/backup policy and required reauthentication are dependencies. Evidence: UX18, privacy proposal and workspace schema; demo JSON output is not a production portability guarantee.

1. Account → Export my data explains included scope and requests a private download. Proposed scope covers Base/job snapshots/history, sources/answers/provenance, applications/sent records, contacts/next actions and LinkedIn inputs/reviews where retained; account/billing inclusion and third-party restrictions need policy confirmation.
2. Show queued/preparing/ready/expired/failure states; authenticate download and identify format/scope/time. Download carries no passwords, session tokens, provider secrets or other users' data.
3. Separately choose Delete account. Explain approved impact on renewal, access, sources, history, objects, derived caches/reviews and retained legal/backup records; require explicit confirmation and approved identity recheck.
4. Track deletion/request outcome truthfully and end access as designed. Report any policy-governed delayed erasure rather than claiming immediate removal everywhere.

**Boundaries/outcome:** portability is not a PDF export or “mark sent.” Cancellation is not deletion; deletion must address billing independently and must not trigger another purchase. Source/history retention and legal records require policy, not invented durations or a promise of total erasure on button click.

**Recovery:** export failure/expired link offers secure regeneration; deletion failure or session expiry preserves clear request state. Cancel before confirmation changes nothing. After irreversible processing starts, do not offer a fictitious Undo; disclose any approved recovery window before confirmation. Retries cannot duplicate destructive jobs.

**Language/acceptance:** L1; original freeform/document language remains intact in portable data. Scope and actual completion are auditable; no cross-user records or credentials escape. Revoked/deleted access cannot keep downloading stale private exports. Recommendation: minimize raw retention and publish exact retention/deletion behavior before launch (D-08), without choosing a duration here.

## J18 · Extension capture and unsupported-site fallback

**Goal, entry, preconditions:** user explicitly captures one visible job page into Resumora. Availability: deferred candidate pending D-01; extension/store/site policy, permission scope and secure short-lived authorization are dependencies. Evidence: UX09 and architecture capture concept, not an installed extension.

1. On a supported job page, user clicks Capture active page. Explain exactly which text/URL would be read; request minimal active-page permissions, not broad history/cookie access.
2. Preview/edit captured text and destination account, then explicitly Send. Cancel submits nothing. All captures converge on J09/J10 review.
3. Detect duplicate/version context and acknowledge saved job only after server success; extension cannot approve requirements/facts or auto-apply to the employer.

**Boundaries/outcome:** no background scraping, login/captcha bypass, password/cookie collection, browser history, LinkedIn sync or outbound application. Capture consent is separate from using the text as job evidence; no data collection runs now.

**Recovery:** unsupported/login-protected page, denied permission, expired auth, offline submission or parse failure offers copy/paste/manual with permitted text retained for review. A retried send is idempotent; wrong-account context must be corrected before submission.

**Language/acceptance:** L1; preserve source language and required/preferred wording. Permission denial/cancel sends no page data; preview matches transmitted scope; unsupported sources always reach paste/manual. Recommendation: implement paste/manual before capture, retain extension coverage for owner review rather than silently removing it.

## J19 · Global failure, offline and safe return

**Goal, entry, preconditions:** user encounters a missing page, service error, lost network/session or maintenance during any journey. Availability: planned; real draft persistence, operation status and safe retry mechanisms are dependencies. Evidence: SYS01–SYS04/AUTH05; maintenance time/status domain in export are placeholders, not configured services.

1. Identify the failure accurately: 404 gives Home/Applications; server failure gives safe reference and Retry; offline distinguishes local draft from saved server version; maintenance gives an actual known status/return time only if available.
2. Say what is verified safe and what could not be saved. Preserve last saved versions and recoverable input according to approved policy; do not promise offline saving or session-restored drafts merely because a mock says so.
3. Resume via J02 or reconcile operation status before retry. Revalidate ownership, input revision, source versions and entitlement; review any conflict before publishing results.

**Boundaries/outcome:** retry is not a new fact/version/payment/sent attestation unless explicitly required. Late extraction/tailoring/export cannot replace newer completed work. Sign-in must not leak retained data to a different identity.

**Recovery/acceptance:** cover long-running, cancelled, expired, final failure, quota and ambiguous completion, including a lost response after server success. Provide a useful manual/back path; avoid endless automatic retries. L1 and U1 apply to status, reference, focus and notifications. Success restores the authorized context with saved state intact, no duplicate side effect and no invented infrastructure assurance.

## Open choices and recommended follow-up

This table records unresolved work for the relevant owners; it does not block keeping this reference or silently approve an option. Firstmate coordinates decisions; implementation workers must verify authoritative answers before shipping behavior.

| Decision / owner | Recommendation and reason | Still unresolved / affected flows |
|---|---|---|
| D-01 / D-02 · Product + architecture | Paste/manual and text PDF/DOCX with explicit fallback first, to make review/recovery testable. | URL/extension permissions/sites, file limits, OCR timing; J05/J09/J18. |
| D-03 / D-11 · Product + ATS/UX | Separate four assessments, explain evidence and show strict-gate warnings; qualitative five checks only. | Hierarchy, calibration acceptance, primary-status presentation; J06/J10–J12. |
| D-04 · Product + renderer | One actually tested readable PDF before wider formats/templates. | Template/style/DOCX breadth and rights; J12. |
| D-05 / D-07 · Product + commercial | Explain value before gate, exact terms/access and cancel-at-end consequences. | Prices, discounts, VAT/refund/usage/grace/renewal, post-cancel access; J12/J15/J16. |
| D-06 · Product | Validate the intended job-seeker segment without reopening recorded job-specific focus. | Candidate validation approach; J01 and first-use paths. |
| D-08 · Product/privacy + architecture | Minimize input retention, publish actual subprocessors/processing/portability/deletion boundaries. | Raw/version/contact retention, backup erasure, residency, lawful policy and free-tier feasibility; all data flows, especially J05/J14/J17. |
| D-09 / D-10 · Product + UX | Immediate Base review with progressive skippable questions; allow truthful unknowns and optional second title. | First-save blocking/minimum export completion and edge policy; J05–J08/J12. |
| D-12 · Product + operations | Bounded operations, preserved drafts/manual path and explicit quota recovery. | Pilot acceptance, budget caps, upgrade handling and release authorization; async flows. |
| D-13 · Product + workspace | Lean editable application at job save; independent chosen/latest/sent versions and explicit sent count. | Stage/contact depth, exact submission corrections/history and release timing; J09/J13. |
| D-14 · Product + privacy | Own supplied LinkedIn text first, because source scope/consent are explicit. | Launch depth, broader import/terms and retention; J14. |
| Auth · Architecture/security + product | Follow existing Worker/purpose-bound recovery plan; implement a separate reauthenticated signed-in password change. | Signed-in endpoint/reauthentication, credential strength, actual link/cooldown settings, global logout and private draft retention. Mock timings/automatic reset login are not authority; J01–J04/J19. |
| Navigation · UX + product | Map screen IDs/routes once and validate desktop/mobile/keyboard continuity. | Original horizontal versus updated bottom tabs, A–G/A–I metadata mismatch, full state coverage. No visual redesign is authorized here. |

## Later frontend acceptance and handoff

Before implementation starts, record approved scope/decisions, map canonical IDs/versions into view models, define auth and export contracts, and resolve reference inconsistencies. Use the existing synthetic fixtures, not real CVs or accounts: [Mara examples and acceptance checklist](../examples/README.md) covers confirmed/unconfirmed facts, partial dates, evidence mapping, job-only changes and actual-file gaps. New journeys add no synthetic score, database schema or owner decision record.

Each implementation task should name its J flow, approved policy inputs, persisted transition, complete S1/U1 states and acceptance criteria above. Verify RO UI/EN CV and EN UI/RO CV independently, plus keyboard/dialog/mobile paths. Test scoped ownership, concurrent save/conflict, repeated retries and late async responses; separate structural validation from factual confirmation, prose approval and export eligibility. Signup/login/recovery require real authorized tests; PDF needs actual-file extraction; payments need genuine server confirmation tests. Existing mock examples cannot satisfy those checks.

This documentation stage performed static consistency review and local link/anchor checks only. No app/build/tests, browser, installation, schema migration, hosted changes, provider/email/model/payment calls or deployment were performed. Independent DB validation is outside this document and is not assumed complete. The next action is Firstmate/owner review of unresolved policies, followed by a separately bounded implementation authorization; frontend development stays on hold.
