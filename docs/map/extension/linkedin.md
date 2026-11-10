---
id: extension/linkedin
area: extension
files: ["apps/extension/src/readers/linkedin.ts","apps/extension/src/readers/readers.test.ts"]
depends_on: ["extension/readers"]
contract: false
checked_hash: 4084c7f0
cited: [f56bc6, c98f88, f0098b, f40fcc, a9a5c4, da7653, d04dee, 7bb1f4, 9a0c6f, 3fe8e4, 2421ca, e53070, fe2431, 0a9870, f31665, c8d115, 204036, 75553e, f0098b, a32e12, da7653]
decisions: []
open: []
---
Extract the selected LinkedIn job's top card and description with a canonical job URL.

- Job id is taken first from trailing digits in a /jobs/view/ path; otherwise currentJobId must contain only digits. `apps/extension/src/readers/linkedin.ts:9` -> `pathId`
- No job id returns null before reading any panes. `apps/extension/src/readers/linkedin.ts:16` -> `linkedInJobId`
- Candidate panes use data-testid lazy-column and require an h2 whose trimmed lowercase text is about the job. `apps/extension/src/readers/linkedin.ts:4` -> `ABOUT_JOB_HEADINGS`; `apps/extension/src/readers/linkedin.ts:19` -> `DETAILS_PANE`
- Description lookup starts at the heading parent, climbs at most three levels, and stops at a section or a found expandable-text-box. `apps/extension/src/readers/linkedin.ts:24` -> `heading.parentElement`
- A matched heading with no description returns null immediately, rather than continuing to a later pane. `apps/extension/src/readers/linkedin.ts:31` -> `return null`
- The top card is the cloned DOM range from the pane start to just before the heading. `apps/extension/src/readers/linkedin.ts:33` -> `createRange`
- Output uses the canonical /jobs/view/<id>/ URL, top-card text plus description separated by a blank line, and document-wide JSON-LD. `apps/extension/src/readers/linkedin.ts:39` -> `return`
- tested by `apps/extension/src/readers/readers.test.ts:30` -> `LinkedIn pages`
- tested by `apps/extension/src/readers/readers.test.ts:93` -> `linkedInJobId`

## Connections
- The dispatcher limits this reader to the exact www LinkedIn host and falls back to generic on null. `apps/extension/src/readers/index.ts:11` -> `www.linkedin.com`; `apps/extension/src/readers/index.ts:12` -> `readLinkedIn`; `apps/extension/src/readers/linkedin.ts:15` -> `readLinkedIn`; `apps/extension/src/readers/index.ts:15` -> `readGeneric`
- LinkedIn shares text formatting and structured-data parsing with the generic reader. `apps/extension/src/readers/linkedin.ts:41` -> `blockText`; `apps/extension/src/readers/generic.ts:16` -> `blockText`; `apps/extension/src/readers/linkedin.ts:42` -> `collectJsonLd`; `apps/extension/src/readers/generic.ts:3` -> `collectJsonLd`

## Assumptions
- Specialized extraction relies on an English heading and specific DOM test ids; alternate markup or language can make it return null. `apps/extension/src/readers/linkedin.ts:4` -> `ABOUT_JOB_HEADINGS`; `apps/extension/src/readers/linkedin.ts:21` -> `includes`; `apps/extension/src/readers/linkedin.ts:31` -> `return null`
