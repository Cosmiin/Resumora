# Progress: two notes from the owner's re-run

## Task 1: The skills step never gives two skills the same name — done
session: Shorten the tailoring flow · builder: claude
commit: 22b3665 (base 42aae676) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

- The prompt rule about a tool's own name overlaps with the skill-naming picks of 26 Nov (another thread, not built yet). Only what the owner's note needs was added: no two skills with one name, a tool's name is not replaced by a category. The comparison is the one those picks chose (case, accents, hyphens and spaces don't count).
- It does not clean a CV already tailored with a doubled skill.

## Task 2: "No, but I used something similar" is one tap — done
session: Shorten the tailoring flow · builder: claude
commit: see the log (base 22b3665) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: the two "No" answers now lead to the same result; merging them is the owner's call.

Rulings:
- **One more file.** `apps/api/src/tailor/questions.test.ts` holds the unit test of `acrossNote`, so the new null case went there (the brief named `test/tailor-questions.test.ts` only).
- **The roles are not asked either.** The owner's words were about the tool. Without a tool's name nothing true can be written and nothing attaches to a role, so ticking roles would have had no effect.
- The changed question screen was checked by its component test, not in a browser.

## Whole-branch review — pass
One low finding, fixed: the name check ran on each model reply on its own, so a retried rename could take the name a first-reply rename already had. It now also runs once over the final list, after the retry is merged in. The fix was reviewed on its own.

cost: reviews 4 agents (one per task on Sonnet, the whole branch and the fix on Opus) · guard denials 0 · no real-AI runs.
