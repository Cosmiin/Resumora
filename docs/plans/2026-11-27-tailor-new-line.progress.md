# Progress: a new line for a gap the person ticked

## Tasks 1 to 3 — done
session: Shorten the tailoring flow · builder: claude
commit: see the log (base 8720b1b) · reviews: 3 (agents: 1 on Sonnet, 2 on Opus) · fix rounds: 1 · guard denials: 0
open: when the retry of a flagged new line also sends a line for a gap that a rewording of the first answer already names, both stay (the last review's low finding; it needs the writer to add a line it was not asked to fix)

- Built together: the writer is told which gaps the person ticked the role for (`confirmed`) and may add a line (`new-bullet`) when no line can carry one; the checks hold a new line to the role's own words and the question's; the tailored CV gets it as `new-bullet:<roleId>:<n>`; the final page shows it with Remove.
- From four runs on the local stack with the real AI (the owner's test job): naming the confirmed gaps to the writer was enough for it to reword fitting lines in most runs; a new line came when no line fitted ("Used prompt engineering."). One run squeezed the gap into a list of other work, one left the role as written. Hence the rule against squeezing, and the second ask for a ticked gap nothing names.
- Task 3 came from the same runs: a skill was renamed to an unrelated name ("Anthropic Claude" to "Prompt Engineering"). A rename now has to keep a word of the skill's own name.
- The first two reviews both found that the second ask could add a second line for a gap the first answer had covered; fixed, with three smaller points (two-letter gaps, a full role, an added line reworded since). The review of the fixes passed.

cost: reviews 3 agents · guard denials 0 · real-AI runs: 4 tailorings of one job on the local stack, well under $1.
