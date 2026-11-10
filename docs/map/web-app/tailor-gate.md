---
id: web-app/tailor-gate
area: web-app
files: ["apps/web/src/jobs/TailorGate.tsx","apps/web/src/jobs/job-page.test.tsx"]
depends_on: ["web-editor/page","web-enrich/scores","web-enrich/path-completion","web-app/i18n","web-app/styles-jobs"]
contract: false
checked_hash: 26ada68f
cited: [52129f, 6e82a7, ecffcb, f06948, d4dcb6, 92c554, 36cfa1, fb56d1, 85845c, 881fd4, a40c6d, 4d8420, 1a4b21, ac05df, 52129f, 465f1b, fb56d1, 346b6d, a40c6d, 4d8420, 1a4b21, e2abff, e2abff, dc696c, 579c56, 36cfa1, db0b03, 6aff36]
decisions: []
open: []
---
Check CV enrichment before offering tailoring or a detour through enrichment.

- The gate loads useMyCv; pending state shows checking, failed state offers refetch, and successful data mounts CheckCv. `apps/web/src/jobs/TailorGate.tsx:11` -> `useMyCv`; `apps/web/src/jobs/TailorGate.tsx:33` -> `cv.isPending`
- Opening focuses the dialog and cleanup restores the previous HTMLElement; Escape and backdrop click close it. `apps/web/src/jobs/TailorGate.tsx:14` -> `document.activeElement`; `apps/web/src/jobs/TailorGate.tsx:18` -> `event.target === event.currentTarget`
- Tab wraps through enabled buttons and also handles focus initially on the dialog itself. `apps/web/src/jobs/TailorGate.tsx:23` -> `button:not(:disabled)`
- enrichedAt !== null is the sole automatic-pass criterion, and an effect calls onTailor when true. `apps/web/src/jobs/TailorGate.tsx:44` -> `cv.enrichedAt !== null`
- useRoleScores still runs with status saved before the enriched branch returns. `apps/web/src/jobs/TailorGate.tsx:45` -> `useRoleScores`
- The displayed average uses experience roles only, with absent scores represented as null; averageScore excludes nulls and rounds the mean of known scores. `apps/web/src/jobs/TailorGate.tsx:48` -> `cv.experience.map`; `apps/web/src/cv/enrich/EnrichPath.tsx:167` -> `known`
- ENRICHED_AT supplies the meter marker (80); reaching it does not automatically bypass the gate without enrichedAt. Unknown average displays zero in the meter and not-scored text. `apps/web/src/jobs/TailorGate.tsx:51` -> `average ?? 0`; `apps/web/src/jobs/TailorGate.tsx:53` -> `ENRICHED_AT`; `apps/web/src/cv/enrich/EnrichPath.tsx:26` -> `80`
- Unenriched CVs always offer both Enrich first and Tailor anyway, including with no scores. `apps/web/src/jobs/TailorGate.tsx:57` -> `onEnrich`
- tested by `apps/web/src/jobs/job-page.test.tsx:287` -> `even at 80 or more`
## Connections
- Uses the shared CV query, which keys by user and keeps data indefinitely fresh while observed: `apps/web/src/jobs/TailorGate.tsx:11` -> `useMyCv`; `apps/web/src/cv/CvPage.tsx:15` -> `staleTime: Infinity`
- Uses enrichment's score threshold and averaging: `apps/web/src/jobs/TailorGate.tsx:48` -> `averageScore`; `apps/web/src/cv/enrich/EnrichPath.tsx:166` -> `averageScore`; `apps/web/src/jobs/TailorGate.tsx:53` -> `ENRICHED_AT`; `apps/web/src/cv/enrich/EnrichPath.tsx:26` -> `ENRICHED_AT`
- The Enrich first callback opens the editor enrichment query route: `apps/web/src/jobs/TailorGate.tsx:57` -> `onEnrich`; `apps/web/src/jobs/JobPage.tsx:228` -> `/cv?enrich=1`
- Enrich-first routing is consumed by the base editor and removed from the URL: `apps/web/src/jobs/JobPage.tsx:228` -> `/cv?enrich=1`; `apps/web/src/cv/Editor.tsx:96` -> `params.get("enrich")`; `apps/web/src/cv/Editor.tsx:98` -> `p.delete("enrich")`
- The gate invokes the shared role-score state hook: `apps/web/src/jobs/TailorGate.tsx:45` -> `useRoleScores`; `apps/web/src/cv/enrich/useRoleScores.ts:38` -> `useRoleScores`

## Assumptions
- The gate is advisory UI, not a prohibition on tailoring; unenriched users can explicitly continue. `apps/web/src/jobs/TailorGate.tsx:58` -> `onTailor`
