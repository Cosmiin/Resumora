# Guided Profile Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved focused whole-entry improvement experience, live provider streaming, honest score previews and consolidated skills.

**Architecture:** Extend the existing experience contract and provider runner; retain document/save ownership and immutable operation receipts. A focused feature hook owns request orchestration, with separate whole-entry and skills views. Generation, assessment and acceptance remain distinct.

**Tech Stack:** TypeScript, React 19, native fetch/SSE, Cloudflare Workers, existing Postgres gateways; Node 22.23.4 and existing Vitest/node:test.

**Spec:** `docs/superpowers/specs/2026-11-02-guided-profile-enrichment-design.md`

## Global Constraints

- Preserve all pre-existing dirty files; initial copy at `/tmp/resumora-guided-enrichment/before`. Leave reviewable local changes; no blanket staging/commits.
- No pushes, deployment, database structures, production configuration changes, new dependencies or paid calls.
- Existing accepted facts/answers and approvedWording remain authoritative; candidate metadata stays under experienceEnrichment.
- Target complete interactions in 5–10 seconds and within 15 seconds, measured separately from first visible output; no unverified latency claim.
- One primary action per step, explicit acceptance, saved-only success, English/Romanian copy and accessible responsive UI.
- Preserve existing rubric and legacy point sessions; add projects/volunteering, not other optional section types.

## Review Focus

- Hidden/superseded evidence and same-looking entries must not contaminate another proposal (Task 1).
- Unicode split across chunks, usage-only frames and failures after streamed text must never become false success (Task 2).
- Refresh/account switching and lost acknowledgements must not repeat paid work or apply stale output (Tasks 3/4).
- Editing a candidate during assessment or an unrelated autosave must not restore an obsolete score (Task 5).
- Mixed successful/failed skills requests and normalization must preserve already accepted skills and all source references (Task 6).

## Task 1: Whole-entry and candidate contracts

**Files:** `packages/contracts/src/intelligence/experience.ts`, new `experience-target.ts`, `apps/api/src/intelligence/experience-operations.ts`, `apps/web/src/base/experience.ts`; tests `apps/api/tests/guided-experience.test.mjs`.

**Interfaces:** export `experienceTarget(draft, id)` and `experienceTargets(draft)` for roles/projects/volunteering. Add request intents `role` and `preview`; preview includes exact `candidate` text. Store role proposal, candidate text and matching preview assessment under bounded version-1 session metadata. `applyExperienceRole(draft,targetId,text,origin)` accepts full wording with guarded undo.

- [x] Add failing tests for whole-role multiline output, optional-entry eligibility, evidence bounds, hidden evidence, stale candidate and legacy decode.
- [x] Run `node --experimental-strip-types --test apps/api/tests/guided-experience.test.mjs`; confirm new behavior fails.
- [x] Implement target resolution, strict additive validation, full-evidence bounded whole-role prompt and separate candidate assessment using existing rubric. Refuse overly large whole-role context rather than silently omit responsibilities.
- [x] Run guided/experience API tests and typechecks; verify valid old sessions remain readable.

## Task 2: Provider streaming

**Files:** new `apps/api/src/ai/chat-stream.ts`, shared `packages/contracts/src/intelligence/stream.ts`, `apps/api/src/ai/enhancement.ts`, `apps/api/src/intelligence/operations.ts`, `configured.ts`; tests `apps/api/tests/chat-stream.test.mjs` and enhancement tests.

**Interfaces:** `StructuredOperation.onDraft?: (text:string)=>void` is cumulative decoded proposal text; provider runner emits empty text at each fresh attempt. `readChatStream(response,limit,signal,onText)` returns assembled chat completion compatible with existing validation/ledger. Shared SSE parser handles framing; extract only the top-level JSON text field.

- [x] Write/run failing tests for incremental Unicode/escaped JSON, OpenRouter comments/final usage, OpenAI empty-choice usage, refusal/truncation/missing terminator and cancellation.
- [x] Implement bounded streaming reader and opt-in stream request only for interactive whole-role generation; retain nonstreaming import/point paths. Invoke draft callback without allowing observer errors to alter settlement.
- [x] Verify both routes through synthetic runner transports, including fallback reset and no success before complete validation.

## Task 3: Authenticated application stream

**Files:** `apps/api/src/intelligence/routes.ts`, `apps/web/src/base/intelligence.ts`, shared stream contract; tests `apps/api/tests/experience-stream.test.mjs`, `apps/web/src/base/intelligence-stream.test.ts`.

**Interfaces:** optional third argument `onDraft?: (text:string)=>void` on `IntelligenceClient.experience`; JSON fallback remains valid. Negotiate SSE via Accept, emit cumulative draft events and canonical final result/error. Existing receipt recovery remains GET-only.

- [x] Write/run failing stream integration tests for auth-owned operation identity, bounded framing, partial failure and final result validation.
- [x] Wrap existing route operation lifecycle in a streaming response without bypassing validation, revision checks or persistence. Continue within existing server lifetime on browser disconnect.
- [x] Extend browser client with stream consumption and exact result validation; preserve uncertain identities and avoid POST on recovery.
- [x] Run targeted API/client/session tests.

## Task 4: Focused whole-entry workspace

**Files:** new `apps/web/src/components/useGuidedExperience.ts`, `GuidedExperience.tsx`, `apps/web/src/App.tsx`, relevant styles and `ProfileDocument.tsx`; tests `guided-experience.test.tsx`.

**Interfaces:** reuse existing ExperienceEnrichment props (draft/change/ready/saveFailed/retrySave/request/close); same save-first dispatch invariant. Persist guided editor/questions/pending/proposal; remount only reads existing receipts. Hook exposes actions and state to view.

- [x] Write/run failing tests for direct whole-role rewrite, one-question Continue/Skip flow, one acceptance, streamed disabled acceptance, save failure, answer reuse and recovery.
- [x] Implement staging+save before explicit requests, contextual whole-role question rounds max3, zero-question direct generation, original reveal, editable proposal, draft streaming and saved-only celebration/undo. Keep existing point component accessible for legacy in-progress sessions.
- [x] Wire roles/projects/volunteering into the new workspace; add contextual labels and bounded layout, keyboard/accessibility states, next-entry navigation.
- [x] Run focused component and Profile persistence tests.

## Task 5: Exact candidate scoring

**Files:** guided hook/view, `experience.ts`, score coordinator, API experience operations; tests guided API/component and existing score tests.

**Interfaces:** candidate preview identity binds exact saved candidate plus eligible evidence; preview result includes candidate and assessment. Applied score remains distinct. Candidate edits clear preview immediately.

- [x] Write/run failing tests for stale candidate results, equal/lower/partial scores, unchanged rubric, 90+ with weak point, acceptance before scoring.
- [x] Automatically stage/request preview after valid proposal and after coalesced editing; recover read-only, serialize and discard stale assessments. Compare only compatible complete assessments; acknowledge genuine saved progress.
- [x] Extend applied-score target iteration/merging to eligible optional entries without triggering hidden entries.
- [x] Run score/guided suites.

## Task 6: Consolidated skills review

**Files:** new `apps/web/src/components/ProfileSkillsReview.tsx`, `apps/web/src/base/profile-skills.ts`, ProfileDocument/App wiring and tests `profile-skills.test.tsx`.

**Interfaces:** aggregate saved per-entry skill suggestions by normalized label while retaining citations; explicit labels selected, activity-inferred labels unselected. Apply selected skill facts in one document change/save.

- [x] Write/run failing tests for cross-entry duplicate evidence, explicit/inferred defaults, user-edited labels, partial failure, stale evidence and unchanged existing skills.
- [x] Implement resumable sequential per-entry discovery via existing skills intent, per-entry saved state and receipts, one editable batch review and one confirmation. Preserve prior accepted skills and metadata.
- [x] Add Profile-level access and next-step access without requiring every role to be completed; validate applied text/export compatibility.
- [x] Run skills/optional-entry and focused Profile tests.

## Task 7: Verification and review

**Files:** existing frontend docs, new design/plan status and scratch progress ledger.

- [x] Run relevant API tests, complete frontend suite once, workspace typechecks, smoke, secret checks and local build (command-local origins if needed). Record exact failures/limitations, not inferred success.
- [x] Exercise rendered direct/guided/skills journeys, narrow-screen layout and streaming via available browser tooling; no paid provider calls.
- [x] Request one fresh independent code review of this task's diff against the saved starting snapshot; address material findings with regression tests.
- [x] Update docs and report implementation, verification, preserved guarantees and unmeasured live latency without deploying or pushing.

## Final verification — 2 November 2026

Implemented locally; existing branch/worktree and unrelated changes preserved. Full frontend suite: 635/635 across 60 files. Post-layout focused checks: 18/18. Focused API suite: 117/117. Workspace typechecks, smoke, development-secret boundary, diff whitespace checks and web/Worker dry-run builds passed. Existing large web-bundle warning remains.

A fresh independent review identified four material issues, all reproduced and fixed with regression tests: missing-receipt resume, cumulative streaming byte overflow, selection override from later skill discoveries, and stale-proposal regeneration. Additional checks cover exact candidate scoring without application, long-source chunk citations, changed skill support and provenance after label merging.

Browser QA used the existing Playwright installation/Chromium 1248 because the Browser plugin was absent. Synthetic CV/provider fixture at 127.0.0.1:5176: direct rewrite→live text→review→saved→skills confirmation and contextual question→Continue→proposal passed at 1280×900 and 390×844. Projects workspace opened. No page errors or horizontal overflow; header and acceptance action stay visible. Temporary harness files were removed; screenshots and reproducible fixture remain in `/tmp/resumora-guided-enrichment`.

No paid or hosted tests were run. The 5–10/15-second targets are not verified live guarantees; existing 25-second safety deadline is retained. Whole-role generation above 24 evidence chunks/8,000 characters fails explicitly instead of omitting evidence. No deploy/push/schema change or dependency install occurred. Detailed execution evidence is in the task's ignored progress ledger and `/tmp/resumora-guided-enrichment`.
