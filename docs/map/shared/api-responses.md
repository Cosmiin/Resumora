---
id: shared/api-responses
area: shared
files: ["packages/shared/src/api.ts"]
depends_on: ["shared/cv","shared/imports"]
contract: true
checked_hash: a9ff8f8f
cited: [ef0867, bd7cbf, bfc57b, 15bcac, 1bf360, e1f6e7, c329ae, e15887, 666166, 374d76, a352da, ef0867, bd7cbf, 086796, 78cdb8, 9ec6a7, 13fe6b, feecaa, ac30fe, bfc57b, 9c82ef, bfc57b, c93b2e, 083b87, 7e1b46, 39a537, 725b3a, 2e05a8, 15bcac, 2409e3, 2fa953, ba9436, ae16b4, 91fccc, 8f5709, 43ff12, e1f6e7, bd7cbf, 119af3, 1bf360, 1bf360, f72159, 19b510, c568e8, 748136, bd7cbf, 2b8a5e, ac74c9, a20565, 3d023c, 7cfc68, 6eb4f6, 0b28ea, 163b42]
decisions: ["docs/decisions/0003-one-shared-description-of-a-cv.md","docs/decisions/0005-one-cv-per-user-with-history.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Validate CV, save, history, error and import response envelopes at application boundaries.

- CvResponse contains current CV content and a nonnegative integer version; its updatedAt is only a string. `packages/shared/src/api.ts:5` -> `CvResponseSchema`
- SaveResponse requires a positive integer version, unlike an initial CV response which may have version zero. `packages/shared/src/api.ts:12` -> `SaveResponseSchema`
- HistoryItem restricts reasons to autosave, restore, import or ai; ID and creation time remain strings. `packages/shared/src/api.ts:18` -> `HistoryItemSchema`
- ErrorBody requires error.code, message and requestId strings, without an enumerated code set. `packages/shared/src/api.ts:25` -> `ErrorBodySchema`
- ImportStatus allows queued, processing, ready, failed and applied. `packages/shared/src/api.ts:34` -> `ImportStatusSchema`
- ImportResponse requires nullable error and result fields, but does not condition their nullability on status; import errors carry code/message without requestId. `packages/shared/src/api.ts:37` -> `ImportResponseSchema`

## Connections

- Used by web CV GET/PUT response parsing and API route production: `apps/web/src/cv/cv-api.ts:15` -> `/v1/cv`, `apps/web/src/cv/cv-api.ts:38` -> `/v1/cv` -> `apps/api/src/cv/routes.ts:42` -> `app.get`, `apps/api/src/cv/routes.ts:44` -> `app.put`; mount `apps/api/src/app.ts:74` -> `/v1/cv`; contracts `packages/shared/src/api.ts:5` -> `CvResponseSchema`, `packages/shared/src/api.ts:12` -> `SaveResponseSchema`.
- Used by web history and restore URLs: `apps/web/src/cv/cv-api.ts:22` -> `/v1/cv/history`, `apps/web/src/cv/cv-api.ts:26` -> `/v1/cv/history`, `apps/web/src/cv/cv-api.ts:30` -> `/v1/cv/history` -> `apps/api/src/cv/routes.ts:49` -> `/history`, `apps/api/src/cv/routes.ts:51` -> `/history/:id`, `apps/api/src/cv/routes.ts:57` -> `/history/:id/restore`; history contract `packages/shared/src/api.ts:18` -> `HistoryItemSchema`.
- Used by API history row decoding: `apps/api/src/cv/supabase-repo.ts:76` -> `HistoryItemSchema` -> `packages/shared/src/api.ts:18` -> `HistoryItemSchema`. Extending reason also requires the exhaustive web label map and the SQL allowlist to change: `apps/web/src/cv/HistoryPanel.tsx:9` -> `reasonLabel`, `supabase/migrations/20261104000000_baseline.sql:20` -> `reason` -> `packages/shared/src/api.ts:20` -> `reason`.
- Used by API errors, web error parsing and extension error parsing: `apps/api/src/errors.ts:3` -> `ErrorBody`, `apps/web/src/lib/api.ts:50` -> `ErrorBodySchema`, `apps/extension/src/api.ts:40` -> `ErrorBodySchema` -> `packages/shared/src/api.ts:25` -> `ErrorBodySchema`.
- Used by web upload/poll/apply URLs: `apps/web/src/imports/imports-api.ts:7` -> `/v1/imports`, `apps/web/src/imports/imports-api.ts:11` -> `/v1/imports`, `apps/web/src/imports/imports-api.ts:15` -> `/v1/imports` -> `apps/api/src/imports/routes.ts:27` -> `app.post`, `apps/api/src/imports/routes.ts:51` -> `/:id`, `apps/api/src/imports/routes.ts:58` -> `/:id/apply`; mount `apps/api/src/app.ts:76` -> `/v1/imports`; contracts `packages/shared/src/api.ts:37` -> `ImportResponseSchema`, `packages/shared/src/api.ts:12` -> `SaveResponseSchema`.
- Used by API import status decoding: `apps/api/src/imports/supabase-repo.ts:32` -> `ImportStatusSchema` -> `packages/shared/src/api.ts:34` -> `ImportStatusSchema`. New shared statuses still encounter the database allowlist: `packages/shared/src/api.ts:34` -> `ImportStatusSchema` -> `supabase/migrations/20261105000000_imports.sql:10` -> `status in`.
- Save-response versions originate in the database RPC: `apps/api/src/cv/supabase-repo.ts:48` -> `save_base_cv` -> `supabase/migrations/20261104000000_baseline.sql:73` -> `save_base_cv`; route conflict handling `apps/api/src/cv/routes.ts:32` -> `version_conflict` -> `packages/shared/src/api.ts:12` -> `SaveResponseSchema`.
- CV/history reads depend on RLS ownership rather than a user filter: `apps/api/src/cv/supabase-repo.ts:35` -> `base_cvs`, `apps/api/src/cv/supabase-repo.ts:70` -> `base_cv_versions` -> `supabase/migrations/20261104000000_baseline.sql:53` -> `auth.uid`, `supabase/migrations/20261104000000_baseline.sql:60` -> `auth.uid`.

## Assumptions

- Response validation is not authorization; authentication is supplied by the /v1 middleware. `apps/api/src/app.ts:65` -> `/v1/*`, `apps/api/src/app.ts:69` -> `unauthorized`.
- Version zero represents an absent stored CV, not a completed save. `apps/api/src/cv/supabase-repo.ts:39` -> `version: 0`, `packages/shared/src/api.ts:13` -> `positive`.
