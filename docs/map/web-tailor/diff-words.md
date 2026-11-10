---
id: web-tailor/diff-words
area: web-tailor
files: ["apps/web/src/tailor/diff-words.ts","apps/web/src/tailor/diff-words.test.ts"]
depends_on: []
contract: false
checked_hash: c047f722
cited: [68c7f4, ef0071, e90395, f4381e, b64c3a, ed63df, 35d74c, e73116, 212c48, 21e092, e45c25, ef0071, 0a8e36]
decisions: []
open: []
---
Mark inserted words while preserving the proposed text exactly.

- After text is split into alternating whitespace/non-whitespace tokens; before text is reduced to words. `apps/web/src/tailor/diff-words.ts:9` -> `tokens`
- A full longest-common-subsequence matrix compares exact token strings, including punctuation and case. `apps/web/src/tailor/diff-words.ts:14` -> `lcs`
- Ties in reconstruction advance the old-text index first. `apps/web/src/tailor/diff-words.ts:23` -> `>=`
- After words outside the retained set are changed; whitespace initially stays unchanged. `apps/web/src/tailor/diff-words.ts:29` -> `tokens`
- Whitespace between two changed segments joins the change, then adjacent equal-mark segments are merged. `apps/web/src/tailor/diff-words.ts:35` -> `mark.changed`; `apps/web/src/tailor/diff-words.ts:40` -> `last.text`
- tested by `apps/web/src/tailor/diff-words.test.ts:6` -> `describe`

## Connections

- Used by role, summary and final-section highlighting. `apps/web/src/tailor/RoleReview.tsx:37` -> `diffWords`; `apps/web/src/tailor/SummaryReview.tsx:21` -> `diffWords`; `apps/web/src/tailor/LayoutReview.tsx:45` -> `diffWords`; `apps/web/src/tailor/diff-words.ts:8` -> `diffWords`

## Assumptions

- This is a display diff, not a semantic check: equal words match exactly and the matrix grows with both word counts. `apps/web/src/tailor/diff-words.ts:14` -> `Array.from`; `apps/web/src/tailor/diff-words.ts:17` -> `words[i] === afterWords[j]`
