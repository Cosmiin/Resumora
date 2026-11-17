# Progress: prepare the questions while the uploaded CV is on screen; fill in recognised companies

Branch `feat/prepare-after-upload`, worktree `resumora-live`, base `8616197` (main). No plan file: both tasks were asked
for directly by the owner on 2026-11-17, after trying the live site.
- "As soon as I click on 'Start with the questions' I get another loading screen that says reading your CV which takes
  quite a bit of time. What I would like here to happen is to have this already load in the background as soon as the
  CV is uploaded. The questions should be prepared for this already."
- "For the companies that you currently found something not to bother with asking for a confirmation, just paste them
  automatically."

## Task 1: Scores, companies and tools are asked for while "We found N roles" is on screen — done
session: Cloudflare Pages deployment · builder: claude
commit: see the branch (base 8616197) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

## Task 2: Companies step fills in recognised companies without asking — done
session: Cloudflare Pages deployment · builder: claude
commit: same commit as Task 1 (they share `CompaniesStep.tsx` and its tests) · reviews: 1 (agents, the same one) · fix rounds: 0 · guard denials: 0
open: none

## Checks
- `npm run typecheck` and `npm run lint` pass.
- `npm test`: shared 489, API 881 (4 skipped), extension 229, web 1170, all passing.
- One independent review agent (Sonnet, high): pass, one low finding (the prepared companies and tools answers were
  kept after "Skip for now" and could go stale after edits). Changed after the review, not reviewed again: they are
  now dropped in that case, and the steps ask for themselves.
- In a browser (owner's Chrome, local database, desktop width, the 3-role sample CV): while "We found 3 roles" was on
  screen the companies, the tools and the three scores were answered; "Start with the questions" then showed
  "Your CV: 44" within a second, with no "Reading your CV…"; the companies and tools steps opened with no new request.
  With two company names changed to well-known ones, the companies step said "We recognised 2 companies and filled in
  what they do…" and asked only about the third.
- Not checked: phone width, the live site, Romanian wording by a native reader, a 7-role CV (the wait left after the
  click depends on how long the found screen is looked at: roles are still scored one at a time).

## Rulings
- Task 1: the browser asks for the preparation, not the import queue. The server scores a role of a ready, not yet
  used import when the request names it (`importId`); nothing new is stored and there is no migration. A failed
  request ahead shows nowhere; the role is asked again from the saved CV.
- Task 1: scoring ahead reads the import as found. A role corrected on the found screen is scored again after the
  import is used, as any edited role is.
- Task 1: companies and tools are asked one after the other, next to the scoring: at most two AI requests at a time.
- Task 1: after "Skip for now" the prepared companies and tools are dropped (the scores are kept: they are stored).
- Task 2: companies answered before are not listed either; the step lists only what it asks. With nothing to ask it
  moves on by itself. The button reads "Continue".
- Task 2: one line says how many companies were filled in and that they show in the review at the end.

## For the owner (auth, RLS, migrations)
- No migration, no RLS change. `POST /v1/enrich/score`, `/companies` and `/tools` can now read an import by id; the
  read goes through the signed-in user's own import repository (RLS), and only a `ready` import returns its content.
