# Simplify skills implementation plan

**Goal:** Remove skills reference functionality and block all profile changes during improvement and saving.
**Architecture:** Skills responses contain labels, categories, importance and cleanup input IDs. DocumentController owns the mutation lock across views; the skills operation alone may update its receipt and commit inventory.
**Tech stack:** TypeScript, React, Node test runner, Vitest.
**Spec:** User-approved exploration and implementation request in this conversation.

- [x] Add failing tests for reference-free extraction, structural cleanup and editing/undo locks through saving.
- [x] Remove evidence generation, validation, storage, source UI and unused helpers; retain old-profile read compatibility and shared import metadata.
- [x] Update ranking and job tailoring to work without origin labels.
- [x] Enforce the lock in document state, mutation handlers and controls, including recovery, navigation and delayed responses.
- [x] Update obsolete tests and documentation; run API/web tests, typechecks, build and live read-only doctor.

Review focus: historical profiles; unknown cleanup IDs; omitted input preservation; pending save failures; navigation and Undo during a request.

## Verification completed

- API suite: 553 passed.
- Full frontend sweep: 874 passed; one job-navigation fixture failure remained. Corrected that fixture to contain an already self-contained saved job document (including no nameParts), then reran all journey, modal and improvement tests: 36 passed. The earlier modal timing assertion now waits for its rendered next screen.
- Imported-skills and import-review regressions after removing the remaining source controls: 43 passed.
- Workspace typechecking, production web build, API dry-run build and git diff --check passed.
- Playwright on the existing managed server, synthetic in-memory profile: desktop/mobile checks passed for generation/save locks, disabled Undo, blocked history navigation, removed source controls, successful save release and Undo. No browser errors or framework overlay. Browser plugin unavailable.
- Independent code review identified a prerequisite-language deadlock; fixed with readiness gating and regression coverage. Reviewer verified the correction.
- dev:doctor confirmed this checkout's managed service, single import worker and session route. Hosted AI latency and persistence were not exercised; no live speedup is claimed.
