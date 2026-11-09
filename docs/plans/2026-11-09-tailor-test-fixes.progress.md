# Tailoring: fixes from the owner's manual test (F1–F6) · progress

Branch `rebuild/tailor-test-fixes` (worktree `resumora-tailor-fixes2`), stacked on `rebuild/tailor-polish` (base 06c6958).
Findings and the owner's decisions: `C:\Users\mcosm\claude\resumora\tailoring-test-findings.md`. Claude mode (claude-build).

## Task F6: score survives a bad keyword label — done
session: tailor test fixes · builder: claude
commit: c580eab (base 06c6958) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 39% → 39%
open: none

## Task F1: fluent/advanced language requirements — done
session: tailor test fixes · builder: claude
commit: fdad0ac (base c580eab), plus the "language requirements only" fix commit after 192d121 · reviews: 1 + branch review + 1 fix review · fix rounds: 1 · guard denials: 0 · weekly 39% → 39%
open: the branch review found the rule also fired on non-language requirements ("Advanced English and Excel skills"); fixed to category "language" only.

## Task F2: clear work evidence counts in full — done
session: tailor test fixes · builder: claude
commit: d832f73 (base fdad0ac) · reviews: 1 (with F5 server) · fix rounds: 0 · guard denials: 0 · weekly 39% → 39%
open: prompt only, per the owner's answer; owner may want a code rule after re-testing.

## Task F3/F4/F5: role first on questions and Experience review; Skills explained — done
session: tailor test fixes · builder: claude
commit: 192d121 (base d832f73) · reviews: 2 (agents) · fix rounds: 1 (skills schema `default` removed: strict output rejects it) · guard denials: 0 · weekly 39% → 39%
open: owner to re-check whether Experience rewrites feel specific to the job now that the screen is readable.

## Cost
Weekly usage 39% at start and end. Review agents: 4 Sonnet (per task) + 2 Opus (branch review and fix review). No auth, RLS or migration changes.
