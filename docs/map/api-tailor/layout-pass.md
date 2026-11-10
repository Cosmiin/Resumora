---
id: api-tailor/layout-pass
area: api-tailor
files: ["apps/api/src/tailor/layout-pass.ts"]
depends_on: ["shared/cv","shared/tailoring","db/tailoring-runs","db/ai-log","api-core/call-model","api-tailor/steering","api-tailor/strip-header","api-tailor/proposal-application","api-tailor/section-routes"]
contract: true
checked_hash: 4803a557
cited: [7cd8de, 331573, c54dc2, c22bda, 2bd8c7, 56fd80, 93e738, b5f3e5, fefc81, 5c1365, 47177f, 38579d, af7fdb, 3159c2, 10925e, c450a0, 5f9553, 48d786, 2b373a, 2bd8c7, cd46dc, 7991e4, 93e738, 7cb8da, 6faba3, 3a582f, 644c47, 8101e6, 48e018, d01990, 280614, aaf26c, 5f9553]
decisions: []
open: []
---
Propose a section order and short headline from the current tailored CV.

- Only rejects done runs or a non-layout current section; reads tailored content rather than Base CV, then strips its header `apps/api/src/tailor/layout-pass.ts:46` -> `run.status`; `apps/api/src/tailor/layout-pass.ts:49` -> `getTailoredCv`; `apps/api/src/tailor/layout-pass.ts:51` -> `stripHeader`.
- Strong tailor_section uses LayoutReplySchema with a string-array order and string headline, inline layoutSystemPrompt, and 2000 tokens `apps/api/src/tailor/layout-pass.ts:11` -> `LayoutReplySchema`; `apps/api/src/tailor/layout-pass.ts:59` -> `tailor_section`; `apps/api/src/tailor/layout-pass.ts:61` -> `maxOutputTokens`.
- Prompt payload includes current order/headline, steering, job title/requirements and CV without layout `apps/api/src/tailor/layout-pass.ts:21` -> `layoutUserMessage`; `apps/api/src/tailor/layout-pass.ts:24` -> `layout: undefined`.
- Invalid JSON/schema replies retry in the gateway and then become 502 ai_failed; unknown, duplicate or missing section keys instead silently suppress the order proposal `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/tailor/layout-pass.ts:64` -> `ai_failed`; `apps/api/src/tailor/layout-pass.ts:68` -> `const same`.
- Order must be an exact permutation and actually differ. Headline is whitespace-normalized, limited to 80 characters or MAX_TEXT and eight words, and cannot end with . ! ? or semicolon `apps/api/src/tailor/layout-pass.ts:70` -> `if (same`; `apps/api/src/tailor/layout-pass.ts:73` -> `replace`; `apps/api/src/tailor/layout-pass.ts:76` -> `const short`.
- Every normalized headline word must occur in CV strings. Traversal skips id/layout/schemaVersion/locale/photo/enrichedAt and keys ending Id, but still includes note timestamps/text; invalid or unchanged headline silently disappears `apps/api/src/tailor/layout-pass.ts:28` -> `const words`; `apps/api/src/tailor/layout-pass.ts:34` -> `enrichedAt`; `apps/api/src/tailor/layout-pass.ts:77` -> `known.has`.
- Replaces only layout/headline proposals, sets waiting_user, and returns no questions; repeated current requests regenerate the proposals `apps/api/src/tailor/layout-pass.ts:81` -> `updateRun`; `apps/api/src/tailor/layout-pass.ts:83` -> `LAYOUT_ITEMS`.

## Connections

- Uses inline system and user templates, and the same SQL task as section generation `apps/api/src/tailor/layout-pass.ts:59` -> `layoutSystemPrompt`; `apps/api/src/tailor/layout-pass.ts:13` -> `layoutSystemPrompt`; `apps/api/src/tailor/layout-pass.ts:60` -> `layoutUserMessage`; `apps/api/src/tailor/layout-pass.ts:21` -> `layoutUserMessage`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_section`.
- Used by the browser section-run URL's layout branch `apps/web/src/tailor/tailor-api.ts:46` -> `/run`; `apps/api/src/tailor/routes.ts:80` -> `/run`; `apps/api/src/tailor/routes.ts:86` -> `runLayoutPass`; `apps/api/src/tailor/layout-pass.ts:41` -> `runLayoutPass`.
- Uses api-tailor/proposal-application to interpret synthetic IDs during accept `apps/api/src/tailor/layout-pass.ts:71` -> `itemId: "layout"`; `apps/api/src/tailor/layout-pass.ts:78` -> `itemId: "headline"`; `apps/api/src/tailor/accept.ts:59` -> `p.itemId === "layout"`; `apps/api/src/tailor/accept.ts:65` -> `p.itemId === "headline"`.

## Assumptions

- Word occurrence is the only headline grounding check: recombining known words is accepted without AI claim verification `apps/api/src/tailor/layout-pass.ts:77` -> `words(text).every`.
