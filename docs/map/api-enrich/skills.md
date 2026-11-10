---
id: api-enrich/skills
area: api-enrich
files: ["apps/api/src/enrich/skills.ts","apps/api/src/enrich/skills-prompts.ts","apps/api/src/enrich/skills.test.ts"]
depends_on: ["api-enrich/score-prompts","api-enrich/score","shared/cv","db/cv-repository","db/ai-log","api-core/call-model"]
contract: true
checked_hash: 699be24a
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Suggest explicitly evidenced skills and classify existing unclear skills without modifying the saved lists.

- ModelSkillsSchema has suggestions with name/group/evidence and sort entries with skillId/group; targets are only technicalSkills or professionalSkills. `apps/api/src/enrich/skills.ts:8` -> `Group`; `apps/api/src/enrich/skills.ts:9` -> `ModelSkillsSchema`.
- Only experience titles, descriptions, bullets and note answers are evidence; no usable text returns both arrays empty, even when unclear skills exist. `apps/api/src/enrich/skills.ts:33` -> `content.experience`; `apps/api/src/enrich/skills.ts:37` -> `texts.length === 0`.
- Logs enrich_skills, uses skills prompt builders, parses ModelSkillsSchema and requests 1500 output tokens. `apps/api/src/enrich/skills.ts:43` -> `enrich_skills`; `apps/api/src/enrich/skills.ts:44` -> `ModelSkillsSchema`; `apps/api/src/enrich/skills.ts:47` -> `1500`.
- Each accepted skill name must occur as a whole word and its evidence as a substring in the same single normalized source field. `apps/api/src/enrich/skills.ts:23` -> `RegExp`; `apps/api/src/enrich/skills.ts:62` -> `texts.some`.
- Deduplicates against all three saved skill groups and earlier suggestions after case/space normalization, but returns trimmed original model spellings; caps suggestions at fifteen. `apps/api/src/enrich/skills.ts:55` -> `content.unclearSkills`; `apps/api/src/enrich/skills.ts:60` -> `taken.has`; `apps/api/src/enrich/skills.ts:64` -> `s.name.trim`; `apps/api/src/enrich/skills.ts:65` -> `MAX_SUGGESTIONS`.
- Sort entries must reference existing unclearSkills IDs, and only the first entry per ID survives; output does not merge or save the groups. `apps/api/src/enrich/skills.ts:68` -> `content.unclearSkills`; `apps/api/src/enrich/skills.ts:72` -> `seen.has`; `apps/api/src/enrich/skills.ts:76` -> `return`.
- Invalid output JSON/schema retries in callModel; exhaustion becomes 503, truncation or EnrichParseError becomes 502. `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/ai/call-model.ts:174` -> `AiUnavailableError`; `apps/api/src/enrich/skills.ts:50` -> `503`; `apps/api/src/enrich/skills.ts:51` -> `502`.
- The prompt requests exact evidence quotes, at most fifteen suggestions, and sorting only when clear; it JSON-encodes all role text and unclear IDs/names. `apps/api/src/enrich/skills-prompts.ts:15` -> `exact quote`; `apps/api/src/enrich/skills-prompts.ts:17` -> `15`; `apps/api/src/enrich/skills-prompts.ts:18` -> `sort:`; `apps/api/src/enrich/skills-prompts.ts:34` -> `JSON.stringify`; `apps/api/src/enrich/skills-prompts.ts:51` -> `id: s.id`.
- tested by `apps/api/src/enrich/skills.test.ts:43` -> `suggestSkills`

## Connections

- Uses system/user skills templates and db/ai-log's enrich_skills allowlist entry. `apps/api/src/enrich/skills.ts:45` -> `skillsSystemPrompt`; `apps/api/src/enrich/skills-prompts.ts:23` -> `skillsSystemPrompt`; `apps/api/src/enrich/skills.ts:46` -> `skillsUserMessage`; `apps/api/src/enrich/skills-prompts.ts:44` -> `skillsUserMessage`; `apps/api/src/enrich/skills.ts:43` -> `enrich_skills`; `supabase/migrations/20261109220000_enrich_item_lines.sql:24` -> `enrich_skills`.
- Skill group literals copy shared/cv's three-list model, with only two allowed destinations and unclearSkills as the sort source. `apps/api/src/enrich/skills.ts:8` -> `technicalSkills`; `apps/api/src/enrich/skills.ts:68` -> `unclearSkills`; `packages/shared/src/cv.ts:87` -> `SkillGroup`; `apps/api/src/enrich/skills-prompts.ts:8` -> `technicalSkills`; `apps/api/src/enrich/skills-prompts.ts:9` -> `professionalSkills`.
- Uses Locale-based language instructions shared with scoring. `apps/api/src/enrich/skills-prompts.ts:24` -> `languageInstruction`; `apps/api/src/enrich/prompts.ts:13` -> `languageInstruction`.
- Used by the web skills URL and route; the browser parses its local SkillsAnswerSchema. `apps/web/src/cv/enrich/enrich-api.ts:154` -> `/v1/enrich/skills`; `apps/api/src/enrich/routes.ts:189` -> `"/skills"`; `apps/api/src/enrich/routes.ts:191` -> `suggestSkills`; `apps/api/src/enrich/skills.ts:30` -> `suggestSkills`; `apps/web/src/cv/enrich/enrich-api.ts:154` -> `SkillsAnswerSchema`.

## Assumptions

- The prompt asks for character-exact quotes, but acceptance ignores case and whitespace; evidence need not be a literal byte-for-byte source substring. `apps/api/src/enrich/skills-prompts.ts:15` -> `character for character`; `apps/api/src/enrich/skills.ts:18` -> `toLowerCase`; `apps/api/src/enrich/skills.ts:62` -> `t.includes`.
- The model selects groups for unclear items without additional classification checks; code checks only valid group shape, membership and repeated IDs. `apps/api/src/enrich/skills.ts:8` -> `z.enum`; `apps/api/src/enrich/skills.ts:72` -> `unclear.has`.
