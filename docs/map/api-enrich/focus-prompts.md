---
id: api-enrich/focus-prompts
area: api-enrich
files: ["apps/api/src/enrich/focus-prompts.ts"]
depends_on: ["api-enrich/score-prompts","api-enrich/score","shared/cv","shared/enrichment-checks","shared/enrichment-focus"]
contract: true
checked_hash: 86148ff8
cited: [73d564, 99350a, 2bb4b4, 02c364, 7177db, e5d6cf, 4c8466, 698827, aeb85e, 780ee6, b19d85, 384830, 7a6c2e, ab557c, a523c9, 8b1cc7, fb8bb5, 8487db, 7b9f20, b71df3, 8b1187, e19bbe, 42c3f8, 80297e, c6ced0, a0295e, 2c7383, 9e13d6, dd7302, 634854, 8f9eb2, f0e64f, debf4f, 464f6c, a523c9, 698827, 8fca03, 780ee6, ea56e7, 2519cc, 7e3280, ec5f84, 12eda3, 4b1b7f, 6681a5, 384830, 75da22, 021698, 43ff99, b1fd64, ffc634, ab557c, fb8bb5]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Build model instructions and source messages for single-bullet improvement, brain dumps and condensed facts.

- Improvement output is nullable text plus nullable nextQuestion; the prompt requests a follow-up even with a rewrite and forbids adding an unsupported purpose or result. `apps/api/src/enrich/focus-prompts.ts:12` -> `Do not add`; `apps/api/src/enrich/focus-prompts.ts:22` -> `nextQuestion`; `apps/api/src/enrich/focus-prompts.ts:23` -> `Always return`.
- Improvement context separates the target bullet from other bullets, includes current/past status, and includes note questions and answers. `apps/api/src/enrich/focus-prompts.ts:38` -> `Role status`; `apps/api/src/enrich/focus-prompts.ts:39` -> `Other bullets`; `apps/api/src/enrich/focus-prompts.ts:41` -> `Notes`.
- Brain-dump output is a bullets array; the requested count is min(4, MAX_BULLETS minus existing bullets), with ramble or answers marked as the only source for new facts. `apps/api/src/enrich/focus-prompts.ts:62` -> `"bullets"`; `apps/api/src/enrich/focus-prompts.ts:69` -> `MAX_BULLETS`; `apps/api/src/enrich/focus-prompts.ts:75` -> `only source`.
- Improvement and brain-dump templates hardcode 220 characters rather than interpolate PROPOSAL_MAX. `apps/api/src/enrich/focus-prompts.ts:16` -> `220`; `apps/api/src/enrich/focus-prompts.ts:57` -> `220`.
- Fact condensation requests at most eight facts of 160 characters, treats questions only as context, and preserves previous facts unless contradicted by current answers. `apps/api/src/enrich/focus-prompts.ts:83` -> `160`; `apps/api/src/enrich/focus-prompts.ts:86` -> `Questions are context`; `apps/api/src/enrich/focus-prompts.ts:87` -> `contradicts`.
- Fact messages send only note question/answer pairs and optional previous_facts, without role title, description or bullets. `apps/api/src/enrich/focus-prompts.ts:93` -> `roleFactsUserMessage`; `apps/api/src/enrich/focus-prompts.ts:96` -> `role.notes`; `apps/api/src/enrich/focus-prompts.ts:98` -> `previous_facts`.

## Connections

- Used by improve's logged enrich_improve_bullet request and ImproveSchema. `apps/api/src/enrich/improve.ts:33` -> `enrich_improve_bullet`; `apps/api/src/enrich/improve.ts:34` -> `ImproveSchema`; `apps/api/src/enrich/improve.ts:35` -> `improveBulletSystemPrompt`; `apps/api/src/enrich/focus-prompts.ts:4` -> `improveBulletSystemPrompt`; `apps/api/src/enrich/improve.ts:36` -> `improveBulletUserMessage`; `apps/api/src/enrich/focus-prompts.ts:33` -> `improveBulletUserMessage`.
- Used by brain-dump's logged enrich_brain_dump request and BrainDumpSchema. `apps/api/src/enrich/brain-dump.ts:46` -> `enrich_brain_dump`; `apps/api/src/enrich/brain-dump.ts:47` -> `BrainDumpSchema`; `apps/api/src/enrich/brain-dump.ts:48` -> `brainDumpSystemPrompt`; `apps/api/src/enrich/focus-prompts.ts:46` -> `brainDumpSystemPrompt`; `apps/api/src/enrich/brain-dump.ts:49` -> `brainDumpUserMessage`; `apps/api/src/enrich/focus-prompts.ts:66` -> `brainDumpUserMessage`.
- Used by role-facts' logged enrich_role_facts request and RoleFactsSchema. `apps/api/src/enrich/role-facts.ts:20` -> `enrich_role_facts`; `apps/api/src/enrich/role-facts.ts:21` -> `RoleFactsSchema`; `apps/api/src/enrich/role-facts.ts:22` -> `roleFactsSystemPrompt`; `apps/api/src/enrich/focus-prompts.ts:80` -> `roleFactsSystemPrompt`; `apps/api/src/enrich/role-facts.ts:23` -> `roleFactsUserMessage`; `apps/api/src/enrich/focus-prompts.ts:93` -> `roleFactsUserMessage`.
- Uses shared/cv MAX_BULLETS and copies shared/enrichment-checks PROPOSAL_MAX; both prompt limits and actual proposal checks must move together. `apps/api/src/enrich/focus-prompts.ts:69` -> `MAX_BULLETS`; `packages/shared/src/cv.ts:9` -> `MAX_BULLETS`; `apps/api/src/enrich/focus-prompts.ts:16` -> `220`; `packages/shared/src/enrich-checks.ts:4` -> `PROPOSAL_MAX`; `apps/api/src/enrich/rewrite.ts:30` -> `PROPOSAL_MAX`.
- Uses locale and kind instructions from scoring prompts; their Locale-keyed map also controls these templates. `apps/api/src/enrich/focus-prompts.ts:5` -> `languageInstruction`; `apps/api/src/enrich/prompts.ts:13` -> `languageInstruction`; `apps/api/src/enrich/prompts.ts:8` -> `LANGUAGE_NAME`; `apps/api/src/enrich/focus-prompts.ts:68` -> `kindNote`; `apps/api/src/enrich/prompts.ts:258` -> `kindNote`.
- Copies shared/cv's fact storage limits and feeds the shared/enrichment-focus fact answer contract. `apps/api/src/enrich/focus-prompts.ts:83` -> `160`; `packages/shared/src/cv.ts:40` -> `RoleFactsSchema`; `apps/api/src/enrich/role-facts.ts:28` -> `fromNotes`; `packages/shared/src/enrich-focus.ts:67` -> `RoleFactsAnswerSchema`.

## Assumptions

- The model must treat supplied text as data and picked ranges as ranges; these are prompt instructions, not proof that output is grounded. `apps/api/src/enrich/focus-prompts.ts:8` -> `untrusted`; `apps/api/src/enrich/focus-prompts.ts:19` -> `range`.
- Previous facts are trusted source material even if original answers were removed. `apps/api/src/enrich/focus-prompts.ts:87` -> `may no longer be listed`; `apps/api/src/enrich/focus-prompts.ts:98` -> `role.facts.items`.
