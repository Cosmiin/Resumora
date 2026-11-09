# Feedback round 1: progress

Branch `fix/feedback-round-1`, worktree `../resumora-feedback-1`, base `7dde331`.

## Task 1: Voice box: no OpenAI line, Latin-only transcripts, fade-in — done
commit: c1646cb · codex: build 01a1b1ed, review 01a1b1fa · codex tokens: ~2.86M (mostly cached) · fix rounds: 1 · guard denials: 0
open: scope check flagged 199 changed lines vs 180 limit (extra lines are tests in the listed test file); accepted.

## Task 2: CV page: score pill beside the title, panel docked to the CV — done
commit: fa8ed85 · codex: build 01a1b1fb, review 01a1b20d · codex tokens: ~3.3M (mostly cached) · fix rounds: 2 + 1 escalation · guard denials: 2 (shell commands whose text named product paths; redone with Edit / a plain commit)
open: plan listed the wrong file (the pill lives in the role item under cv/edit/sections); kept ScorePill's existing aria-label instead of "Role score 84"; docking applies above 900px (the existing breakpoint), no 1100px rule.

## Task 3: Scorer score/3: role questions and options on every question — done
commit: ea42da5 · codex: build 01a1b20e, review 01a1b220 · codex tokens: ~4.6M (mostly cached) · fix rounds: 2 (one restarted after a brief edit failed) · guard denials: 0
open: files list widened (six web test fixtures, enrich-focus.ts for mergeGrades). Answered role questions are filtered on read in scoreRole; notes are not in the fingerprint.

## Task 4: API: nextQuestion from improve-bullet; brain dump from role answers — done
commit: 704aa20 · codex: build 01a1b223, review 01a1b22d · codex tokens: ~2.2M (mostly cached) · fix rounds: 1 · guard denials: 0
open: files list widened (enrich-focus.test.ts, web enrich-api.test.ts). nextQuestion defaults to null when missing (deploy skew).

## Phase break after Task 4
Tasks 5 and 6 (web focus flow) continue from base 704aa20. Briefs: extract from the plan as for tasks 1-4, and widen the files list for any test that builds focus-session state.

## Task 5: Web: role step first, up to 3 questions per bullet — done
commit: 2f1e810 · codex: build 01a1b232, review 01a1b254 · codex tokens: ~9.3M (mostly cached) · fix rounds: 2 + 1 escalation · guard denials: 0
open: files list widened (focus-mode.test.tsx, enrich-api.test.ts). Empty roles are scored on demand when focus mode opens (useRoleScores still skips them in the background). Reviews found three free-talk-return edge cases (skipped bullets re-offered, stale questions, a 4th question); the escalation routed every bullet-question transition through one helper with a per-bullet budget.

## Task 6: Web: free-talk link and role-aware free-talk screen — done
commit: 55e5a08 · codex: build 01a1b256, review 01a1b25e · codex tokens: ~2.15M (mostly cached) · fix rounds: 0 · guard denials: 0
open: files list widened (FocusMode.tsx, focus-session.test.tsx). Task 5 had already added the link string and return path; this task reused them. Empty-part fallbacks chosen by Claude: "What did you handle in this role?" / "Who relied on you there?".

## Whole-branch review (base 7dde331) — fix, findings open
review: 01a1b260 · codex tokens: ~0.61M · brief: plan wrapped with a scope block listing all 37 changed files (the plan file alone has no top-level scope block, so codex-ask refused it)
- useFocusSession.ts:55 [high] question history is per bullet, so a `nextQuestion` can repeat a role question or an earlier bullet's question in the same session (Review Focus 3 says "already asked in this session"). Confirmed by Claude.
- useFocusSession.ts:93 [high] reopening focus after answering role questions (no bullet change) reuses the cached `roleQuestions`; answered ones are filtered only server-side on rescore, which a notes-only change doesn't trigger, so answered questions show again. Confirmed by Claude.
Not fixed: left for the original session / user to decide (one more codex-build round on Task 5's files).

## Cost
Codex tokens: Tasks 5–6 + branch review ~12.1M (Task 5 ~9.3M, Task 6 ~2.15M, branch review ~0.6M); whole branch with Tasks 1–4 ~25M, nearly all cached. Claude context: one session for Tasks 5–6, modest (briefs and summaries only, no product-code reads beyond spot checks). Guard denials: 0 in Tasks 5–6; 2 across the branch (Task 2).

## Task 7 (added): never repeat a question — done
commit: a58c8f6 · codex: build 01a1b539, review 01a1b540 · codex tokens: ~1.71M (mostly cached) · fix rounds: 0 · guard denials: 0
open: fixes both whole-branch review findings with one session-wide asked-question set, seeded from the role's saved answers. Decided with the user: skipped questions are not saved and may come back on a later visit. Whole-branch review not re-run after this fix.
