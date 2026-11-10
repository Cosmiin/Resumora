---
id: api-enrich/score-prompts
area: api-enrich
files: ["apps/api/src/enrich/prompts.ts","apps/api/src/enrich/score.test.ts"]
depends_on: ["shared/cv","shared/enrichment-score"]
contract: true
checked_hash: 4e383179
cited: [12eda3, 7443b2, ca9dad, 8f0e91, b248ab, 9e6f66, b583a4, 267106, 4a5795, 07e650, adeebe, f8bfd7, 868a4b, a9a709, 6681a5, 610f14, 4ff777, 1af88a, d71aea, 100997, 0a667f, 5b2a37, b0c61c, 07e650, 12eda3, 725171, 6681a5, c84f3c, 4a5795, 1d5f13, 9885ce, d35e15, ec5f84, 7e3280, 50474f, f6f156, 03a5b8, 71c9c9, 498100, 208953, 868a4b]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Define scoring instructions and locale/kind context reused by enrichment generators.

- LANGUAGE_NAME is a Record<Locale, string> covering six languages; languageInstruction preserves JSON keys and source quotations while requesting prose in the CV locale. `apps/api/src/enrich/prompts.ts:8` -> `Record<Locale, string>`; `apps/api/src/enrich/prompts.ts:15` -> `CV locale`.
- The score prompt requests independent contribution, clarity, specificity and impact grades; it explicitly forbids grading the title/description or borrowing another bullet's work. `apps/api/src/enrich/prompts.ts:42` -> `context only`; `apps/api/src/enrich/prompts.ts:59` -> `Grade contribution`; `apps/api/src/enrich/prompts.ts:165` -> `Do not borrow`.
- Role questions request company, purpose and tools first, then at most five others; output contains grades rather than numeric scores; SCORE_POLICY is appended to the system prompt (input), not included in the strict model response schema. `apps/api/src/enrich/prompts.ts:193` -> `topic company`; `apps/api/src/enrich/prompts.ts:198` -> `at most 5`; `apps/api/src/enrich/prompts.ts:248` -> `Return grades`; `apps/api/src/enrich/prompts.ts:251` -> `SCORE_POLICY`; `packages/shared/src/enrich.ts:46` -> `ModelScoreSchema`; `packages/shared/src/enrich.ts:58` -> `.strict()`.
- scoreUserMessage sends title, description, ordered bullet IDs/text and note questions/answers, omitting company and dates; optional selected IDs restrict grading. `apps/api/src/enrich/prompts.ts:275` -> `Role title`; `apps/api/src/enrich/prompts.ts:280` -> `role.notes`; `apps/api/src/enrich/prompts.ts:282` -> `gradeOnly`.
- kindNote supplies project/volunteering context and returns no prefix for roles; scoreUserMessage defaults to role. `apps/api/src/enrich/prompts.ts:258` -> `kindNote`; `apps/api/src/enrich/prompts.ts:266` -> `return []`; `apps/api/src/enrich/prompts.ts:270` -> `ScoredKind = "role"`.
- tested by `apps/api/src/enrich/score.test.ts:318` -> `score prompt`

## Connections

- Used by both enrich_score requests, which parse shared/enrichment-score ModelScoreSchema. `apps/api/src/enrich/score.ts:32` -> `enrich_score`; `apps/api/src/enrich/score.ts:33` -> `ModelScoreSchema`; `apps/api/src/enrich/score.ts:34` -> `scoreSystemPrompt`; `apps/api/src/enrich/score.ts:85` -> `scoreSystemPrompt`; `apps/api/src/enrich/prompts.ts:250` -> `scoreSystemPrompt`; `packages/shared/src/enrich.ts:46` -> `ModelScoreSchema`.
- Uses shared/cv Locale for LANGUAGE_NAME and ScoredKind for kindNote; changes to those unions affect the prompt context. `apps/api/src/enrich/prompts.ts:8` -> `Record<Locale, string>`; `packages/shared/src/cv.ts:224` -> `Locale`; `apps/api/src/enrich/prompts.ts:258` -> `ScoredKind`; `packages/shared/src/cv.ts:268` -> `ScoredKind`.
- Uses shared/enrichment-score SCORE_POLICY in the prompt and fingerprint; wording changes need a policy bump to invalidate both caches. `apps/api/src/enrich/prompts.ts:251` -> `SCORE_POLICY`; `packages/shared/src/enrich.ts:271` -> `SCORE_POLICY`; `apps/api/src/enrich/score.ts:73` -> `SCORE_POLICY`; `apps/api/src/enrich/score.ts:76` -> `SCORE_POLICY`.
- Used by focus, summary, skills, achievement, description and item-line prompts for language instructions. `apps/api/src/enrich/prompts.ts:13` -> `languageInstruction`; `apps/api/src/enrich/focus-prompts.ts:5` -> `languageInstruction`; `apps/api/src/enrich/rewrite-prompts.ts:37` -> `languageInstruction`; `apps/api/src/enrich/skills-prompts.ts:24` -> `languageInstruction`; `apps/api/src/enrich/achievements.ts:12` -> `languageInstruction`; `apps/api/src/enrich/role-description.ts:27` -> `languageInstruction`; `apps/api/src/enrich/item-lines.ts:23` -> `languageInstruction`.

## Assumptions

- Prompt injection resistance is instructed to the model, not enforced by JSON encoding: supplied source material is declared untrusted. `apps/api/src/enrich/prompts.ts:38` -> `untrusted`; `apps/api/src/enrich/prompts.ts:280` -> `JSON.stringify`.
