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
