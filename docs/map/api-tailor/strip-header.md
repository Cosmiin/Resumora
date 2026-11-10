---
id: api-tailor/strip-header
area: api-tailor
files: ["apps/api/src/tailor/strip-header.ts","apps/api/src/tailor/strip-header.test.ts"]
depends_on: ["shared/cv"]
contract: false
checked_hash: 49f473e2
cited: [6816cf, 82a5bd, ade8ce, 70f189, 6816cf, 1639c8, 1639c8, 817012, 08fb2a, b41f0d, ab8ae5, 3931b3, c54dc2, 588bd4, 929c9a, ade8ce, 1639c8]
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

- Used before score, question, section, layout and letter prompts `apps/api/src/tailor/score.ts:44` -> `stripHeader`; `apps/api/src/tailor/questions.ts:13` -> `stripHeader`; `apps/api/src/tailor/section-pass.ts:143` -> `stripHeader`; `apps/api/src/tailor/layout-pass.ts:51` -> `stripHeader`; `apps/api/src/tailor/letter.ts:37` -> `stripHeader`; `apps/api/src/tailor/strip-header.ts:7` -> `stripHeader`.

## Assumptions

- This is field-based stripping: identical personal information inside narrative text or notes remains available to the model `apps/api/src/tailor/strip-header.ts:9` -> `privateFields`; `apps/api/src/tailor/strip-header.ts:12` -> `cv: stripped`.
