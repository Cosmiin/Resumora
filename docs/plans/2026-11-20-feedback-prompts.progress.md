# Progress: owner feedback of 20 Nov, two prompt fixes

## Task 1: A role without a description needs no warning — done
## Task 2: The tools step offers only tools — done
session: feedback-prompts · builder: claude
commit: (this commit) (base 53efc86) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: Task 1 not proven by the real-AI check: a made-up Word-style CV did not get the warning even on the old prompt (3 runs). The 12 eval CVs are unchanged (2 runs; 08 fails before and after).

Real-AI check (not committed, 3 runs old vs new): tools suggested for two HR roles had 2–6 non-tools per run on the old prompt (KPI Framework, Operations Audits, Compensation Benchmarking, Client Intake…) and none on the new one. Two of the three new runs listed only the 3 tools the roles name (no usual ones added); the third listed 16.
