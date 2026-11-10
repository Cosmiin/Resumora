---
id: api-tailor/question-prompts
area: api-tailor
files: ["apps/api/src/tailor/question-prompts.ts","apps/api/src/tailor/questions.ts"]
depends_on: ["shared/tailoring","db/ai-log","api-core/call-model","api-tailor/steering","api-tailor/strip-header"]
contract: true
checked_hash: 1e5016de
cited: [28011f, 9f5304, 5dd87a, fefc81, e1bb96, 8465bd, 73bfb1, 45665e, 0d3d56, 811ee4, 29382c, 576859, eb19a4, 73d22c, e1f89a, 714518, 1cf5ef, 3e8d51, 5c971a, 87f5a0, 9f5304, 7cb8da, 5f9d37, fdf26b, 714518]
decisions: []
open: []
---
Define the gap-question AI contract and normalize or discard its returned targets.

- Cheap tailor_questions parses questions containing nullable roleId/bulletId/skill, text, options or confirm_inferred kind, string options, reason and gap; call limit is 4000 tokens `apps/api/src/tailor/questions.ts:20` -> `ModelQuestionsSchema`; `apps/api/src/tailor/questions.ts:109` -> `tailor_questions`; `apps/api/src/tailor/questions.ts:116` -> `maxOutputTokens`.
- Invalid model JSON/schema retries through the gateway; exhausted errors become 502 ai_failed without storing fresh questions `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/tailor/questions.ts:119` -> `ai_failed`; `apps/api/src/tailor/questions.ts:139` -> `updateRun`.
- Silently drops skills questions naming a role, empty/duplicate/excess questions, and unknown gap refs when a score exists. Unknown bullet IDs are omitted; role-step replies are forced to current role, other unknown role IDs become null `apps/api/src/tailor/questions.ts:131` -> `skills && named`; `apps/api/src/tailor/questions.ts:132` -> `gapRefs.has`; `apps/api/src/tailor/questions.ts:134` -> `onBullet`; `apps/api/src/tailor/questions.ts:137` -> `roleId:`.
- Question text and skill are truncated to MAX_TEXT; options/reason/gap retain model values and are not constrained by the local model schema beyond types `apps/api/src/tailor/questions.ts:26` -> `text: z.string()`; `apps/api/src/tailor/questions.ts:129` -> `slice(0, MAX_TEXT)`; `apps/api/src/tailor/questions.ts:135` -> `aboutSkill`.
- Requirement refs resolve by index, keyword refs by suffix; payload drops layout and sends job title, summary and responsibilities `apps/api/src/tailor/question-prompts.ts:32` -> `input.job.requirements`; `apps/api/src/tailor/question-prompts.ts:38` -> `input.gaps.map`; `apps/api/src/tailor/question-prompts.ts:42` -> `layout: undefined`.

## Connections

- Uses system/user prompt templates that supply gaps, answered context, steering, stripped CV and selected job fields `apps/api/src/tailor/questions.ts:110` -> `questionSystemPrompt`; `apps/api/src/tailor/question-prompts.ts:3` -> `questionSystemPrompt`; `apps/api/src/tailor/questions.ts:112` -> `questionUserMessage`; `apps/api/src/tailor/question-prompts.ts:33` -> `JSON.stringify`.
- Uses the SQL-allowed tailor_questions task `apps/api/src/tailor/questions.ts:109` -> `tailor_questions`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_questions`.

## Assumptions

- Prompt context includes the stripped CV's existing notes, while answered context selects this job's notes; stripping only protects basics fields `apps/api/src/tailor/questions.ts:53` -> `note.jobId`; `apps/api/src/tailor/questions.ts:103` -> `stripHeader`; `apps/api/src/tailor/question-prompts.ts:42` -> `input.cv`.
