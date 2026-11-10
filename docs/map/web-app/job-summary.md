---
id: web-app/job-summary
area: web-app
files: ["apps/web/src/jobs/JobSummary.tsx","apps/web/src/jobs/JobAd.tsx","apps/web/src/jobs/job-page.test.tsx"]
depends_on: ["shared/jobs","web-app/job-marks","web-app/i18n","web-app/styles-jobs"]
contract: false
checked_hash: db4f69b9
cited: [43f011, da097a, 454891, 22a5ae, f64b5f, 8b515c, 4aa89e, cdd7db, c3ddab, 394296, 85f5d0, 90aeb6, e61037, 50cce0, 295b12, 85f5d0, 3c6f50, 85f5d0, 9ff851]
decisions: []
open: []
---
Show duties, benefits and a toggled original ad with requirement highlights.

- Duties show the first three rows initially; Show more expands all remaining duties without a collapse action. `apps/web/src/jobs/JobSummary.tsx:6` -> `FIRST_DUTIES = 3`; `apps/web/src/jobs/JobSummary.tsx:21` -> `hidden`
- Benefits render as one text paragraph joined with middle dots; empty duties/benefits sections are omitted. `apps/web/src/jobs/JobSummary.tsx:23` -> `duties.length > 0`; `apps/web/src/jobs/JobSummary.tsx:28` -> `benefits.length > 0`
- The read-count sentence selects singular only for exactly one and derives salary wording from the caller's salaryStated flag. `apps/web/src/jobs/JobSummary.tsx:9` -> `n === 1`; `apps/web/src/jobs/JobSummary.tsx:37` -> `salaryStated`
- The original-ad toggle uses generated IDs for aria-controls; the ad component mounts only while shown. `apps/web/src/jobs/JobSummary.tsx:39` -> `aria-controls`; `apps/web/src/jobs/JobSummary.tsx:42` -> `showAd &&`
- JobAd always renders the must/nice legend, then shows missing-copy only for null rawText; an empty string is treated as present text. `apps/web/src/jobs/JobAd.tsx:7` -> `legend`; `apps/web/src/jobs/JobAd.tsx:11` -> `rawText === null`
- Highlight segments are rendered as React text and mark elements with kind-based titles, preserving original text segments without HTML insertion. `apps/web/src/jobs/JobAd.tsx:12` -> `markRequirements`
- tested by `apps/web/src/jobs/job-page.test.tsx:413` -> `first three duties`
- tested by `apps/web/src/jobs/job-page.test.tsx:358` -> `exact ad`
## Connections
- Used by JobPage with extraction/raw text and computed salary visibility: `apps/web/src/jobs/JobPage.tsx:212` -> `JobSummary`; `apps/web/src/jobs/JobSummary.tsx:13` -> `JobSummary`
- Uses literal requirement marking: `apps/web/src/jobs/JobAd.tsx:12` -> `markRequirements`; `apps/web/src/jobs/marks.ts:6` -> `markRequirements`
## Assumptions
- Source text and extracted requirements can differ; only literal matching segments are highlighted. `apps/web/src/jobs/JobAd.tsx:12` -> `markRequirements(rawText, requirements)`; `apps/web/src/jobs/marks.ts:14` -> `if (!found) continue`
