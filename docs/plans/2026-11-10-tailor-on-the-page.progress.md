# Tailoring "On the page" · progress

Plan: `2026-11-10-tailor-on-the-page.md` · feature id `tailor-on-the-page`
Owner's pick: variant A · Margin notes (2026-11-10, in chat; no comments).

## Status
- 2026-11-10: plan written. Build not started.
- Waiting on: enrichment Task 2 commit on `feat/enrich-guided-flow` (estimate 1–1.5 h from 2026-11-10 ~21:30; its Task 1 is in its last fix round). The enrichment session will message the sha. Then: `git worktree add ../resumora-tailor-page -b feat/tailor-on-the-page <sha>`, check `tokens.css` / `focus.css` names against the plan, start Task 1.
- Agreed with the enrichment session: stack at its Task 2 commit; its Task 3 doesn't touch our files. Its Task 2 makes `.page-*` classes generic (colour from `data-section`); our plan uses them. Every `[data-section]` element gets `--sec`, `--sec-tint`, `--sec-ink`, `--sec-mark` (plan Task 1 uses them). Enrichment's Task 2 brief keeps `fm-bullets`, `fm-bullet`, `is-current`, `fm-tag` looking as today outside `.focus-mode`. RolePanel depends on `fm-bullets`, `fm-bullet`, `is-current`, `fm-tag` until our Task 2, then on `.page-sheet`, `.page-mark`, `.page-bar`, `fm-tag`.

- 2026-11-10 ~21:45: owner asked to build in parallel instead of waiting. Branch `feat/tailor-on-the-page` from origin/main (b81ff3d), worktree `resumora-tailor-page`. Tasks build against the agreed shared names (not on this branch yet); when enrichment Task 2 is committed, merge `feat/enrich-guided-flow` into this branch, check names, then the visual check.

## Lanes
| lane | worktree | tasks | current task | last commit | last step |
|---|---|---|---|---|---|
| 1 | resumora-tailor-page | 1–5 | done | 953a344 | browser-checked; waiting for owner (push/PR) |

## Rulings
- Task 1 risk check (2 of 2 kept): data-section must follow what the screen shows (back / role answers / redo screens), not only `run.currentSection`; no ✓ when `current === null` before the run starts. Both written into the brief as tests.
- Per-guess Keep / Edit / Remove inside the role review (shown in the mockup) is out of scope: today guesses go to the guided review. Owner can ask for it as a separate change.

## Task 1: Section colours, bookmark tabs, page layout — done
commit: badc03f · tests: light (711 pass, typecheck pass) · codex: risk 90s, build 255s, review 58s · codex tokens: ~1.05M (mostly cached) · fix rounds: 0 · guard denials: 0
risk: 2 kept of 2 found · lesson: none
open: colours not visible until enrichment Task 2 is merged (shared `--sec*` / `.page-*` names)

## Task 2: Experience question on the page, note card with "the job asks for" — done
commit: fe726a8 · tests: normal (938 pass, typecheck pass) · codex: risk 63s, build ~5 min, review 64s · fix rounds: 0 · guard denials: 0
risk: 1 kept of 1 found (RoleHeading is shared with RoleReview; left unchanged) · lesson: none
open: none. Told the enrichment session RolePanel now uses only .page-sheet/.page-mark/.page-bar + fm-tag.

Task 3 risk: 1 kept of 1 (missing file TailorFlow.tsx: `wide` only for questions; added to scope with a test).

## Task 3: Experience review in place on the page — done
commit: 8de4a5e · tests: light (731 pass, typecheck pass) · codex: risk 74s, build + 1 fix round, review 76s + 50s · fix rounds: 1 · guard denials: 0
risk: 1 kept of 1 found · lesson: P14 (unchanged proposal shown struck and inserted)
open: none

## Task 4: Role done and tailoring done, with a stamp — done
commit: aca674c · tests: light (751 pass, 1 file retried; typecheck pass) · codex: risk 66s, build, review 66s · fix rounds: 0 · guard denials: 0
risk: 2 kept of 2 found (flow-phase.ts missing from scope; no-item fallback would change behaviour, dropped) · lesson: none
open: none
Ruling: stayed in this session for Task 5 instead of a fresh one after 4 tasks (one task left, context small).

## Task 5: Skills and Summary on the page — done
commit: ad8d25a · tests: light (742 pass, typecheck pass) · codex: risk 111s, build 178s + 1 fix round, review 90s + 55s · fix rounds: 1 · guard denials: 0
risk: 1 kept of 1 found (tailor-flow.test.tsx:205 query matched page + note) · lesson: none new (P14 variant: an unchanged text still has to render the user's guess choices; added to the brief)
open: none

## End of run
- Whole-branch review + bug hunt (heavy) running against b81ff3d.
- Full tests (`-Level full`) deferred until enrichment Task 2 is merged into this branch, so they run once on the combined code.
- Whole-branch review 1: verdict fix, 4 findings. Kept 1: dead `celebrated` prop on TailorMoment (fix round running, fix-only review, base ad8d25a). Dropped 3 as plan decisions: requirement text only from `nameOf(gap, job)` (no score fallback); Skills questions get no `page-note` (no page to point at); `.tailor-mode .tailor-card` border/eyebrow rules are how Task 1 styles cards in components it couldn't edit.
- Bug hunt (heavy): no findings.
- Re-review decision: fix-only review is enough (one local file, no shared type or behaviour other tasks use).
- Fix committed c4c355a (fix-only review: pass). Whole-branch review: done.
- Waiting: enrichment Task 1 committed (256211c); its Task 2 (tokens + .page-* styles) not yet. Next: merge feat/enrich-guided-flow at Task 2, check names, `-Level full`, browser check.
- Owner asked: do the merge automatically. Enrichment session asked to SendMessage the Task 2 sha (and any renamed shared names). On that message: merge at the sha, check names, `-Level full`, browser check, report. No push/PR without the owner.
- Merged enrichment Task 2 (dd9e83e) → 2fad33b, no conflicts. Shared names all present (--sec*, .page-*). Full tests: PASS (2412) + typecheck.
- Browser check (owner's Chrome, local DB, existing run on the ELTECHIM job, nothing answered or accepted): role review renders as designed. Found the step tabs rendering as an overlapping numbered list (shared `.page-tabs` styles only `> span`); fixed in tailor.css → 953a344 (review pass). Not reachable without advancing the owner's run: question screen, stamp, skills, summary.
- Content issue seen (not this build): the role rewrite added "CRM (Salesforce, HubSpot)", tools not in the CV, not marked as a guess. Breaks the owner rule "never guess tools". API / prompt side; follow-up.
- Dev server: main checkout's server stopped; this worktree runs on 5173/8788 (terminal tab "tailor-page dev").
- Enrichment finished (c445716) merged → 647b300, no conflicts. Full tests PASS (2436) + typecheck. Dev server restarted on the merged branch (http://127.0.0.1:5173, API 8788, local DB, tab "tailor+enrich dev") so the owner can test both redesigns on one server; URL sent to the enrichment session.
- Note: opening the existing run during the browser check made the app re-run its Experience section (POST .../sections/experience/run, normal resume behaviour); nothing was answered or accepted.
- The branch now carries both redesigns; a PR from it includes the enrichment work too.
- Owner approved push + PR in this session. Pushed feat/tailor-on-the-page; PR https://github.com/Cosmiin/Resumora/pull/58 (base feat/enrich-guided-flow, merge after #57). CI: 1 check pending at open.
