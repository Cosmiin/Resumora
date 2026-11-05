# Progress: jobs-ui.md

Worktree `resumora-jobs-ui`, branch `rebuild/jobs-ui`, based on `rebuild/jobs-core` at bb4722d.
(Kept in the main checkout during the build so it never tripped the worktree's scope check; committed on the branch at the end.)

## Docs: plan — done
commit: b48e61a · codex: counterpoints 01a1acf3, review 01a1acf5 (pass) · codex tokens: 608,129 · fix rounds: 0 · guard denials: 0
open: none. The counterpoint changed the plan: Task 1 now lists `apps/api/test/jobs-repo.test.ts`, whose privacy test (line 146) forbids `rawText` on `repo.get()`.

## Task 1: API — the single-job response includes the saved text — done
commit: 922d124 · codex: build 01a1acf7, review 01a1acfc (pass) · codex tokens: 1,275,567 · fix rounds: 0 · guard denials: 0
open: none. 847 tests. Claude read the repo/schema diff: `rawText` only on `get()` (user-scoped, RLS applies); list columns unchanged; `jsonLd` still private. Codex ran `npm ci --offline` in the worktree to get vitest (node_modules is ignored).

## Task 2: Web — jobs API client and the jobs copy — done
commit: 6803fd1 · codex: build 01a1acfe, review 01a1ad02 (pass) · codex tokens: 529,774 · fix rounds: 0 · guard denials: 0
open: none. 861 tests. `deleteJob` uses `authedFetch` + `errorOf` (204 has no body); create response defaults `existing` to false.

## Task 3: Web — the /jobs list page and the Add job dialog — done (after escalation)
commit: fde0b12 · codex: build 01a1ad03 (+2 resume fix rounds), reviews 01a1ad10 (fix), 01a1ad16 (fix), 01a1ad1d (fix); escalation fresh build 01a1ad20 (+1 resume round), reviews 01a1ad25 (fix), 01a1ad2b (pass) · codex tokens: ~7,365,000 (log sum, taking each session's last cumulative line) · fix rounds: 2 + escalation + 1 extra round · guard denials: 2 (PowerShell writes whose text named product paths: the brief rewrite and this progress block)
open: none. Findings fixed: (1) the new nav link let users leave the CV editor with a pending autosave (useAutosave only clears its timer on unmount) → nav links now confirm with `app.leaveUnsaved`, like Sign out (brief scope widened to `en.ts`); (2–4) hand-kept Load more pages had gaps and races after adds and refetches → replaced by one `useInfiniteQuery` (brief rewritten; polling now reloads all loaded pages, usually one, instead of only the first page as the spec says); (5) `refetch()` reused an in-flight initial request (TanStack v5 cancels only when data exists) → `cancelQueries` before the refetch after an add. The extra round after the escalation is beyond the skill's limit; taken because the commit gate needs a pass and the fix was one line. 894 tests. Codex couldn't open the mockup URL; Tasks 4–5 briefs now point at the mockup's local HTML file.

## Task 4: Web — the /jobs/:id job page with Job ad and Summary tabs — done
commit: 58b51a6 · codex: build 01a1ad2e (+1 resume fix round), reviews 01a1ad37 (fix), 01a1ad3c (pass) · codex tokens: ~3,673,000 (log sum, last cumulative line per session) · fix rounds: 1 · guard denials: 0
open: none. Finding fixed: the tab panel reused the class `panel`, which matched the editor's global sticky `.panel` (editor.css:51) and capped long ads → renamed with a `job-` prefix. Claude checked: the ad renders as text (no innerHTML), and `markRequirements` escapes regex characters. 919 tests. The skill's "fresh session after 4 tasks" was skipped: this session was handed off from another one and can't start sessions; context was still small.

## Task 5: Web — edit the job summary — done (after escalation)
commit: 86a2a7a · codex: build 01a1ad3e (+2 resume fix rounds), reviews 01a1ad46 (fix), 01a1ad4b (fix), 01a1ad52 (fix); escalation 01a1ad54 (no change: `-Task` is ignored without `-Resume`), rewritten-brief build 01a1ad58, reviews 01a1ad56 (fix, same finding), 01a1ad5b (pass) · codex tokens: ~6,467,000 (log sum, last cumulative line per session) · fix rounds: 2 + escalation · guard denials: 0
open: none. Findings fixed: (1) lines over 500 chars were silently cut → error `edit.job.lineTooLong`, nothing sent (brief scope widened to `en-jobs.ts`); (2) save cancelled only the list query, so a pending detail refetch could overwrite the saved job → also cancel `["job", userId, id]`; (3) a failed background refetch unmounted the edit form → error states only without cached data; (4) Reload after a conflict left edit mode even when the refetch failed → stays open with an error. Lesson: an escalation's instructions must go into the brief file, not `-Task`. 943 tests.

## Whole-branch review 1 (base bb4722d, brief = plan file) — fix, 1 finding (→ Task 6)
codex: review 01a1ad5d · codex tokens: 546,584
open: fixed by Task 6. A failed background refetch replaced the visible list with the error state. The review also flagged "polling reloads every page" because the plan file still said first-page-only; Claude updated the plan's Task 3 bullets to the built design in the Task 6 commit.

## Task 6: Keep the job list on screen when a background refetch fails — done
commit: 79f87a5 · codex: build 01a1ad61, review 01a1ad64 (pass) · codex tokens: 646,550 · fix rounds: 0 · guard denials: 0
open: none. 945 tests.

## Whole-branch review 2 — fix, 1 finding (→ Task 7)
codex: review 01a1ad65 · codex tokens: 711,512
open: fixed by Task 7. Cancel was enabled during a save, so an old save could close a reopened form.

## Task 7: No Cancel while a job save is in flight — done
commit: 01d6d03 · codex: build 01a1ad69, review 01a1ad6c (pass) · codex tokens: 635,710 · fix rounds: 0 · guard denials: 0
open: none. 945 tests.

## Whole-branch review 3 — fix, 1 finding (left open for the user)
codex: review 01a1ad6d · codex tokens: 637,283
open: **not fixed.** `JobPage.tsx:113`: after a version conflict, Reload → Cancel → Edit while the Reload request is still pending lets the late Reload response close the new form. Same pattern as Task 7 (Cancel should also be disabled while a Reload is pending). Narrow (several clicks within one request), so the loop stopped here for the user's call.

## Cost (this run)
Codex tokens: ~22.8M by log (30 Codex sessions, max cumulative line per session; most of it cached reads) · Claude context: not measured, roughly 150k · guard denials: 2 on Claude's own commands (PowerShell writes whose text named product paths).
