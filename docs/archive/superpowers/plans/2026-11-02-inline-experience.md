# Inline experience improvement implementation plan

> Historical record. This is not the current specification or an active task list. Start with [the current handoff](../../../HANDOFF.md).

User selected comparison option 1 (exec-8d9701a1-29db-4fb2-a9a8-04836d0aca2c.png), adding small contextual hints and examples. Implement in the existing worktree, preserving unrelated edits.

1. Add regression coverage for an inline question under the selected point, stable right-side guidance, preserved answers on switching points, and optional examples that never populate answers.
2. Update GuidedRoleOverview to render children beneath the active point, make points keyboard-selectable, keep actionable guidance visible, and remove redundant overview copy. Keep unscoped questions/actions in the left column.
3. Update AnswerHint with a compact hint and optional illustrative example per question dimension. Preserve provider hints and truthful-evidence guidance.
4. Update GuidedExperience/useGuidedExperience so explicit final-answer submission requests the proposal using the newly confirmed evidence. Skipping does not generate. Preserve persistence, recovery, preview and explicit acceptance boundaries.
5. Style desktop 70/30 layout and responsive stacking. Verify focused regression tests, web typecheck and full frontend suite. Verify browser at desktop/mobile with synthetic data and no provider calls. Document outcome.

Review focus: pending requests cannot select a second point; answer is confirmed before rewrite fingerprint; no draft CV changes before acceptance; examples are display-only; mobile scroll/focus remains usable.

## Verification outcome

Implemented and reviewed. 26 focused tests, 671 full frontend tests, and web TypeScript passed. Desktop/mobile Chromium journeys passed with synthetic responses, including lower-point scrolling. Review findings for unscoped question placement and scroll reset were reproduced then fixed. Temporary browser harness removed. No deployment or live paid inference performed.
