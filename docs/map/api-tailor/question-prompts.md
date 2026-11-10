---
id: api-tailor/question-prompts
area: api-tailor
files: ["apps/api/src/tailor/question-prompts.ts","apps/api/src/tailor/questions.ts"]
depends_on: ["shared/tailoring","db/ai-log","api-core/call-model","api-tailor/steering","api-tailor/strip-header"]
contract: true
checked_hash: d3fe87f6
cited: [98b8cf, 475d26, 7a72e1, fefc81, f12ebc, 0c3957, 663f23, 1cd596, 46ba90, 3bf156, 576859, 3fd45f, e833df, 59413c, a9200b, 109cb7, e9d0e0, 55bf5a, c2b635, bac38a, 674742, 0f53c2, c48d40, f47a9b, 1ee8c6, cf5c3f, 46575b, 41d20f, 2a7329, 475d26, 7cb8da, 7a666f, 5ae22f, af2419, ab8ae5, a9200b, e9d0e0]
decisions: []
open: []
---
Define the gap-question AI contract and normalize or discard its returned targets.

- Cheap tailor_questions parses questions containing nullable roleId/bulletId/skill, text, options or confirm_inferred kind, string options, reason and gap; call limit is 4000 tokens `apps/api/src/tailor/questions.ts:21` -> `ModelQuestionsSchema`; `apps/api/src/tailor/questions.ts:111` -> `tailor_questions`; `apps/api/src/tailor/questions.ts:117` -> `maxOutputTokens`.
- Invalid model JSON/schema retries through the gateway; exhausted errors become 502 ai_failed without storing fresh questions `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/tailor/questions.ts:120` -> `ai_failed`; `apps/api/src/tailor/questions.ts:142` -> `updateRun`.
- Silently drops skills questions naming a role, empty/duplicate/excess questions, and unknown gap refs when a score exists. Unknown bullet IDs are omitted; role-step replies are forced to current role, other unknown role IDs become null `apps/api/src/tailor/questions.ts:132` -> `skills && named`; `apps/api/src/tailor/questions.ts:133` -> `gapRefs.has`; `apps/api/src/tailor/questions.ts:135` -> `onBullet`; `apps/api/src/tailor/questions.ts:140` -> `roleId:`.
- Question text and skill are truncated to MAX_TEXT; reason/gap retain model values. Options matching other, others, something else or none of the above after trimming, removing one trailing parenthetical and trailing punctuation are discarded case-insensitively; the question survives with fewer than two options `apps/api/src/tailor/questions.ts:130` -> `slice(0, MAX_TEXT)`; `apps/api/src/tailor/questions.ts:136` -> `aboutSkill`; `apps/api/src/tailor/questions.ts:137` -> `options`.
- Requirement refs resolve by index, keyword refs by suffix; every payload sends job title, summary and responsibilities. Role steps send only the current item (kind, title, company, dates, current, description, bullets and notes) as role, locale as language, and section/max/steering/gaps/answered, plus focus:false only for a role outside a nonempty focus selection; they omit cv and all score evidence, which can quote other items. Other sections retain the stripped CV without layout or a role field, including score evidence `apps/api/src/tailor/question-prompts.ts:36` -> `input.job.requirements`; `apps/api/src/tailor/question-prompts.ts:42` -> `input.role`; `apps/api/src/tailor/question-prompts.ts:44` -> `input.gaps.map`; `apps/api/src/tailor/question-prompts.ts:48` -> `layout: undefined`; `apps/api/src/tailor/question-prompts.ts:49` -> `job:`.
- The system prompt limits role questions to that item and its period/kind of work, permits skipping implausible gaps, asks non-focus roles only what helps their bullets show value for this job (including no questions), forbids naming another employer/role/project, and forbids fallback options supplied by the screen `apps/api/src/tailor/question-prompts.ts:9` -> `Never add an option`; `apps/api/src/tailor/question-prompts.ts:11` -> `Never mention another employer`; `apps/api/src/tailor/question-prompts.ts:12` -> `The role ran`; `apps/api/src/tailor/question-prompts.ts:13` -> `For a role that isn't a focus role`; `apps/api/src/tailor/question-prompts.ts:40` -> `input.focus === false`.
- tested by `apps/api/test/tailor-questions.test.ts:219` -> `sends only the current %s item`; `apps/api/test/tailor-questions.test.ts:276` -> `stores the remaining options`.

## Connections

- Uses system/user prompt templates that supply gaps, answered context, steering, the current item or stripped CV, and selected job fields `apps/api/src/tailor/questions.ts:112` -> `questionSystemPrompt`; `apps/api/src/tailor/question-prompts.ts:3` -> `questionSystemPrompt`; `apps/api/src/tailor/questions.ts:113` -> `questionUserMessage`; `apps/api/src/tailor/question-prompts.ts:37` -> `JSON.stringify`.
- Uses the SQL-allowed tailor_questions task `apps/api/src/tailor/questions.ts:111` -> `tailor_questions`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_questions`.

## Assumptions

- Role context includes only the current item's existing enrichment and job notes; answered context selects that item's notes for this job and its non-flag run answers. Other sections retain every item's notes; header stripping only protects basics fields `apps/api/src/tailor/questions.ts:45` -> `role.id === roleId`; `apps/api/src/tailor/questions.ts:46` -> `note.jobId`; `apps/api/src/tailor/questions.ts:47` -> `question.roleId === roleId`; `apps/api/src/tailor/questions.ts:13` -> `stripHeader`; `apps/api/src/tailor/question-prompts.ts:42` -> `role: input.role`; `apps/api/src/tailor/question-prompts.ts:48` -> `input.cv`.
