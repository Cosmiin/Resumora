# Progress: tailoring in three screens (steps 2 to 4)

## Task A1: A step can be written straight into the tailored CV — done
session: Shorten the tailoring flow · builder: claude
commit: see the log (base 4fd9ed4) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

- `acceptSection` now calls a new `mergeStep` (the part that applies a step's proposals and builds its review state); the order of scoring, saving and notes is unchanged, and the accept, redo and light-section tests pass as they were.
- The layout step's proposals moved into `layoutProposals`, used by the old route and the new one.
- Ruling: a role written again starts from its Base wording (as a redo does), so writing a step twice gives the same CV as writing it once. Skills written twice are not reset; renames are applied over the tailored names.

## Task A2: One request finishes the run and scores once — done
session: Shorten the tailoring flow · builder: claude
commit: see the log (base 7619106) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

- Ruling: `finishRun` lives in `write-step.ts` beside `writeStep`, and its tests in `tailor-write-step.test.ts` (the plan first named `accept.ts` and a test file of its own); the plan's scope block was updated.
- The review passed with one low finding, fixed before the commit: a step saved while the score was being worked out would have been marked as scored. Finish now checks the CV's version after scoring and answers 409 instead, leaving the run open.

## Task A3: One request asks about every gap, with the roles it may fit — done
session: Shorten the tailoring flow · builder: claude
commit: see the log (base 41a61d3) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

- Ruling: the note saved for a ticked role stays "Used <short name>", also for a practice that is not a tool. The plan's idea of another wording for those was dropped: it added a rule for no gain the trial could show.
- The same requirement categories as the all-roles questions are asked (skill, experience, other); a missing degree, language or certificate is not a row, since no role can be ticked for it.

## Part A: whole-branch review — pass, no findings

## Part A: trial with the real AI (27 Nov), and two fixes it led to
A temporary probe (not committed) ran the new path on two fictional pairs: every gap asked in one call, every step written at the same time, one score at the end. The probe ticked each suggested role and said no to the rest.

| Long-career CV (6 roles, 11 steps) | First run | After the fixes |
|---|---|---|
| Questions | 2, in 1.9 s | 2, in 1.3 s |
| All steps written at once | 5.5 s | 8.0 s |
| Headline and order | 1.3 s | 1.5 s |
| One score | 3.1 s | 2.6 s |
| Score | 61 → 90 | 61 → 100 |

Run from the build machine against in-memory storage: live timings will differ. Both questions came with the role that hints at them and the CV's own words ("Coordinated the response to an account-permissions incident"). No step's changes were lost when all were written at once.

Fixed after the first run (commit after 40ecad7, reviewed on its own, no findings):
- **A line sent back as it stands is no change.** Of 7 role "changes" stored, 6 had the Base wording. Such a proposal is now left out before the checks, in every section. Nine existing tests fed unchanged wording as a proposal; their fixtures now send a changed wording and assert the same things.
- **Questions that ticking roles can answer.** One read "Which helpdesk software have you used for reporting?". The prompt now asks for "Did you" or "Have you".

Still true: the score moves between runs of the same CV and job (the weak-support pair scored 59, then 0), so score lifts say little.

cost: reviews 5 agents (three tasks on Sonnet, the whole branch and the trial fixes on Opus) · guard denials 0 · real-AI runs: 3 probes, well under $1.

## Tasks B1 and B2: the questions screen, and one wait — done
session: Shorten the tailoring flow · builder: claude
commit: see the log (base 544d8bd) · reviews: 2 (agents) · fix rounds: 1 · guard denials: 0
open: neither is wired into the flow yet (Task B4); the site keeps the old flow until then.

- The two tasks were built and reviewed together. The first review asked for fixes: an error nothing can fix (job deleted, Base CV replaced) did not stop the other workers from starting further steps, and the screen used `t` where new screens use `useT`. Both fixed; the second review found nothing.
- Part B of the plan was rewritten to the order it is built in: the screens first, each with its tests, then one task that wires them in and removes the old ones.
- Rulings: suggested roles are shown first and marked, never ticked for the person (a tick is their statement and is what gets written). "No" replaces "No, and nothing similar" on this screen. A run left during the wait runs the wait again when opened, instead of continuing from the steps not yet written.

## Task B3: The final page — done
session: Shorten the tailoring flow · builder: claude
commit: 45f8844 (base 9cdb696) · reviews: 1 (agent) · fix rounds: 0 · guard denials: 0
open: none

- The layout step written with `steps/write` proposes the headline and leaves it for the person; a headline that holds the CV's other title drops that title wherever a headline is applied. The review route learned the headline, the section order, and the order and hidden items of the lighter sections.
- `ChangesList` shows every change with the person's wording and the new one, each with its way back; `DoneScreen` shows it with the PDF and Word downloads in the saved template.
- Rulings are in the plan under the task.

## Task B4: The flow uses the new screens, and the old ones go — done
session: Shorten the tailoring flow · builder: claude
commit: 4e610c2 and the fix after it (base 45f8844) · reviews: 2 (agents) · fix rounds: 1 · guard denials: 0
open: a gap ticked for a role with no line that can carry it ends as an added skill only (the new line for a confirmed gap is the next plan)

- `/jobs/:id/tailor` is three screens: every gap on one screen, one wait, the final page. The role-by-role room, its question cards and its reviews are gone with their tests, 134 copy keys per language and their style rules (about 3,400 lines removed).
- The first review found that an all-roles answer sent again with other roles ticked left the new role without its note; fixed in `saveAnswers` with a test. Before that, building "Change my answers" showed that a role which lost its tick kept the note of the earlier yes, so the writer still read it; a write step now leaves such notes out for its run.
- Run on the local stack with real AI (the owner's test job, 13 parts): questions in about 5 seconds, the wait about 15 seconds, one score about 6 seconds. Fixed from that run: the final page was not centred, the downloads sat under the list, the wait said nothing while the match was worked out.

## Part B: whole branch — done
reviews: 1 whole-branch (Opus) and 2 of its fix (Opus) · fix rounds: 2
- The whole-branch review passed with one low finding: the questions could be shown without the roles to tick when the Base CV failed to load. Fixed for the first visit; the review of the fix found the same hole behind "Change my answers"; fixed too, second review of the fix passed.
- Merged with main before the review (the enrichment work of another thread; no file in common).

cost: reviews 6 agents (3 on Sonnet, 3 on Opus) · guard denials 0 · real-AI runs: 2 tailorings of one job on the local stack, well under $1.
