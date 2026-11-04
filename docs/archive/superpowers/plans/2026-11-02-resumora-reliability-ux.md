# Resumora reliability and UX implementation plan

> Historical record. This is not the current specification or an active task list. Start with [the current handoff](../../../HANDOFF.md).

> Execute inline with the Superpowers executing-plans and verification workflows. The user's request explicitly authorizes proceeding through validated phases without approval gates.

**Goal:** Recoverable AI operations, CV-language content, faster enrichment and clearer editing without losing existing data.
**Architecture:** Extend the existing React hooks, durable operation receipts and fact-based AI services. Keep provider/model selection, hosted schema and autosave architecture. No production deployment.
**Stack:** Node 22.23.4, npm workspaces, React/Vite, TypeScript, Wrangler, hosted Supabase and AI providers.
**Spec:** User's attached “Resumora — UX, Performance & Reliability Improvements” request, 2 November 2026.

## Baseline and design decisions

- This linked worktree already contains extensive unfinished work. Preserve it in place. Local recovery commits under `refs/resumora-ux/2026-11-02/` use a temporary Git index; the user's branch, index and other worktrees remain untouched. `baseline` captures the initial state. Each later checkpoint has a parent and a small phase diff. Reverse an individual phase with `git diff REF^ REF --binary | git apply -R` after checking for later edits; never reset the workspace.
- `dev:doctor`: pinned Node, configured local AI, single running import processor, correct managed-service owner, session endpoint reachable at 127.0.0.1:15173. Provider generation is not established by this check.
- Reliability: existing transport deadlines are 45s generation / 10s recovery; recovery polls are bounded. The profile scorer retains operation IDs and prior scores, but its UI retry exists only in the legacy detail panel. Guided modal has no score controls; successful scores cannot be explicitly recalculated because the queue rejects a current score even with force. Unknown terminal receipts remain pending. Guard asynchronous failures and retain existing content.
- Language: `LanguageContext` is sent as feedbackLocale by App, scoring and guided/legacy enrichment. Backend explicitly uses feedbackLocale for questions. `documentLocale ?? language` already drives proposed CV wording. Make the document's content language the shared source for new AI operations; retain legacy receipts/results.
- Preparation: existing hook prepares at most three missing point questions below 80, and delays all preparation until all roles finish scoring. Main “add details” action has no point, so ignores those caches and incurs another request. Reuse diagnostic questions for whole-role guidance; prepare a whole-role set only when no suitable diagnostics exist. Do not retry paid work automatically or overwrite answers.
- Performance: serial profile scoring, required autosaves, 1.5s edit settling and global preparation barrier add waiting independently of provider speed. Prefer eliminating redundant question generation and unnecessary barriers over changing models/prompts/quality. Measure deterministic transport delay and call counts; keep hosted latency claims separate.
- Voice: MediaRecorder sends a single completed file to hosted transcription after stop. Current encoding chunks are not independent files; sending them separately is unsafe. Evaluate browser recognition for progressive preview with explicit fallback and privacy disclosure; preserve editable confirmed text, cancellation and limits.
- Profile: skill block is after education and technical precedes professional. `__skills` destination is incorrectly rejected as a missing role by AppShell. Empty context field has no action, although existing `rewrite(purpose: summary)` service supports short factual role summaries (currently capped at 240 characters).

## Constraints and review focus

- No database resets, migrations, provider/model changes or production deployment. No credential output.
- Preserve source facts, answers, previous successful AI results and unsaved edits across failures, language switches and late responses.
- Read-only recovery reuses operation IDs; explicit fresh retries get distinct IDs only when safe. Never automatic paid retry loops.
- Tests must execute behavior. Use existing Vitest and Node tests, plus browser harnesses with synthetic data and mocked services. Browser plugin absent; regular Playwright is available from the existing local installation.
- Five review cases: late result after edits/removal; refresh of a saved pending receipt; UI locale switch with existing answers; disabled/offline AI; voice cancellation or transcription completing after text edits.

## Phases (sequential checkpoints)

- [x] **1 Investigation/baseline:** run typecheck, web and API suites; capture actual browser behavior; record root causes and baseline latency where feasible. Checkpoint this plan.
- [x] **2 Reliability:** tests in `profile-experience-scores.test.tsx` and guided UI for failed/unknown/current scores. Add visible retry/recheck control to guided experience. Fix explicit recalculation identity and recovery without discarding old results. Validate success, failure, refresh and stale-result scenarios, then checkpoint.
- [x] **3 Language:** introduce shared `contentLanguage(draft)` contract resolver using `documentLocale` then legacy `language`; route scoring, questions, feedback, skills and generated wording through it. Test EN content/RO UI, RO content/EN UI, UI switches and legacy data. Validate affected client/server suites and checkpoint.
- [x] **4 Preparation:** fix role-level question reuse/preparation below 80. Preserve rounds/answers, bound costs, expose preparation/recovery. Test scores 79/80, caches, interrupted/failed preparation and foreground reuse, then checkpoint.
- [x] **5 Performance:** remove demonstrated queue barriers or redundant calls in a small change; use fixed-latency fixtures to measure before/after request counts and time. Retain model, grounding and validation. Checkpoint only after reliability tests pass.
- [x] **6 Enrichment UI:** clearer guided-question action and supporting copy; contextual labelled AI icon next to original text. Verify accessible controls, proposal edit/apply, desktop/mobile. Checkpoint.
- [x] **7 Voice:** place control at answer input; animated recording indicator and clear states; progressive transcription when supported, bounded fallback otherwise. Tests for cancellation, failure, text preservation and overflow; browser visual checks. Checkpoint.
- [x] **8A Ordering:** personal, professional skills, technical skills, summary, experience, remaining sections. Preserve export order and field identities. Verify edit/save and checkpoint.
- [x] **8B Options:** separate normal/destructive actions, consistent alignment and mobile wrapping. Verify addition/removal and checkpoint.
- [x] **8C Navigation:** admit `__skills` in valid profile destinations, verify actual skills modal and return navigation using AppShell journey test. Checkpoint.
- [x] **8D Short descriptions:** expose existing grounded summary service for empty context with loading/error/retry; 3–5 sentences maximum, editable before bullets. Preserve edits made during generation; integrate autosave and source validation. Test truthful-source contract, failure, stale response, edit/save/revisit. Checkpoint.
- [x] **9 Integration:** focused journey tests then full web/API/type/build and managed doctor. Review only changes since baseline with one fresh reviewer. Record performance, tested vs unverified behavior, limitations, recovery refs and deployment status.

## Execution ledger

Initial baseline: web 720/720, API 424/424 and both typechecks passing.

Phase 1: web 720/720, API 424/424, typecheck pass. Playwright baseline desktop 1440×1000/mobile 390×844: zero requests for diagnostic cache, one prepared request reused on click, draft answer retained, no page errors/overflow.
Phase 2: failing regressions reproduced missing retry and rejected recalculation. Existing scorer tests 20/20 plus direct UI retry pass; new recalculation/terminal-unavailable tests pass; API score suite 10/10; typecheck pass. Added optional backward-compatible assessment attempt metadata. Server admits explicit next attempts after ready/failed/terminal unknown, never processing. Prior score and role facts remain intact.
Ruling: use local Git recovery refs rather than stage/commit pre-existing unfinished files on the user branch. Hosted data/schema unchanged.

Phase 3: discovered import default also selected Romanian regardless of source. Extraction now returns optional detectedLanguage (old payloads still accepted); new drafts persist it. Existing profiles retain their language and have an explicit content-language selector. Client content-language regression failed before, passes after; affected web suites 57 tests pass across runs, API full 422 pass/3 old prompt-version expectations updated and affected 24-test rerun passes; typecheck pass. Hosted language-detection quality remains unmeasured.

Phase 4: 39/39 focused tests pass (including 3 reproduced failures). Main guided action uses the existing diagnostic/prepared point workflow instead of creating a redundant whole-role request. Preparation is gated at overall score <80; point selection skips completed confirmed rounds. Existing pending/unknown/failed recovery, answer retention, three-request bound and saved-receipt validation remain covered. No schema expansion needed for role-level questions.

Phase 5: removed only the cross-role scoring barrier. Regression showed no preparation within 900ms when another role lacked a score; now preparation begins after the existing 400ms settle interval, independent of that role. 35/35 preparation/scoring tests pass. Browser A/B with 750ms simulated service: prior main-action selection bypassed = 837ms/one request, cache selection = 46ms/zero requests. A/B changes only the served test module, not workspace source. No hosted latency, model quality, cost-dollar or percentile claims. Model/prompts/grounding for scoring unchanged; bounded serial scoring retained.

Phase 6: clearer guided-action label and supporting copy; accessible AI icon beside current description, retained proposal review/edit/apply. 23/23 tests pass. Playwright desktop/mobile confirms cached questions, retained answers, preparation reuse and explained disabled AI; no console/page errors or horizontal overflow. Screenshot inspection caught Button className overriding base classes; corrected icon styling.

Phase 7: optional native browser recognition defaults to live when available, explicitly disclosed, with an explicit recorded-upload fallback. Interim preview, animated recording timer, bounded start/stop, final-segment deduplication, unmount cancellation, editable retained partial/overflow speech and atomic appends preserve existing answers. 38/38 voice/guided tests pass; typecheck passes. Playwright simulated speech confirms live preview next to input and append without replacing typed text. Actual microphone/provider speech accuracy is unverified. Browser capability/service/network vary (MDN SpeechRecognition / interimResults); recorded path transcribes only after stop.

Phase 8A: moved professional then technical skill groups below identity and before summary/experience. Export presentation order and data untouched. 7/7 profile interaction tests pass, including DOM ordering and export-order preservation.

Phase 8B: aligned, spaced edit/delete actions; delete uses the existing danger variant and trash icon. 13/13 profile/removal tests pass. Playwright desktop/mobile verifies order, contribution add/edit, separated aligned buttons, deletion, no overflow or page errors. Screenshots inspected.

Phase 8C: the route guard rejected reserved __skills as a missing role; the disabled-AI branch also rendered the wrong workspace. Both fixed. 14/14 full workspace journey tests pass, including clicking skills, visible dialog, direct revisit, and unavailable AI retaining the skills view.

Phase 8D: reused existing summary service and persisted proposal review; added inline generation for empty context. Acceptance edits only context, before unchanged bullets, with normal autosave. Expanded summary to ≤5 sentences/1200 chars; source IDs, unsupported-number validation and no-invention instructions retained; fewer sentences allowed for sparse evidence. Bound legacy rewrite/recovery requests to 45s/10s. Summary merge checks actual career context and preserves unrelated current edits. Web 45/45 then 10/10 profile checks and API 19/19 pass; typecheck pass. Playwright generate → edit proposal → accept → reload verifies context and bullets, desktop/mobile.


Phase 9 stabilization: the independent review found two data-retention edge cases. Four failing regressions reproduced overwritten speech overflow during asynchronous recognition shutdown and inaccessible unfinished whole-role question rounds. Fixed by retaining subsequent speech in order and resuming compatible unfinished rounds before new point guidance; all 21 voice/cache tests pass. Updated two older assertions for the intentional canonical `ro-RO` locale and 1,200-character summary limit. A parallel focused run hit one existing 5-second keyboard-test timeout; that unchanged test passed in the final full run. An intermediate suite process ended with SIGTERM before a result; the rerun with visible progress completed successfully.

The recorded build used explicit public APP_ORIGIN/API_ORIGIN values. No private configuration was sourced into frontend build variables. The API build is `wrangler deploy --dry-run`, not a deployment. The standalone smoke command would launch another server on the managed API port, so it was not used; existing-origin browser checks and the read-only doctor verify local serving instead.

Verification limits: automated and browser journeys use synthetic data and provider/recognition doubles. Real authenticated upload through hosted extraction, provider latency/quality, language detection accuracy and physical microphone/browser speech-service behavior remain unverified. Local service status cannot establish those outcomes. Follow-up evaluation should measure provider first-text/ready p50/p95 and human-reviewed grounding/language quality on representative CVs, then check actual dictation across supported browsers. Existing CVs retain stored language; users can correct older misclassified drafts with the content-language selector.


Final checkpoint: **745/745 web tests across 72 files**, **426/426 API tests**, both typechecks, frontend build and API dry-run build pass. Development configuration/service tests **21/21**, frontend secret-boundary test **1/1**, and live read-only doctor pass. Final Playwright desktop 1440×1000/mobile 390×844 checks confirm diagnostic/cache reuse, preserved answers, progressive synthetic speech, useful disabled-AI errors, no page errors or horizontal overflow; separate phase checks cover profile ordering/options and summary review/edit/accept/revisit. Baseline-to-final whitespace check is clean. No production deployment, migration, data reset, provider/model change or new service instance was performed. Managed environment remains active with one import processor and reachable session endpoint; hosted inference was not exercised.

Recovery: each phase is retained under `refs/resumora-ux/2026-11-02/` (`baseline`, `phase1`–`phase7`, `phase8a`–`phase8d`, `phase9`, `latest`). The current branch and real index are unchanged; existing unfinished work is included in the baseline and preserved. Compare `baseline` to `phase9` for only this task's changes. Checkpoints are local recovery commits, not a published PR.


## Follow-up: direct skill keywords

The user's screenshot feedback supersedes the selection dialog: one Profile click now inserts supported skill keywords inline, through existing autosave. New labels are 1–4 words/48 characters, use CV language, cite evidence and deduplicate. Existing saved skills remain editable and are not rewritten. Current short cached results are reused; verbose legacy suggestions are regenerated. Prompt version `experience-skills/2` is in `apps/api/src/intelligence/experience-operations.ts`. No hosted model/provider or service configuration changed.

A focused review caught exclusion loss during regeneration and indefinite waiting behind an orphaned non-skills operation. Regression tests reproduce both. Exclusions now follow normalized labels across suggestion IDs and roles; deferred reviews have actionable navigation and do not hold unrelated retries disabled. Choice metadata supports bounded history (300 records; current skill results still max 30), with an autosave roundtrip regression.

Validation: API suite 427/427; after stabilization, 58/58 focused frontend tests across skills, workspace journeys and retained experience editing, 20/20 API contract tests, both typechecks and build pass. The full frontend run overlapped review fixes: 753/758 passed; its five skills failures (removed keyword reintroduced by another role, retained-exclusion autosave, deferred-entry continuation, rejected-keyword regeneration, persisted-review navigation) all pass in the final focused rerun. The pre-existing navigation autosave timing assertion also failed under parallel suite load and passed on the isolated final run. Do not describe the intermediate full run as entirely green.

Playwright on the existing 127.0.0.1:15173 origin (Browser plugin unavailable) checked 1440×1000 and 390×844: one click adds four keywords, no modal/checkbox review, EN content with RO controls, repeated clicks/reload reuse the cache, no duplicate additions, no page/console errors or horizontal overflow. The isolated QA browser was granted local-network permission for Vite HMR. Provider replies and persistence were synthetic; real hosted output quality was not evaluated. No production deployment. Recovery refs: `skills-before`, `skills-review` and `skills-after` under `refs/resumora-ux/2026-11-02/`.
