# Skills inventory implementation plan

> **For agentic workers:** Use superpowers:executing-plans for focused inline implementation. The user explicitly authorized independent design, implementation, and proportionate validation.

**Goal:** Build a selective, reusable master-CV inventory, with up to 30 technical and 30 professional skills, traceable high-confidence inference, and concise standard terminology.

**Architecture:** Retain per-experience requests, recovery receipts and existing skill Facts. Consolidate and rank supported suggestions across a completed discovery batch before insertion. Add optional evidence metadata without changing persisted schema versions or deleting accepted content.

**Tech Stack:** Existing TypeScript npm workspaces, React, Node test runner, Vitest.

**Spec:** User's “Resumora — Audit and Improve Skills Extraction” attachment and this audit/design record. Parallel language design: `../specs/2026-11-03-automatic-cv-language-design.md`.

## Audit and design

Current input consists of visible accepted role/project/volunteering text and confirmed, non-superseded answers, split into 2,000-character facts and 24-fact/8,000-character chunks. Titles alone do not become evidence. Each chunk currently permits eight results, and each experience permits 30 combined results. The profile has no category cap; immediate per-role insertion lets processing order decide which skills appear first. Deduplication is principally case/whitespace matching. Prompts allow only explicitly named technical methods, omit durable inference classification, and localize skill labels. The 3,000 output-token budget is shared by small and rich inputs.

Existing skills are supplied as deduplication context. Accepted additions become ordinary Facts and preserve source lineage. Detailed quotes live only in replaceable experience receipts; self-contained job CVs intentionally drop those receipts. Tailoring selects existing skill IDs and does not create new skills.

Chosen approach: improve the existing extraction and consolidation path. A prompt-only change cannot enforce inventory limits or preserve inference evidence. A new whole-profile model pipeline would introduce unnecessary operations and recovery architecture. Keep bounded calls, expand their capacity, and rank globally in the existing client consolidation step.

Classification: named tools/platforms/languages plus demonstrated technical implementation methods are technical. Transferable analytical, interpersonal, management and business-process capabilities are professional. Generic Requirements Analysis, Business Analysis, Process Improvement and Workflow Design are professional; implementation-specific API Integration, Data Validation, Data Modelling, Software Testing and Workflow Automation are technical. Use a small curated alias/classification table for common cases; unknown competencies follow the contextual model classification. Never infer an unmentioned product or language.

Inference metadata distinguishes explicit evidence from strongly demonstrated inference, records a short rationale and core/supporting relevance. Evidence remains an exact source quote. A model's semantic judgment is not a mathematical confidence guarantee. Standardized labels normally use 1–2 words; established official names may be longer. No sentence fragments or blanket abbreviation expansion.

## Global constraints

- Preserve one-click inline insertion and existing pending-operation recovery, revision and stale-input fences.
- Add no dependencies, migrations, provider/model changes, or live paid test calls.
- Preserve existing manual/imported skills and identities; a legacy list already above 30 is not silently truncated. Automated additions respect remaining capacity.
- Canonical international skill labels (typically English) are the explicit exception requested by this brief; generated rationale follows the resolved document locale, and quotations stay original. Do not implement a second language detector or override parallel language metadata.
- Preserve source evidence on the accepted Fact so save/reload and job copies retain traceability.
- Keep verification focused on skills, persistence, request transport and tailoring compatibility. No unrelated full-suite sweep.
- Work in the existing non-main feature checkout; preserve all unrelated unfinished work. No broad staging or commits of pre-existing work.

## Review focus

1. Late roles with stronger skills must compete before the category capacity is consumed.
2. Existing translated synonyms and user exclusions must prevent reintroduction.
3. Cache refresh and partial failure must preserve accepted content and recoverable operation IDs.
4. Inference metadata must survive serialization and self-contained tailored copies.
5. Shared language files may change concurrently: use narrow edits, re-read before editing, and validate the final integrated files.

## Tasks

- [x] 1. Add failing API/contract tests for representative multilingual, technical and professional output; conservative inference metadata; invalid evidence; more than eight skills; per-category limits; official longer names; synonym separation (SQL versus Data Validation, Java versus JavaScript, C versus C++).
- [x] 2. Implement shared keyword policy and isolated skills prompt/schema/parser. Return at most 30 per category, aggregate chunks deterministically, pass canonical existing labels, increase bounded output budget to 12,000 and skills-specific provider timeouts to 60 seconds per attempt / 90 seconds total. Keep all other operations unchanged.
- [x] 3. Add failing profile tests for alias deduplication, 30-per-category selection across roles, preservation of manual content, durable inferred evidence and removed keywords. Implement optional Fact evidence metadata and compatibility decoding, profile ranking/caps, and legacy application-path caps.
- [x] 4. Add failing UI tests for later-role ranking and stale policy-cache refresh. Complete the batch before automatic insertion, preserve partial successes on failure, and keep the one-click flow. Apply React best practices for derived state and effect guards.
- [x] 5. Run focused API/frontend suites and workspace typechecks. Inspect a mock-transport request from the actual provider builder. Record expected fictional examples, actual results and remaining limitations in `docs/skills-extraction-audit.md`. Perform one focused final review.

## Progress / decisions

- Read the parallel “Infer CV language across prompts” chat and its design; it is separate active work in this checkout. Skills terminology exception is explicit above.
- Ruling: preserve legacy lists above 30 rather than silently deleting user content; new automated additions stop at 30 per category.
- Ruling: validation uses synthetic fixtures/mocked providers; report semantic model quality as unmeasured until live evaluation is authorized/performed.

- Final validation: 99 focused API tests and 69 focused frontend tests passed; git diff --check passed. Whole-workspace typecheck still reports 14 locale-propagation sites from the parallel language expansion (listed in docs/skills-extraction-audit.md).
- One final read-only review identified deferred-batch selection, post-completion refill, and failed legacy-refresh insertion defects. All three were reproduced by failing UI tests and fixed; no second review was run.
- Ruling: automatic insertion requires the current extraction policy; historical receipts remain readable and accepted user content remains intact.
- No new worktree was needed: the existing linked feature checkout was preserved. No live provider calls, deployments, schema migrations, broad staging or commits were performed for this task.
