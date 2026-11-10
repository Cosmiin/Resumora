---
id: web-app/job-edit
area: web-app
files: ["apps/web/src/jobs/JobEditForm.tsx","apps/web/src/jobs/job-edit.test.tsx"]
depends_on: ["web-app/jobs-client","web-app/i18n","shared/jobs","web-app/styles-jobs"]
contract: false
checked_hash: ac0d10af
decisions: ["docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Edit a captured extraction using a fixed starting version and shared enum choices.

- The form captures currentVersion once in state and initializes its draft and split salary/list fields from extracted. `apps/web/src/jobs/JobEditForm.tsx:20` -> `useState(currentVersion)`
- Save refuses reentry, blank trimmed titles and responsibility/benefit lines longer than 500 trimmed characters. `apps/web/src/jobs/JobEditForm.tsx:33` -> `if (saving)`; `apps/web/src/jobs/JobEditForm.tsx:38` -> `500`
- Submission trims title, company, location, summary and requirements, drops empty requirements and converts blank company/location/applyBy to null. `apps/web/src/jobs/JobEditForm.tsx:46` -> `draft.title.trim()`
- Responsibilities and benefits split at newlines, trim, drop blank lines and silently truncate to 40/30 items. `apps/web/src/jobs/JobEditForm.tsx:17` -> `slice(0, limit)`; `apps/web/src/jobs/JobEditForm.tsx:49` -> `lines(responsibilities, 40)`
- Salary becomes null only when all its input fields are empty; otherwise number inputs convert through Number and missing bounds become null. `apps/web/src/jobs/JobEditForm.tsx:50` -> `salary:`
- Saving awaits patchJob and then onSaved before clearing saving; Save and Cancel are disabled during that operation. `apps/web/src/jobs/JobEditForm.tsx:56` -> `await onSaved`; `apps/web/src/jobs/JobEditForm.tsx:152` -> `disabled={saving}`
- version_conflict and wrong_status show API messages; network has specific copy, other failures generic copy, and only version_conflict offers Reload. `apps/web/src/jobs/JobEditForm.tsx:59` -> `version_conflict`; `apps/web/src/jobs/JobEditForm.tsx:149` -> `reload`
- Work mode/type/seniority, salary periods and requirement categories use schema options; must/nice buttons and the default new must/skill row are hand-written. `apps/web/src/jobs/JobEditForm.tsx:98` -> `fields[key].options`; `apps/web/src/jobs/JobEditForm.tsx:112` -> `period.unwrap().options`; `apps/web/src/jobs/JobEditForm.tsx:130` -> `category.options`; `apps/web/src/jobs/JobEditForm.tsx:136` -> `kind: "must"`
- Requirement text inputs cap at 500, and Add disables at 60 rows. `apps/web/src/jobs/JobEditForm.tsx:122` -> `maxLength={500}`; `apps/web/src/jobs/JobEditForm.tsx:135` -> `>= 60`
- tested by `apps/web/src/jobs/job-edit.test.tsx:177` -> `caps responsibilities`
- tested by `apps/web/src/jobs/job-edit.test.tsx:219` -> `disables Save and Cancel`
## Connections
- Copied limits must change with shared/jobs: `apps/web/src/jobs/JobEditForm.tsx:49` -> `40`; `packages/shared/src/jobs.ts:17` -> `max(40)`; `packages/shared/src/jobs.ts:23` -> `max(30)`; `apps/web/src/jobs/JobEditForm.tsx:122` -> `500`; `packages/shared/src/jobs.ts:19` -> `max(500)`; `apps/web/src/jobs/JobEditForm.tsx:135` -> `60`; `packages/shared/src/jobs.ts:22` -> `max(60)`
- Uses the full extraction PATCH client: `apps/web/src/jobs/JobEditForm.tsx:56` -> `patchJob`; `apps/web/src/jobs/jobs-api.ts:46` -> `version, extracted`
## Assumptions
- This form uses the schema to enumerate options but does not parse the complete draft before sending; remaining validation belongs to the API. `apps/web/src/jobs/JobEditForm.tsx:16` -> `JobExtractionSchema.shape`; `apps/web/src/jobs/JobEditForm.tsx:56` -> `patchJob`; `apps/api/src/jobs/routes.ts:117` -> `JobPatchBodySchema.parse`
