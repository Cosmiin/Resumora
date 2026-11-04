# Role scope and context implementation plan

> Historical record. This is not the current specification or an active task list. Start with [the current handoff](../../../HANDOFF.md).

> Execute inline using superpowers:executing-plans, with test-first validation and final review.

**Goal:** Implement the user's selected proposal 2: a short statement of the role's scope and context.

**Design:** New summary generation describes supported business area, teams, stakeholders, customers, geographical coverage or ownership. Select the most distinctive details; avoid rephrasing contribution bullets, achievements, generic praise or inferred seniority. Use one or two sentences in a single paragraph, normally 25–45 words, capped at 400 characters. With sparse evidence, write a shorter neutral statement and flag missing context in warnings. Never invent context. Full-role rewrites remain unchanged.

**Compatibility:** Keep the existing summary purpose and review schema. Preserve the existing persisted-summary validator so older pending and accepted reviews remain readable and editable. Apply a stricter validator to new generation, both in the provider callback and on its final result. Keep explicit review and original contributions.

**Architecture:** Add a generation-only scope-summary validator beside the legacy validator. Use it for summary operations with a new prompt version. Update explanatory Romanian/English copy in existing summary entry points and document the behavior.

**Tech stack:** Existing Node 22.23.4 npm workspaces, TypeScript, Node test runner and Vitest. Use the existing linked worktree and dependencies. Preserve all pre-existing unfinished work; no commit, push, database change or service restart is required.

## Task: Generate concise role context

Files: `packages/contracts/src/intelligence/model.ts`, `apps/api/src/intelligence/operations.ts`, `apps/api/tests/role-summary.test.mjs`, `apps/web/src/components/RoleRewrite.tsx`, `docs/frontend/profile-document.md`.

- [x] Add failing behavior tests for rejection of newly generated long or three-sentence summaries, acceptance at the boundary, and compatibility with older saved reviews. Exercise both the provider validation callback and final operation validation.
- [x] Implement the stricter generation-only validator and scope/context prompt; retain evidence, number, paragraph and review safeguards.
- [x] Update summary explanatory copy across inline, modal, compact and full views, and document behavior.
- [x] Run targeted summary and review tests, workspace typechecks and full API/frontend suites. Review only this task's delta against its pre-edit snapshot.

Validation: targeted summary tests 8/8; full API suite 559/559; full frontend suite 878/878 across 85 files; workspace typechecks and whitespace checks passed. Independent review of the task delta found no actionable issues. No live AI request was made, so generated wording has not been sampled against a hosted model.

## Review focus

- Old pending/accepted summaries must survive decoding and review.
- Scope must come from selected-role evidence and confirmed answers.
- Missing context must not become invented scale, leadership or accomplishments.
- Provider retries and final results must use the same generation limits.
- Contributions, explicit acceptance and full-role rewrites must retain their behavior.
