---
id: api-enrich/rewrite
area: api-enrich
files: ["apps/api/src/enrich/rewrite.ts","apps/api/src/enrich/rewrite-prompts.ts","apps/api/src/enrich/rewrite.test.ts"]
depends_on: ["api-enrich/blocks","api-enrich/score-prompts","api-enrich/score","shared/cv","shared/enrichment-checks","shared/enrichment-focus","db/cv-history","db/ai-log","api-core/stream-model"]
contract: true
checked_hash: 1dd09fc6
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Parse streamed proposal blocks, apply deterministic checks, and expose validated summary rewrite events.

- checkProposal checks identity and note availability before normalized text, PROPOSAL_MAX and numeric grounding; the first failure becomes the drop reason. `apps/api/src/enrich/rewrite.ts:25` -> `original`; `apps/api/src/enrich/rewrite.ts:27` -> `newWithoutNote`; `apps/api/src/enrich/rewrite.ts:29` -> `unchanged`; `apps/api/src/enrich/rewrite.ts:30` -> `PROPOSAL_MAX`; `apps/api/src/enrich/rewrite.ts:31` -> `hasUnknownNumber`.
- Bullet number sources are role title, description, all bullets and note questions/answers; summary sources instead include current summary, experience company/dates/bullets/notes and omit role descriptions. `apps/api/src/enrich/rewrite.ts:12` -> `role.title`; `apps/api/src/enrich/rewrite.ts:18` -> `cv.basics.summary`; `apps/api/src/enrich/rewrite.ts:19` -> `r.company`.
- checkSummary accepts only the summary key, changed nonblank text, at most 600 normalized characters and numbers already in summarySources. `apps/api/src/enrich/rewrite.ts:7` -> `SUMMARY_MAX`; `apps/api/src/enrich/rewrite.ts:37` -> `unknownBullet`; `apps/api/src/enrich/rewrite.ts:40` -> `SUMMARY_MAX`; `apps/api/src/enrich/rewrite.ts:41` -> `summarySources`.
- rewriteEvents records index-to-key mappings, streams start/delta before validation, drops repeated non-new keys, and allows multiple new keys. `apps/api/src/enrich/rewrite.ts:54` -> `Map<number, string>`; `apps/api/src/enrich/rewrite.ts:61` -> `e.key !== "new"`; `apps/api/src/enrich/rewrite.ts:65` -> `"delta"`; `apps/api/src/enrich/rewrite.ts:67` -> `repeated.has`.
- Only complete accepted blocks become ready; rejected blocks emit dropped with a reason. Broken/unavailable streams emit error then done without completing the interrupted block. `apps/api/src/enrich/rewrite.ts:68` -> `verdict === "ok"`; `apps/api/src/enrich/rewrite.ts:75` -> `parser.push`; `apps/api/src/enrich/rewrite.ts:78` -> `AiStreamBrokenError`; `apps/api/src/enrich/rewrite.ts:87` -> `"done"`.
- Summary prompts request one summary block, two to four sentences and 600 characters; user context includes current summary and experience titles/companies/dates/bullets/notes. `apps/api/src/enrich/rewrite-prompts.ts:43` -> `600`; `apps/api/src/enrich/rewrite-prompts.ts:58` -> `Role title`; `apps/api/src/enrich/rewrite-prompts.ts:62` -> `r.bullets`; `apps/api/src/enrich/rewrite-prompts.ts:67` -> `Current summary`.
- tested by `apps/api/src/enrich/rewrite.test.ts:26` -> `checkProposal`
- tested by `apps/api/src/enrich/rewrite.test.ts:54` -> `rewriteEvents`
- tested by `apps/api/src/enrich/rewrite.test.ts:164` -> `POST /v1/enrich/rewrite-summary`

## Connections

- Used by summary route and browser URL; browser receives the same event stream. `apps/web/src/cv/enrich/SummaryTools.tsx:28` -> `/v1/enrich/rewrite-summary`; `apps/api/src/enrich/routes.ts:173` -> `"/rewrite-summary"`; `apps/api/src/enrich/routes.ts:186` -> `rewriteEvents`; `apps/api/src/enrich/rewrite.ts:52` -> `rewriteEvents`; `apps/web/src/cv/enrich/enrich-api.ts:88` -> `RewriteEventSchemas`; `packages/shared/src/enrich-stream.ts:14` -> `RewriteEventSchemas`.
- The model request uses summary system/user templates; task must match db/ai-log's allowlist. `apps/api/src/enrich/routes.ts:181` -> `rewriteSummarySystemPrompt`; `apps/api/src/enrich/rewrite-prompts.ts:36` -> `rewriteSummarySystemPrompt`; `apps/api/src/enrich/routes.ts:182` -> `rewriteSummaryUserMessage`; `apps/api/src/enrich/rewrite-prompts.ts:54` -> `rewriteSummaryUserMessage`; `apps/api/src/enrich/routes.ts:180` -> `enrich_rewrite_summary`; `supabase/migrations/20261109220000_enrich_item_lines.sql:24` -> `enrich_rewrite_summary`.
- Uses api-enrich/blocks for complete proposal boundaries and shared/enrichment-focus for drop reasons and validated outgoing events. `apps/api/src/enrich/rewrite.ts:53` -> `BlockParser`; `apps/api/src/enrich/blocks.ts:19` -> `BlockParser`; `apps/api/src/enrich/rewrite.ts:70` -> `"dropped"`; `packages/shared/src/enrich-stream.ts:4` -> `DropReasonSchema`; `apps/api/src/enrich/routes.ts:169` -> `RewriteEventSchemas`; `packages/shared/src/enrich-stream.ts:14` -> `RewriteEventSchemas`.
- Uses shared/enrichment-checks PROPOSAL_MAX=220; rewrite prompt copies 220, while SUMMARY_MAX and summary prompt copy the checklist's 600-character limit. `apps/api/src/enrich/rewrite.ts:30` -> `PROPOSAL_MAX`; `packages/shared/src/enrich-checks.ts:4` -> `PROPOSAL_MAX`; `apps/api/src/enrich/rewrite-prompts.ts:12` -> `220`; `apps/api/src/enrich/rewrite.ts:7` -> `600`; `apps/api/src/enrich/rewrite-prompts.ts:43` -> `600`; `packages/shared/src/enrich-checks.ts:73` -> `600`.
- Used by improve and brain-dump validation, and by eval number-source checks. `apps/api/src/enrich/improve.ts:46` -> `checkProposal`; `apps/api/src/enrich/brain-dump.ts:59` -> `checkProposal`; `apps/api/src/enrich/rewrite.ts:24` -> `checkProposal`; `apps/api/eval/enrich/run.eval.ts:159` -> `roleSources`; `apps/api/src/enrich/rewrite.ts:11` -> `roleSources`.
- Uses common locale instructions for summary generation. `apps/api/src/enrich/rewrite-prompts.ts:37` -> `languageInstruction`; `apps/api/src/enrich/prompts.ts:13` -> `languageInstruction`.

## Assumptions

- Deltas are unvalidated display text; consumers must distinguish ready from delta and dropped before allowing acceptance. `apps/api/src/enrich/rewrite.ts:65` -> `"delta"`; `apps/api/src/enrich/rewrite.ts:67` -> `check`; `apps/api/src/enrich/rewrite.ts:69` -> `"ready"`.
- Prompt rules about sentence count, first person and factual correctness beyond numeric membership are not enforced by checkSummary. `apps/api/src/enrich/rewrite-prompts.ts:13` -> `No first person`; `apps/api/src/enrich/rewrite-prompts.ts:43` -> `2 to 4`; `apps/api/src/enrich/rewrite.ts:36` -> `checkSummary`.
