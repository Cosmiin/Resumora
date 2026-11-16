# Progress: the AI proposes what the company does

Branch `feat/company-guess`, worktree `resumora-company`, base `2e3f988`.

## Task 1: The model gets the company and may propose what it does — done
session: Company question · builder: claude
commit: 3154a9b (base 2e3f988) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

## Task 2: The question screen offers the proposal to confirm or edit — done
session: Company question · builder: claude
commit: 378d2b5 (base 3154a9b) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

## Whole-branch review (Opus)
One medium finding: the role's fingerprint left out company and location, so a proposal stored before a company
rename would still be offered. Fixed (both now count) and reviewed on its own.

## Rulings
- Task 1: the prompt tests went into `apps/api/src/enrich/score.test.ts`, where the score-prompt tests live
  (`prompts.test.ts` named in the brief doesn't exist).
- Task 1: an older test said the company is never sent; it was turned around, since sending it is the change.
- Fix: `fingerprint()` now includes company and location (shared, used by api and web). Every stored score is read
  again once anyway, because the policy moved to `score/8`.
- The older focus mode (`QuestionStep`) shows a company question with a proposal as a plain question; only the
  role run (flow B) offers Yes / Edit.

Cost line: review agents 4 (2 Sonnet, 2 Opus) · guard denials 0 · no Codex.

## Published on 2026-11-17 (owner asked)
- Worker `resumora-api` and the Pages project `resumora` (https://resumora.pages.dev), from a local build of
  `feat/go-live` + `feat/mobile-fluid` + this branch (merge `f09b746`, on no branch, not pushed), so the live site
  keeps both open PRs' changes. No database change.
- Checked in the owner's Chrome: Staffing Manager · Robert Half shows the proposal with Yes / Edit.
- Seen: Elias Custom Metal Fabrication (small firm) also got a proposal, "manufactures custom metal products",
  read from the name rather than known. Open, for the owner.
