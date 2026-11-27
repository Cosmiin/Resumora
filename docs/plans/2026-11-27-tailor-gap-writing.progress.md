# Progress: tailoring writes only for what is missing

## Task 1: A role step is sent only the open gaps — done
session: Shorten the tailoring flow · builder: claude
commit: 18b3a77 (base cf0e063e) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

Rulings:
- **A job with no Base score.** Its role steps still get `requirements` and `responsibilities`, but the prompt now speaks of `job.gaps`. The gap rule therefore says: a job with "requirements" and no "gaps" list, treat each requirement as a gap.
- **"Reorder each role's bullets".** That line only ever ordered the proposals returned, and it nudged the model to return every bullet. It now reads "Return the proposals with the most relevant bullet first", for roles and volunteering.
- **Projects.** "Reword its description and at most two bullets toward the job's exact keywords" became "…at most two bullets, each for a gap it shows". The project's own keyword rules (same thing in other words, never a different tool) stay.

## Task 2: Nothing unconfirmed goes into a role line — done
session: Shorten the tailoring flow · builder: claude
commit: 8ca92cd (base 18b3a77) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

- The review passed with one low finding, fixed before the commit: a guess the model lists but that is not in the line word for word could not be checked, so one confirmed phrase could carry it through. Such a line is now dropped too.
- Rulings: the role prompt still asks the model to mark what it inferred and says a marked line is discarded (telling it to mark nothing would hide guesses). A dropped guess is logged, not counted in `removed` ("claims your CV doesn't back up" stays for failed truth checks).
- Existing tests that pinned the old behaviour (a role guess kept with its `inferredParts`) were rewritten to the new rule.
- In the full run two website speed tests timed out (`editor.test.tsx`, `jobs-page.test.tsx`); both pass alone, and the change does not touch the website.

## Outside the plan's files: the eval stores the Base score
`apps/api/eval/tailor/run.ts` now saves Score 1 as the job's Base score before tailoring starts, as the site does. Without it the eval's role steps would take the "no Base score" path and never exercise the gap list.

## Whole-branch review — pass
One low finding, fixed in 66d74ab: the verb folding turned "added" into "ad" and left "using" alone, so an answer with those forms did not confirm the line. The fix was reviewed on its own.

cost: reviews 4 agents (one per task on Sonnet, the whole branch and the fix on Opus) · guard denials 0 · real-AI runs: 4 evals and 3 probes, under $1 in all (estimated from the eval cost column).

## Trial with the real AI (27 Nov)

`npm run eval:tailor`, 6 fictional pairs, no questions answered.

| | Before (main, cf0e063e) | After (this branch) |
|---|---|---|
| Invented facts | 0 | 1 flag in 2 of 2 full runs, a false alarm (see below) |
| Average Score 1 → 2 lift | +7.7 | +0.3 to +2.0 (3 runs) |
| Pairs meeting the bar | 4 of 6 | 4 of 6 and 5 of 6 |

The lift numbers cannot be trusted either way: the score itself moves between runs of the same CV and job. The weak-support pair scored 39 / 44 / 59 on main, and 0 / 0 / 0 and 59 / 59 / 59 in two later runs; the long-career pair scored 61 / 61 / 61, then 100 / 100 / 93, then 61 / 61 / 93. That is the scoring step, which this plan does not touch. It needs its own look.

What the role steps did, read role by role (a temporary probe, not committed):

- **Long career (6 roles, 48 lines), 2 open gaps ("incident response", "hiring").** 3 lines changed in the 2 newest roles, each a thing the line already said in other words ("Coordinated the response to an… incident" → "Coordinated the incident response to…"; "recruitment interviews" → "hiring"). The 4 older roles: untouched. Score 61 → 94, no gap left.
- **Matching accountant (RO), no open gap.** No model call for either role; nothing changed.
- **Weak support CV, 4 open gaps.** The one line the model proposed was a guess and was dropped; nothing changed.
- **Teacher switching to product analysis, 3 open gaps.** 3 guessed lines dropped; nothing changed.

So without answers the CV changes only where it already says the thing. The gaps left open are what the questions are for.

The "invented fact" flag: `tool: Experience` on the long-career pair. A probe traced it to the headline step, which proposed "Engineering Manager with Backend Product Development Experience"; the eval reads the capitalised "Experience" as a tool name. No tool was invented, and no role line carries it. The headline step does not read the score or the gaps, so this plan does not cause it; main can produce the same headline. Worth a small fix to the eval's check (a headline in title case) in a later plan.
