# Progress: tools step one role per screen, and the start screen

Branch `feat/tools-one-role`, worktree `resumora-live`, base `6905c78` (main). No plan file: both tasks were asked for
directly by the owner on 2026-11-17, after trying the short enrichment path on the live site. The owner picked
mockup A (one role per screen) from three, asked for a Skip button ("Skip this role only"), and for the start screen:
"Just show an animation that it's reading the CV, don't display a score yet."

## Task 1: Tools step shows one role per screen, with Skip — done
session: Cloudflare Pages deployment · builder: claude
commit: see the branch (base 6905c78) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

## Task 2: Start screen shows "Reading your CV…" with no score until every role is checked — done
session: Cloudflare Pages deployment · builder: claude
commit: same commit as Task 1 (they share `focus.css` and the two language files) · reviews: 1 (agents, the same one) · fix rounds: 0 · guard denials: 0
open: none

## Checks
- `npm run typecheck` and `npm run lint` pass.
- `npm test`: 1160 of 1161 web tests passed in the full run; the one failure was the slow jobs-list test timing out
  (`jobs-page.test.tsx`), which passes when run alone (54 of 54). Shared, API and extension suites pass.
- One independent review agent (Sonnet): no findings, pass.
- In a browser (owner's Chrome, local database, desktop width): the start screen shows "Reading your CV…" with the
  skeleton lines and then the score; the tools step shows role 1 of 7 with its groups; ticking, adding a tool, Next
  role, Back and Skip work, and a skipped role's added tool is no longer offered on its neighbour.
- Not checked: phone width in a browser (the window would not resize), Romanian wording by a native reader.

## Rulings
- Task 1: the group for a tool offered by a neighbouring role is named "From the role before or after" (not "Ticked
  on…"), because a tool ticked here stays in that group after the neighbour unticks it.
- Task 1: Skip puts the role on screen back to the tools its text names, so nothing is saved for it; a tool added on
  that role stays offered there, unticked.
- Task 1: a CV with no roles shows the step's title and Continue only.
- Task 2: the heading uses the import screen's wording and skeleton lines, so both "reading" moments look the same.

## Found while looking into "processing takes longer" (not changed here)
- Roles are scored one at a time (`useRoleScores`: "One request at a time"), about 3 to 5 seconds each, and the short
  path's start screen waits for all of them: about 30 seconds for 7 roles. Before the short path only the first
  role's score was waited for. The import itself took about 14 seconds for the same CV.
- In the hosted `ai_calls` log: `enrich_tools` is rejected by OpenRouter with HTTP 400 every time (3 of 3) and answered
  by the OpenAI fallback; the OpenAI fallback for `enrich_score` fails with HTTP 400 every time (4 of 4); OpenRouter
  returned HTTP 429 on `enrich_score` 10 times in two days, when several calls ran at once.
