# Plan: the AI proposes what the company does (2026-11-17)

Design: `company-guess-design-2026-11-17.md` in the workspace folder (approved by the owner in chat, 2026-11-17).
Branch `feat/company-guess`, worktree `resumora-company`, base `main` (`2e3f988`).

## Task 1: The model gets the company and may propose what it does
scope:
  files: [packages/shared/src/enrich.ts, packages/shared/src/enrich.test.ts, apps/api/src/enrich/prompts.ts, apps/api/src/enrich/prompts.test.ts]
  new_files: []
  deps: []
  size: 60

Goal: the score prompt's user message carries the role's company and location; the model may return a `proposal`
on the topic-company question; the app keeps it only there.

- `ModelScoreSchema.roleQuestions[]` gets `proposal: string (max 200) | null`, default null.
- `RoleQuestionSchema` gets optional `proposal` (max 200). `buildRoleResult` keeps it, trimmed, only on topic
  company and only when non-empty; every other question never has it. The company question still has no options.
- `scoreUserMessage` adds `Company (context only, not graded): "<company>"` and `Location (context only, not graded): "<location>"`
  lines when they are non-empty.
- The ROLE QUESTIONS rule for topic company: propose only for a company you recognise and are sure of; generic,
  shared or unsure names get null; knowing the company never marks company as shown in coverage; proposal null on
  every other question.
- `SCORE_POLICY` becomes `score/8`.

Acceptance tests:
- a company question with a proposal keeps it (trimmed); a purpose question with a proposal drops it; a blank one is dropped;
- stored results without `proposal` still parse;
- the user message names the company and location when given, and has no such lines when empty;
- the system prompt mentions `proposal`; policy is `score/8`.

## Task 2: The question screen offers the proposal to confirm or edit
scope:
  files: [apps/web/src/cv/enrich/RoleRun.tsx, apps/web/src/cv/enrich/role-run.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/focus.css]
  new_files: []
  deps: [1]
  size: 70

Goal: on a role question with a proposal, the run shows the sentence with "Yes, that's right" and "Edit".

- Yes: answers with the sentence (via `pick`), same path as any answer.
- Edit: shows the answer box with the sentence in it, and the usual submit button.
- Skip and Back as on every question. Without a proposal the screen is unchanged.

Acceptance tests:
- the proposal and both buttons show; Yes submits the sentence;
- Edit puts the sentence in the answer box and the edited text is what is submitted;
- a question without a proposal shows no such block.
