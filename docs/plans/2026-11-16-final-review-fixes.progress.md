# Final review fixes: progress

## Task 1: Remove "Is there anything you want your CV to bring out?" — done
session: Final review fixes · builder: claude
commit: 51c62e2 (base db85aab) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none
ruling: two tests outside the brief's file list were updated because they asserted the removed argument or added the route check: `apps/web/src/cv/enrich/role-run.test.tsx` (`scoreRole(…, true, true)`) and `apps/api/src/enrich/routes.test.ts` (an old client's `focus` is ignored).

## Task 2: Romanian lines of an ended role use "Am" + past participle — done
session: Final review fixes · builder: claude
commit: (this commit) (base 51c62e2) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: a line opening with a company name that ends in "-ez" ("Mondelez…") would be read as a present-tense verb on an ended Romanian role (one extra retry in improve bullet, a tailoring flag, or the line left out of new bullets). Rare; not handled.
ruling: `apps/api/src/enrich/prompts.ts` (outside the file list) holds the shared `ROMANIAN_TENSE` and `NO_FIRST_PERSON` sentences, so every prompt carries the same words. `rewrite.ts` / `rewrite.test.ts` were dropped from the list: streamed rewrites now only rewrite the summary, so no line check belongs there.

## End of run (2026-11-16)

Tip `543ae74`, base `db85aab`, on `feat/tailored-job-flow` (PR 60, draft). Not pushed: waiting for the owner's go-ahead.
- Checks on `543ae74`: typecheck clean, lint clean. Tests: shared 467, API 832 (4 skipped), extension 229, web 1113, all pass.
- Whole-branch review (fresh Opus agent, effort high, `db85aab..543ae74`, brief = Tasks 1 and 2): no findings, verdict pass. One of two allowed.
- The running website (tailored-job worktree, local database) picked up both changes without a restart: the API reloaded, and the served focus step and RO strings have no "bring out" box.
- Not tried in a browser: the focus step and a Romanian enrichment run while signed in (needs the owner's sign-in), and no real AI call was made with the new prompts (the golden set was not run).

Cost: review agents: 3 (2 Sonnet, 1 Opus) · guard denials: 0 · weekly usage not measured in this session.
