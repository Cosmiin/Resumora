---
id: api-tailor/start
area: api-tailor
files: ["apps/api/src/tailor/start.ts","apps/api/src/tailor/language.ts","apps/api/src/tailor/language.test.ts","apps/api/test/tailor-start.test.ts"]
depends_on: ["shared/tailoring","shared/cv","db/tailoring-runs","db/tailoring-repository","db/jobs-repository","db/cv-repository","api-tailor/routes","api-tailor/accept-save"]
contract: false
checked_hash: 63e98019
cited: [4f06f8, 944ad1, 9daef1, a0b851, 7af32b, f756b2, 285cfb, 0efdc2, 75b48b, e03a9f, 72174f, 53d8d3, 63facd, 3855ff, 0aa02d, 8a47f8, 9c9f6c, bddee2, 6bf0de, 8f46b7, f12ebc, f9f3e5, 5c1365, 7f036b, 838056, 66e65c, 10c474, 8fe5a2, 4d0064, 6bb4f8, 4caaef, 53d8d3, 5540ff, 955275, 838a94, e3c4fa, 1ced02, 4e5696, 838a94, 0aa02d, 569300]
decisions: []
open: []
---
Start or resume a job-language tailoring document and establish its ordered review steps.

- Requires a ready job with extraction; missing jobs return 404 and unready jobs 409 `apps/api/src/tailor/start.ts:21` -> `deps.jobs.get`; `apps/api/src/tailor/start.ts:23` -> `job_not_ready`.
- Language detection uses only extracted summary and responsibilities, falling back to Base CV locale `apps/api/src/tailor/start.ts:25` -> `adText`; `apps/api/src/tailor/start.ts:26` -> `base.locale`.
- Detector counts Unicode-letter stopwords in six languages and requires at least five hits and twice the runner-up; otherwise returns null without a model `apps/api/src/tailor/language.ts:4` -> `STOPWORDS`; `apps/api/src/tailor/language.ts:19` -> `words`; `apps/api/src/tailor/language.ts:24` -> `return null`.
- Section order and role order come from shared helpers; projects then volunteering share a step, and empty projects/courses/publications/interests are omitted `apps/api/src/tailor/start.ts:29` -> `runSections`; `packages/shared/src/tailor.ts:37` -> `stepItems`; `packages/shared/src/tailor.ts:54` -> `runSections`; `packages/shared/src/tailor.ts:59` -> `runItems`.
- Creates a document from current Base CV with neutral default tone; duplicate insert returns exists and triggers a second lookup `apps/api/src/tailor/start.ts:34` -> `createTailoredCv`; `apps/api/src/tailor/start.ts:38` -> `"exists"`; `apps/api/src/tailor/start.ts:42` -> `findTailoredCvId`.
- Repeated start returns the existing document's newest run, including done/failed runs; creates a run only if absent, without applying newly submitted steering `apps/api/src/tailor/start.ts:45` -> `latestRun`.
- Run status vocabulary is running, waiting_user, done, failed. Repository creation sets running; section/layout passes set waiting_user; acceptance advances to running or done `packages/shared/src/tailor.ts:192` -> `status`; `apps/api/src/tailor/supabase-repo.ts:163` -> `status: "running"`; `apps/api/src/tailor/section-pass.ts:125` -> `"waiting_user"`; `apps/api/src/tailor/layout-pass.ts:82` -> `"waiting_user"`; `apps/api/src/tailor/accept.ts:192` -> `"done"`.
- Failed is representable but has no transition writer in these tailoring services: question/section/layout AI failures throw rather than persisting failed. Retrying a current pass regenerates proposals, whereas accepting an already advanced section returns 409 `apps/api/src/tailor/questions.ts:120` -> `ai_failed`; `apps/api/src/tailor/section-pass.ts:231` -> `ai_failed`; `apps/api/src/tailor/layout-pass.ts:64` -> `ai_failed`; `apps/api/src/tailor/section-pass.ts:123` -> `passProposals`; `apps/api/src/tailor/accept.ts:94` -> `run.status`.
- tested by `apps/api/test/tailor-start.test.ts:64` -> `POST /v1/jobs/:id/tailor`.
- tested by `apps/api/src/tailor/language.test.ts:4` -> `detectAdLanguage`.

## Connections

- Used by browser start URL `apps/web/src/tailor/tailor-api.ts:23` -> `/tailor`; `apps/api/src/tailor/routes.ts:36` -> `/jobs/:id/tailor`; `apps/api/src/tailor/routes.ts:41` -> `startTailoring`; `apps/api/src/tailor/start.ts:16` -> `startTailoring`.
- Uses document uniqueness through repository insert and SQL job/language constraint `apps/api/src/tailor/start.ts:34` -> `createTailoredCv`; `apps/api/src/tailor/supabase-repo.ts:69` -> `23505`; `supabase/migrations/20261108000000_tailoring.sql:26` -> `unique`.
- Uses run persistence and its owner/parent RLS policies `apps/api/src/tailor/start.ts:39` -> `createRun`; `apps/api/src/tailor/supabase-repo.ts:161` -> `from("tailor_runs")`; `supabase/migrations/20261108000000_tailoring.sql:85` -> `own tailor runs: create`; `supabase/migrations/20261108000000_tailoring.sql:88` -> `auth.uid()`.

## Assumptions

- Document uniqueness does not make run creation atomic: a competing start may observe the document before a latest run and create another run `apps/api/src/tailor/start.ts:39` -> `createRun`; `apps/api/src/tailor/start.ts:45` -> `latestRun`.
- Run writes have no version condition; concurrent deliveries of these HTTP operations can replace fields from stale run snapshots `apps/api/src/tailor/supabase-repo.ts:183` -> `update(columns).eq("id", id)`.
