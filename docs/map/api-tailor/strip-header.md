---
id: api-tailor/strip-header
area: api-tailor
files: ["apps/api/src/tailor/strip-header.ts","apps/api/src/tailor/strip-header.test.ts"]
depends_on: ["shared/cv"]
contract: false
checked_hash: edbef11e
cited: [054630, 58b141, 278954, 32b23e, 054630, 5a6632, 26b137, 817012, ac7a62, b41f0d, 02f95d, 3931b3, c54dc2, 588bd4, 051c5b, 278954, 5a6632]
decisions: []
open: []
---
Clone CV content for model calls while separating private header fields.

- Clears fullName, firstName, lastName, email, phone, location, website and linkedin only on the cloned basics object `apps/api/src/tailor/strip-header.ts:5` -> `privateFields`; `apps/api/src/tailor/strip-header.ts:8` -> `structuredClone`; `apps/api/src/tailor/strip-header.ts:9` -> `stripped.basics`.
- Deletes basics.photo entirely rather than sending the private storage path `apps/api/src/tailor/strip-header.ts:11` -> `delete stripped.basics.photo`.
- Returns a separate clone of the original basics as header; titles and summary remain in the stripped CV `apps/api/src/tailor/strip-header.ts:5` -> `privateFields`; `apps/api/src/tailor/strip-header.ts:12` -> `header: structuredClone`.
- Restoration clones the supplied CV and copies private fields back; it restores photo only when supplied, so an existing photo in the CV is not removed by an absent header photo `apps/api/src/tailor/strip-header.ts:16` -> `structuredClone`; `apps/api/src/tailor/strip-header.ts:18` -> `header.photo !== undefined`.
- tested by `apps/api/src/tailor/strip-header.test.ts:5` -> `CV header`.

## Connections

- Used before score, question, section, layout and letter prompts `apps/api/src/tailor/score.ts:44` -> `stripHeader`; `apps/api/src/tailor/questions.ts:106` -> `stripHeader`; `apps/api/src/tailor/section-pass.ts:143` -> `stripHeader`; `apps/api/src/tailor/layout-pass.ts:51` -> `stripHeader`; `apps/api/src/tailor/letter.ts:37` -> `stripHeader`; `apps/api/src/tailor/strip-header.ts:7` -> `stripHeader`.

## Assumptions

- This is field-based stripping: identical personal information inside narrative text or notes remains available to the model `apps/api/src/tailor/strip-header.ts:9` -> `privateFields`; `apps/api/src/tailor/strip-header.ts:12` -> `cv: stripped`.
