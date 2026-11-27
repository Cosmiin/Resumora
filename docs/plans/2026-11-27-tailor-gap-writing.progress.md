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
