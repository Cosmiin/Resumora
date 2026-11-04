# Guided Profile enrichment

Date: 2026-11-02
Status: Approved and implemented locally. Synthetic verification completed; live provider latency and hosted stream buffering remain unmeasured.

## Intent and agreed direction

Help users express their experience so a recruiter can quickly understand their contribution. The user should learn why the wording works, feel meaningful progress, and finish with a professional, readable base CV they trust.

The user selected a focused role workspace: contextual questions one at a time, followed by one editable whole-role proposal, with the original available on demand. The unit of improvement is the whole role, including a short introduction and responsibilities/achievements. Individual sentences remain the basis for diagnostic feedback. The same experience must cover projects and volunteering.

The user approved priorities 1–5: whole-role improvement; contextual discovery; trustworthy scoring and encouragement; evidence-backed competence consolidation; projects and volunteering. Preserve the current scoring rubric initially.

Additional user requirement: AI interactions must feel fast, ideally completing in 5–10 seconds and within 15 seconds at most, with a live typewriter effect. Include real streaming for both the OpenRouter primary and direct OpenAI fallback. These are required performance targets, not claims about currently measured behavior or unconditional provider guarantees.

This is a coordinated feature project delivered incrementally, not a whole-application rewrite. The detailed interaction and engineering defaults below are the assistant's proposals unless explicitly identified as agreed requirements.

## Approaches

1. **Focused role workspace — selected by the user.** Build on the existing modal and Profile save/evidence machinery. One primary action at each stage; source comparison and detailed scoring expand on demand. This needs explicit flow state but fits a calm, finite improvement experience.
2. **Conversation-led.** A chat can explore freely, but makes completion and the relationship between conversation, approved evidence and saved CV harder to communicate. Not selected.
3. **Inline editor.** Suggestions sit beside existing text and offer immediate context, but questions, explanations, comparisons and editing would compete for space, especially on mobile. Not selected as the main journey; normal manual editing remains available.

## Existing foundations and gaps

- `ExperienceEnrichment.tsx` implements the newer, primarily point-oriented experience. `Enrichment.tsx` and `RoleRewrite.tsx` contain earlier whole-description flows. `App.tsx` selects the new experience for employment roles and the old experience for optional entries.
- Existing accepted facts, confirmed answers, immutable source references and `presentation.approvedWording` separate evidence from presentation. `currentWording` verifies the referenced evidence. Keep those semantics and the existing export path.
- `confirmExperienceDetail` preserves earlier evidence when an answer is revised. The existing apply/undo helpers provide useful behavior, but need whole-entry acceptance and stale guards.
- The active scoring policy is `experience-score/5`, using `experience-quality/3`: contribution 40%, clarity 30%, specificity 30%, averaged across points. Qualitative whole-role observations complement the number. A high mean can conceal a weak sentence.
- The automatic score coordinator assesses saved applied text. A proposal preview must be assessed separately; it must never be temporarily applied to the Profile just to obtain a score.
- Experience contracts, route eligibility checks, facts/text helpers and score merging currently assume employment roles in several places. Extend these deliberately to projects and volunteering.
- Existing operation receipts, revision checks and the document/save controller own recovery and persistence. Reuse them; do not add a second Profile store or generic workflow engine.

## Experience and action budget

### Entry

The Profile offers **Improve this role**, using the existing entry context. The workspace names the role and shows the current writing assessment when available, one useful strength, and the most valuable next improvement. Avoid listing every deficiency on entry.

The default primary action is **Add useful details**. A quieter **Improve with what I have** action goes directly to generation. A role with no useful outstanding questions can lead directly to generation. Strong roles receive a proportionate invitation to polish, not an alarming incomplete status.

### Discover

Show one contextual question and one answer field. **Continue** confirms the answer and advances; do not require a separate Save followed by Next. Provide a quiet **Skip** action and allow the user to finish with available information. Confirmed answers are saved through the existing controller; unsent typing is draft input, not evidence the AI may use.

Ask about real gaps in the role: the recipients and purpose of reports, departments supported, tools actually used, responsibilities owned, scope and outcomes. Ground prompts in existing text and confirmed answers. Examples may help recall but must be phrased as possibilities, never presumed facts. Quantified outcomes, named software and leadership claims are optional and must not be invented or demanded.

Use the existing maximum of three questions per round. Stop early when the user finishes or the useful gaps are covered. Do not keep asking automatically to chase 100. Reuse confirmed answers and avoid repeating answered or skipped questions within the current evidence version. A new round is explicit and tied to a remaining useful gap. The initial implementation can generate a bounded question set once and filter answered questions; it need not make a model call after every keystroke or answer.

Use the finite stages **Details → Review → Saved**. Within a round, show the question position. Do not display an invented percentage of career completeness.

### Review

Generate one whole-role proposal using the eligible saved evidence and confirmed answers. Present a short introduction followed by concise responsibilities/achievements. The introduction describes purpose and scope; it should not repeat every bullet. Combine or reorder sentences where useful, without silently dropping distinct material responsibilities or achievements. Preserve original evidence even where repeated wording is compressed.

Show the proposed version as the main editable text and a short explanation of the most useful changes. **Show original** reveals the original on demand; default to one readable column and avoid a permanently open side-by-side diff. Keep the existing text representation/export compatibility; structured intro and points may be used in the proposal contract and serialized deterministically into approved wording.

The primary action is **Use this version**. This is the explicit acceptance for the entire proposal. Editing the proposal is allowed; user changes become user-authored evidence through the existing provenance model on acceptance. They invalidate any preview score for the previous text immediately. Keep the distinction between AI suggestions and user-authored claims.

Pending or unavailable scoring does not block acceptance of a valid proposal. Generation errors retain confirmed answers and any prior proposal. Avoid automatically regenerating after an uncertain result or refresh.

### Save and next step

Acceptance updates the draft and uses the existing Profile save controller. While saving, say **Saving your role…**. Only the acknowledged save earns **Role saved** and a success message. A failed or uncertain save leaves the accepted text recoverable with an appropriate retry/check action; it must not claim durable progress.

After success, show one restrained acknowledgement, such as **Your responsibilities are clearer and easier to follow**, only when supported by the assessment or actual changes. Show a measured score improvement if available. If unchanged, acknowledge saving/refinement without inventing improvement. Keep guarded Undo available through existing persistence; do not overwrite subsequent edits.

Offer one next primary action: improve the next eligible entry, or review skills when the user has finished the entries they wish to work on. Do not force all roles to reach a threshold or make skills inaccessible until every role is completed. Closing and reopening returns to recoverable work where supported; no new paid generation is triggered merely by opening.

For a direct rewrite, the intended path is open role → improve with existing information → use this version. For guided rewriting, each answered question adds one Continue action, followed by one acceptance. The end of a question round starts generation without an extra confirmation screen.

## Trustworthy scores and feedback

Retain the current rubric, weighting and point-level diagnostics. Label the number **Writing quality**, not an ATS pass probability or chance of being hired. Explain it briefly in plain language, with details available on demand.

Current and proposed scores must refer to their exact text and compatible policy/scope. Show `85 → 92` only when both assessments exist and are comparable; the numbers here are examples, not a promised outcome. Show a neutral assessing/unavailable state otherwise. Distinguish a partial assessment and suppress an apparently complete comparison. Do not promote an old score to a newly edited proposal or hide an unchanged/lower result.

At 90 or above, acknowledge a strong description and surface at most the next worthwhile tweak initially. Check point-level diagnostics and whole-role observations before claiming only small changes remain: a high average must not hide a materially weak sentence. A complete assessment with no useful remaining issue can say it is ready to use; do not fabricate another task.

Preview assessment is a separate bounded operation after proposal generation, using the same assessment implementation and rubric. Its identity includes target, exact candidate text, evidence version, policy and feedback locale. It must be authenticated against the owned saved Profile and validated candidate metadata. Candidate text is assessment input, not new evidence. Never save it as applied wording before confirmation.

On editing a proposal, clear its score immediately and assess only after the edit is durably staged and a suitable idle interval; coalesce edits, serialize assessment and discard stale results. Reopening, retries and late results use immutable operation identities and receipts. The builder may choose the idle interval within existing patterns. Acceptance can proceed before scoring. Reuse a preview assessment after acceptance only if text, evidence, policy, scope and locale still match; otherwise obtain the normal applied-text assessment.

## Responsiveness and real text streaming

### Performance targets

- Immediate acknowledgement of the user's action, with a stable workspace and a specific loading state. Avoid a blank modal while waiting for the provider.
- Aim for the first readable draft text within 2–3 seconds, and a complete validated proposal normally within 5–10 seconds. The 2–3 second first-text goal is an assistant-proposed target supporting the user's requirement.
- Treat 15 seconds from the user action to an actionable result as the upper performance target for an ordinary interactive operation, including application overhead and any fallback. Track the share of operations meeting it and p50/p95; do not count each provider attempt as a new 15-second allowance. Long inputs and failures remain visible in reporting rather than being dropped from the measurements.
- Score preview is separate and may arrive while the user reads. Do not hold a ready proposal behind scoring, skills discovery, or another unnecessary model call. Measure score-ready latency separately, including the gap after the proposal is ready. It remains an AI interaction with the same 5–10/15-second target.
- Bounded question generation and each per-entry skills request share the responsiveness goal. A Profile-wide skills review is a sequence of bounded operations: show available suggestions progressively rather than promising that an arbitrary number of roles can all finish within 15 seconds. Avoid generating the entire Profile on every visit.
- At 10 seconds, replace a generic spinner with an honest “Still preparing your draft…” state if needed. At 15 seconds, acknowledge the delay and retain recoverable work; do not fake completion, restart the operation, discard a valid late result, or require an extra click to keep waiting. A browser disconnect or UI deadline does not prove that paid work stopped. The existing execution deadline remains the safety bound until measured, scoped budget changes are validated.

### Existing provider paths and latency work

`apps/api/src/ai/enhancement.ts` currently sends `stream: false` and buffers a bounded JSON response. Interactive role enrichment uses Chat Completions for both OpenRouter and direct OpenAI; the Responses API branch is currently used for Word import. This work adds streaming to the interactive path, not a migration of import processing or a mandatory provider API migration.

`configured.ts` currently gives interactive requests a 25-second outer deadline, while the runner is configured with a 30-second total and a 25-second non-admission attempt allowance. A stalled primary can therefore consume the useful fallback window. Adding a typing animation alone cannot establish the requested latency.

Instrument interactive stage reservation, provider dispatch, first readable delta, full provider completion, validation, attempt settlement, receipt publication and browser readiness. Keep browser/server clocks separate, correlate with existing operation/attempt identities, and omit CV content, prompts and raw chunks from logs. Record primary success and fallback cases separately, with end-to-end success and latency measured from the original action.

Use those measurements to allocate a task-specific primary/fallback budget inside the interactive latency target, leaving time for validation and persistence. Do not grant the fallback a fresh full timeout. Distinguish waiting for first output from a productive stream and from an idle/stalled stream. Preserve existing permitted fallback causes and attempt settlement; do not switch providers solely to produce an attractive timing number. Exact timeout allocation needs measured provider behavior and quality checks; do not apply arbitrary smaller budgets, model substitutions or truncated context globally. Synthetic tests establish timing/recovery correctness; owner-run representative live measurements are necessary before claiming the target is achieved. Paid measurements remain outside the current authorization.

### Provider-to-browser transport

Enable provider SSE streaming for the new interactive generation path on both providers. Keep requests server-side with the existing credentials, endpoint policy, approved routing and attempt accounting. Normalize provider output into a small versioned application event contract, for example `started`, `draft_delta`, `validating`, `ready`, `failed`, with operation/attempt identity and ordered sequence. Exact event names are a builder choice.

For the existing Chat Completions paths, parse content deltas, terminal status and usage/accounting frames separately. Handle OpenRouter comments and its final usage frame, and OpenAI's requested usage-only frame with empty choices. A successful HTTP status or stream EOF alone is not a successful generation. Handle refusal, embedded error, truncation, missing terminal completion and missing accounting information under the existing fail/unknown settlement rules. Do not fabricate usage if a connection ends before the final accounting frame. Never relay reasoning, hidden analysis, credentials or raw provider errors to the browser.

Expose streaming through authenticated fetch using the existing session, Origin/CSRF, ownership, revision and immutable operation checks. Keep the current JSON operation/receipt behavior available for recovery and existing consumers. Declare streaming negotiation explicitly; a transport fallback to JSON must observe/replay the same operation, not cause a second inference. No new database structures or stored per-token history are needed. When the browser reconnects, recover the final receipt or poll existing status; resuming the typewriter at the exact lost token is not required. The server retains completion/settlement work within its existing execution lifetime even if the observer leaves.

Structured output remains authoritative. Incrementally extract only display-safe, properly decoded proposal text (intro and contribution text if structured) into a transient preview. Do not display raw JSON, field names, fact IDs or partially escaped strings. Bound SSE framing and total output, handle split UTF-8 characters, multiline frames and split JSON escapes. Complete JSON parsing, schema checks, provenance validation and existing semantic verification still run before a final proposal becomes usable. Preserve generation-before-verification dependencies where present.

### User-visible streaming and fallback

Show naturally arriving text in the proposal area with a restrained typing cursor. Buffer only enough to avoid jitter; do not add a slow artificial character-by-character delay once text has arrived. Respect reduced motion by showing chunks without animation, and announce stages rather than every token to screen readers. Do not force scrolling when the user is reading elsewhere.

While streaming, label the content **Drafting…** and keep **Use this version** unavailable. The transient text is not confirmed evidence, approved wording or a durable proposal. Once validated, replace it with the canonical complete proposal and enable editing/acceptance. Preserve the user's earlier proposal until a replacement is validated. Assessment results and skill rows appear when valid rather than animating raw structured output.

Keep primary/fallback output separate. If the existing policy permits fallback, first settle the failed primary attempt and reset its transient preview; do not append OpenAI text to an incomplete OpenRouter sentence. Show a plain recovery state such as **Trying again…** without making provider names part of the normal product flow. If the primary outcome is uncertain, retain recoverable status and do not launch duplicate generation on refresh. A mid-stream provider failure is not automatically a reason to loosen the existing fallback policy. Partial output never becomes an accepted proposal by accident.

Official API references checked for this amendment: [OpenRouter streaming](https://openrouter.ai/docs/api_reference/streaming), [OpenAI Chat Completions streaming and usage options](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), and [OpenAI streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses). The OpenAI fallback here remains on its existing Chat Completions endpoint; Responses event types are not interchangeable with chat chunks.

## Competences across the Profile

Provide one skills review for accepted, eligible evidence across employment, projects and volunteering. Preserve existing technical/professional categories. Suggest clear, concise labels, combine equivalent suggestions, and show source entries on demand.

Safe inference means a competence directly supported by the described work. Preparing recurring financial reports may support financial reporting; it does not establish Excel, advanced proficiency, management responsibility or expertise in accounting standards. Uncertain software, proficiency and seniority claims require new user evidence rather than a skill suggestion presented as fact.

Use existing per-entry skill generation with bounded, sequential, resumable requests, then aggregate suggestions in the client/domain layer. Do not submit the entire career as one unbounded prompt. Cache against eligible evidence identity. Do not repeat paid calls just because the review reopened. Show incremental availability honestly when some entries are still pending or unavailable; users may confirm available suggestions.

For default selection, distinguish **explicitly named** competences from **inferred from described activities**. Both need source evidence. An explicitly named skill or tool in eligible evidence starts selected; ordinary capitalization/spacing normalization does not make it inferred. A competence derived from an activity starts unselected and is marked as suggested from that experience. For example, “financial reporting” derived from “prepared recurring financial reports” is inferred and unselected, while an explicit “financial reporting” competence is selected. This is the assistant's proposed confirmation default, not a separate score of confidence.

Use one explicit **Add selected skills** confirmation. Users may select, deselect, rename or dismiss within the same review without opening successive dialogs. User edits to labels become user-authored input, not silently AI-verified evidence. Existing accepted skills are not automatically removed, renamed or reclassified. Merge exact normalized duplicates; consolidate semantic equivalents conservatively while retaining all source references. A normalization/label edit must not erase a meaningful distinction.

Use concrete counts/statuses such as **4 new skills to review** and **6 supported skills added**. Do not introduce a numeric skills quality or ATS score without a defined rubric. If evidence later changes, retain confirmed skills and flag affected support for review rather than silently deleting user content.

## Projects and volunteering

Support optional sections whose kind is exactly `projects` or `volunteering`. Use entry `details` as the introductory description and the existing contribution fields where present. Adapt labels and question prompts to the entry; do not require employer or paid-employment semantics. Support entries with only prose or only bullets. Education, certifications, languages and custom sections retain their current behavior.

Use one bounded target resolver for the three supported entry kinds, shared by eligibility, facts, text, fingerprints and scoring. Avoid a universal content/workflow framework. Current confirmed evidence, display visibility and excluded/superseded evidence rules remain applicable. Hidden or unaccepted content must not leak into generation, previews or skills.

## Technical ownership and compatibility

- Extract feature-specific orchestration from the large enrichment component as the first slice needs it. Own view state in a focused hook/controller; retain canonical document and save ownership in the existing controllers. Keep changes in `App.tsx` to wiring.
- Extend strict request/result/session validation for whole-entry proposals and candidate assessment. Read existing version-1 saved sessions without losing drafts, pending requests, answers or undo. Do not reinterpret a pending point request as a new whole-role request.
- Persist proposal, edited candidate and recovery metadata under the existing `experienceEnrichment` container. Avoid adding a new top-level private field requiring database projection changes. Keep bounded metadata and stable source identities; prune obsolete transient candidate scores without deleting accepted evidence.
- Skills review state can remain per-entry under this same container and aggregate into one view. Confirmation applies selected new skill facts together through the existing Profile save path, preserving unrelated changes and provenance.
- Keep generation and assessment separate within existing request lifetimes and provider stage accounting. Do not increase deadlines, alter models, dispatch all entries in parallel, or introduce request-triggered workers without measured evidence and separate authorization.
- Preserve operation replay, account fencing, revision conflict handling, cancellation and stale response checks. Definite failure and uncertain completion need distinct recovery. A transient request retry must not become duplicate inference.
- Implementation may choose internal type names, module boundaries, spacing and copy variants consistent with existing conventions. No dependency installation, database structure change, deployment, push, production configuration change or paid model calls are included.

## Delivery increments

1. **Whole-role journey and responsiveness foundation:** contracts, safe whole-role generation/acceptance, interactive timing, provider-to-browser streaming for OpenRouter and OpenAI fallback, focused workspace, editable proposal, original reveal and save feedback. Keep legacy point edits and nonstreaming consumers compatible. Land with focused provenance, stream parsing, fallback, stale response and persistence tests. Treat streaming as part of this first slice, not a cosmetic follow-up.
2. **Contextual discovery:** bounded role-level questions, one-step answer confirmation, answer reuse, early finish and saved recovery. Test no repeated questions, no unconfirmed evidence and no invented tools/outcomes.
3. **Score preview and progress:** exact candidate assessment and invalidation, honest comparison, 90+ feedback, saved-only completion and next-entry navigation. Test late assessment, rapid edits, partial/unavailable/lower scores and save failures.
4. **Skills consolidation:** resumable per-entry discovery, conservative merging, evidence reveal and one batch confirmation. Test mixed success, refresh, duplicate labels, user edits and unrelated Profile preservation.
5. **Projects and volunteering:** enable the shared journey, assessment and skill support for these entries; verify compatibility with previews and export. Introduce the target resolver earlier if needed to avoid rework, but expose the added experience only once supported end to end.

Each increment should be reviewable and verified before the next. Update relevant existing frontend documentation; do not repeat the completed import work or a broad architectural cleanup.

## Acceptance and validation

- One primary action per step; optional original/evidence/diagnostics do not crowd the default view. The UI never needs separate confirmation and navigation clicks for each answer.
- Keyboard access, visible focus, sensible focus movement, dialog close behavior, labelled fields and announced loading/error/success states. No forced animation; respect reduced motion. Verify narrow screens and long text. Keep English/Romanian copy in the existing localization system, including contextual project/volunteering labels.
- Read-only original and proposal are clearly distinguishable; user edits survive request errors and save retries. Unsubmitted answers never become confirmed evidence.
- Acceptance changes only the intended entry/selected skills and required metadata. Evidence remains traceable, unrelated Profile edits survive, and undo is guarded against stale content.
- Refresh, Strict Mode remounts, account switching, cancellation, stale results and lost acknowledgements cannot apply another session's result or repeat paid work automatically.
- Preview scores are tied to exact text and invalidated immediately on editing. Completion and celebratory feedback never precede acknowledged saving. Rubric/calibration fixtures retain existing expected behavior.
- Use synthetic providers and focused contract/API/component tests for the changed behaviors, relevant typechecks and required repository checks. Exercise the rendered flow with the available browser test tooling; verify exported intro/bullets and that coaching metadata is excluded. Do not claim live model quality or real latency from synthetic tests.
- Existing generated/imported Profile data and saved legacy enrichment sessions remain readable. No schema migration or hosted behavior is assumed verified without evidence.
- Test both provider streams with synthetic split frames/UTF-8/escapes, comments, usage-only chunks, terminal errors, truncation, stalls, disconnects and delayed settlement. Verify no early acceptance, no mixed-provider text, no duplicate inference on reconnect and no streamed reasoning/raw JSON. Cover a successful primary and each existing eligible fallback cause; preserve accounting and deadline behavior.
- Verify real chunk delivery through the local API/browser path, including any buffering middleware, and describe any unverified hosting/proxy behavior. Record first visible text and actionable proposal timing separately. Publish performance results only with the environment, input sizes, route/fallback counts, failures and sample size; synthetic timing is not a provider latency claim. No fake typewriter delay is allowed to push a ready result past the target.

## Deferred

Universal ATS guarantees, new skill scoring, rubric reweighting, import redesign, unrelated editor refactors, provider/model tuning and speculative infrastructure/performance work are outside this design.

## Design review

A fresh builder review identified one material ambiguity: whether inferred-but-supported skills start selected. The explicit/inferred distinction and concrete example above resolve it as an assistant-proposed interaction default. No additional product decisions were requested by the review. The user approved implementation after adding the responsiveness requirements.

The user's subsequent responsiveness amendment adds the 5–10/15-second targets, real streaming on both provider routes, separate preview scoring and measured fallback budgeting. A follow-up builder check found no important unanswered planning questions in the amendment. Streaming and the guided flow are now implemented locally. The latency targets still require authorized live benchmarks.
