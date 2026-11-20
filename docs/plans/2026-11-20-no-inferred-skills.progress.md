# Progress: import takes skills only where the CV lists them

## Task 1: Skills only from where the CV lists them — done
session: no-inferred-skills · builder: claude
commit: (this commit) (base 12a107b) · reviews: 1 (agents) · fix rounds: 2 + 1 escalation · guard denials: 0
open: import eval case 08-odd-headings still fails on field accuracy (93.5%, was 90.6% and a section fail before this change).

Real-AI check (not committed):
- Made-up CV with no skills section, built like the live one: old prompt 33–42 skills (3+2 runs), new prompt 0 (3 of 3).
- Made-up CV with a Skills section and a "Tools:" line under a role: old 9 of 9, new 9 of 9, nothing extra (3 of 3).
- The 12 eval CVs, 3 runs before and 2 after: same or better in every case; 08 fails before and after.
