---
id: api-tailor/review-item
area: api-tailor
files: ["apps/api/src/tailor/review-item.ts","apps/api/test/tailored.test.ts"]
depends_on: ["shared/cv","shared/tailoring","db/tailoring-repository","api-tailor/accept","api-tailor/accept-save"]
contract: true
checked_hash: 54e3ae47
cited: [7adbd5, 39f46b, b0724e, f35170, 429587, ad408c, 9a50d5, 21d1ec, e24b5a, d388fe, 905467, c214e9, 265a80, 405def, 946715, 768db7, a796dd, 821a12, c69515, 974d4f, 62131d, 946715, 8672b0, 42e1c9, b16a4d, ac5551, f154be, 8db4ef, 5eea9a, eeb8b2, 5364a5, d55a26, 5acc6b, 42e1c9, 6742c1, c0e086, 98c92e, 8672b0, 405def]
decisions: ["docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Apply a later keep/remove/edit decision to stored review state with a document version check.

- Requires section/key/action/version, optional bounded trimmed text, and text for edit; reads document and rejects stale version before touching review `apps/api/src/tailor/review-item.ts:7` -> `ReviewItemBodySchema`; `apps/api/src/tailor/review-item.ts:13` -> `refine`; `apps/api/src/tailor/review-item.ts:39` -> `doc.version`.
- Only own section/key properties are allowed; absent review item returns 404 and cannot resolve inherited prototype keys `apps/api/src/tailor/review-item.ts:42` -> `Object.hasOwn`; `apps/api/src/tailor/review-item.ts:44` -> `not_found`.
- Summary# keys remove/edit the stored text span only if still present; keep merely marks reviewed. Missing spans return 409 item_changed `apps/api/src/tailor/review-item.ts:50` -> `"summary#"`; `apps/api/src/tailor/review-item.ts:53` -> `includes(item.text)`; `apps/api/src/tailor/review-item.ts:16` -> `item_changed`.
- New-skill keys match by stored text, trimmed and case-insensitive, across technical/professional skills; removal preserves a skill already in the Base snapshot and edits rename the review key `apps/api/src/tailor/review-item.ts:57` -> `toLowerCase`; `apps/api/src/tailor/review-item.ts:62` -> `inBase`; `apps/api/src/tailor/review-item.ts:78` -> `"new-skill:"`; `apps/api/src/tailor/review-item.ts:81` -> `section[`.
- Whole-summary removal restores the original Base snapshot. Other targets find a stable item ID, then the first non-id field equal to review text; missing/changed targets return 409 `apps/api/src/tailor/review-item.ts:66` -> `doc.baseSnapshot.basics.summary`; `apps/api/src/tailor/review-item.ts:27` -> `Object.keys(item).find`; `apps/api/src/tailor/review-item.ts:68` -> `itemsOf(content)`; `apps/api/src/tailor/review-item.ts:70` -> `throw changed`.
- Other removals restore that field from baseSnapshot when it is a string; absent snapshot values leave current text in place even though review marks kept false `apps/api/src/tailor/review-item.ts:71` -> `original`; `apps/api/src/tailor/review-item.ts:72` -> `typeof original`; `apps/api/src/tailor/review-item.ts:75` -> `next.kept`.
- Review traversal covers scored items/bullets, technical/professional skills, awards, languages and lines of awards/courses/publications/interests; it does not match synthetic layout/headline/hide/order IDs `apps/api/src/tailor/review-item.ts:19` -> `itemsOf`; `apps/api/src/tailor/review-item.ts:21` -> `lined`; `apps/api/src/tailor/review-item.ts:68` -> `i.id === body.key`.
- Validates final CV and returns 400 for invalid content, saves with version check, preserves existing score without rescoring, then rereads document `apps/api/src/tailor/review-item.ts:85` -> `safeParse`; `apps/api/src/tailor/review-item.ts:87` -> `score: doc.score`; `apps/api/src/tailor/review-item.ts:88` -> `readTailoredCv`.
- tested by `apps/api/test/tailored.test.ts:125` -> `guided review`.

## Connections

- Used by browser review PATCH URL `apps/web/src/tailor/tailored-api.ts:32` -> `/review`; `apps/api/src/tailor/tailored-routes.ts:65` -> `/review`; `apps/api/src/tailor/tailored-routes.ts:68` -> `reviewItem`; `apps/api/src/tailor/review-item.ts:35` -> `reviewItem`.
- Uses review state created by api-tailor/accept and saved by api-tailor/accept-save; field information is not stored separately, hence later value matching `apps/api/src/tailor/accept.ts:28` -> `ItemReview`; `apps/api/src/tailor/accept.ts:151` -> `state[key]`; `apps/api/src/tailor/review-item.ts:26` -> `fieldOf`.
- Uses versioned document writer and owner RLS `apps/api/src/tailor/review-item.ts:87` -> `saveTailoredCv`; `apps/api/src/tailor/supabase-repo.ts:82` -> `eq("version", expectedVersion)`; `supabase/migrations/20261108000000_tailoring.sql:75` -> `own tailored cvs: update`.

## Assumptions

- User edits are trusted CV input; only schema limits are checked, with no model truth-check call `apps/api/src/tailor/review-item.ts:48` -> `body.text`; `apps/api/src/tailor/review-item.ts:85` -> `CvContentSchema.safeParse`.
- When multiple fields contain equal text, Object.keys order chooses the first field; stored review text is the only field discriminator `apps/api/src/tailor/review-item.ts:27` -> `Object.keys(item).find`.
