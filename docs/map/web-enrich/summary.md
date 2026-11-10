---
id: web-enrich/summary
area: web-enrich
files: ["apps/web/src/cv/enrich/SummaryTools.tsx","apps/web/src/cv/enrich/Checklist.tsx","apps/web/src/cv/enrich/summary-skills.test.tsx","apps/web/src/cv/enrich/save-failed.test.tsx"]
depends_on: ["web-enrich/summary-stream","web-enrich/summary-review","web-enrich/skills-review","api-enrich/routes","api-enrich/rewrite","api-enrich/score-prompts","shared/enrichment-checks","web-editor/section-tools","web-editor/autosave"]
contract: false
checked_hash: d8305242
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Start summary rewriting after saving and present the advisory checklist.

- Starting records the current summary and waits for save before mounting the stream; save failure returns to idle with a specific saveFailed alert. `apps/web/src/cv/enrich/SummaryTools.tsx:135` -> `setStarted`; `apps/web/src/cv/enrich/SummaryTools.tsx:138` -> `waitForSave`; `apps/web/src/cv/enrich/SummaryTools.tsx:141` -> `setFailed(true)`; `apps/web/src/cv/enrich/SummaryTools.tsx:156` -> `saveFailed`
- Checklist maps sentences/firstPerson/length/mentionsRole/mentionsNumber to labels and fixes. FIX is Record<string,...>, so the non-null lookup assumes shared check keys remain covered. `apps/web/src/cv/enrich/SummaryTools.tsx:112` -> `FIX`; `apps/web/src/cv/enrich/SummaryTools.tsx:149` -> `FIX[c.key]!`; `apps/web/src/cv/enrich/Checklist.tsx:14` -> `!it.ok && it.fix`
- tested by `apps/web/src/cv/enrich/summary-skills.test.tsx:76` -> `describe`

## Connections

- Used by base-CV summary tools; requests reach the mounted rewrite route, which snapshots saved content before starting SSE. `apps/web/src/cv/panel/SectionTools.tsx:205` -> `SummaryTools`; `apps/web/src/cv/enrich/SummaryTools.tsx:121` -> `SummaryTools`; `apps/web/src/cv/enrich/SummaryTools.tsx:28` -> `/v1/enrich/rewrite-summary`; `apps/api/src/enrich/routes.ts:173` -> `/rewrite-summary`; `apps/api/src/enrich/routes.ts:177` -> `snapshot`
- Uses server summary prompt builders and checks; generated content depends on saved summary and experience, and prompt language uses the exhaustive Locale LANGUAGE_NAME map. `apps/api/src/enrich/routes.ts:181` -> `rewriteSummarySystemPrompt`; `apps/api/src/enrich/rewrite-prompts.ts:36` -> `rewriteSummarySystemPrompt`; `apps/api/src/enrich/routes.ts:182` -> `rewriteSummaryUserMessage`; `apps/api/src/enrich/rewrite-prompts.ts:54` -> `rewriteSummaryUserMessage`; `apps/api/src/enrich/routes.ts:186` -> `checkSummary`; `apps/api/src/enrich/rewrite-prompts.ts:37` -> `languageInstruction`; `apps/api/src/enrich/prompts.ts:15` -> `LANGUAGE_NAME[locale]`; `apps/api/src/enrich/prompts.ts:8` -> `Record<Locale, string>`
- Uses shared summaryChecklist; Checklist also serves SkillsTools and prints only failing fixes. `apps/web/src/cv/enrich/SummaryTools.tsx:149` -> `summaryChecklist`; `packages/shared/src/enrich-checks.ts:67` -> `summaryChecklist`; `apps/web/src/cv/enrich/SummaryTools.tsx:153` -> `Checklist`; `apps/web/src/cv/enrich/SkillsTools.tsx:158` -> `Checklist`; `apps/web/src/cv/enrich/Checklist.tsx:14` -> `!it.ok`
- Uses two independent 600-character limits: server SUMMARY_MAX duplicates the literal in summaryChecklist; no shared exported numeric constant ties them together. `apps/api/src/enrich/rewrite.ts:7` -> `SUMMARY_MAX = 600`; `packages/shared/src/enrich-checks.ts:73` -> `summary.length <= 600`; `apps/web/src/cv/enrich/SummaryTools.tsx:149` -> `summaryChecklist`
- Uses [summary-stream](./summary-stream.md): the saved review stage mounts SummaryRewrite, which starts the SSE client. `apps/web/src/cv/enrich/SummaryTools.tsx:171` -> `SummaryRewrite`; `apps/web/src/cv/enrich/SummaryTools.tsx:28` -> `streamRewrite`

## Assumptions

- A ready server proposal need not pass every advisory checklist rule: checkSummary enforces the summary key, changed/nonempty normalized text, length and known numbers, but does not enforce sentence count, first-person avoidance, role mention or presence of a number. `apps/api/src/enrich/rewrite.ts:36` -> `checkSummary`; `apps/api/src/enrich/rewrite.ts:40` -> `SUMMARY_MAX`; `apps/api/src/enrich/rewrite.ts:41` -> `hasUnknownNumber`; `packages/shared/src/enrich-checks.ts:71` -> `sentences`; `packages/shared/src/enrich-checks.ts:75` -> `mentionsNumber`
