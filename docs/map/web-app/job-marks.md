---
id: web-app/job-marks
area: web-app
files: ["apps/web/src/jobs/marks.ts","apps/web/src/jobs/marks.test.ts"]
depends_on: ["shared/jobs"]
contract: false
checked_hash: 0cc10c1c
cited: [e77a9d, daf8e9, ae64c4, 1fc432, 2e5b17, d76f94, 4c200c, 1e93c2, ee449d, 85f5d0, 3c6f50, e77a9d, ae64c4]
decisions: []
open: []
---
Split original ad text into non-overlapping literal requirement highlights.

- Requirement strings are trimmed, blank strings discarded and longer strings processed first. `apps/web/src/jobs/marks.ts:8` -> `requirements.map`
- Regex metacharacters are escaped, then a Unicode case-insensitive non-global expression finds only the first occurrence. `apps/web/src/jobs/marks.ts:12` -> `replace`; `apps/web/src/jobs/marks.ts:13` -> `"iu"`
- A first match overlapping an accepted match is skipped completely; the algorithm does not search for a later occurrence. `apps/web/src/jobs/marks.ts:17` -> `matches.some`
- No matches returns one unmarked segment containing the complete original text. `apps/web/src/jobs/marks.ts:20` -> `return [{ text }]`
- Accepted matches are sorted by source position and the original string is sliced into marked spans and intervening/trailing text. `apps/web/src/jobs/marks.ts:21` -> `matches.sort`; `apps/web/src/jobs/marks.ts:25` -> `text.slice`
- tested by `apps/web/src/jobs/marks.test.ts:16` -> `skips overlapping first matches`
- tested by `apps/web/src/jobs/marks.test.ts:23` -> `Unicode letters`
## Connections
- Used by JobAd to create mark elements without reconstructing source wording: `apps/web/src/jobs/JobAd.tsx:12` -> `markRequirements`; `apps/web/src/jobs/marks.ts:6` -> `markRequirements`
## Assumptions
- Matching assumes a requirement has an exact textual occurrence except for case and outer whitespace; paraphrases and different inner whitespace do not match. `apps/web/src/jobs/marks.ts:8` -> `trim()`; `apps/web/src/jobs/marks.ts:13` -> `RegExp(pattern, "iu")`
