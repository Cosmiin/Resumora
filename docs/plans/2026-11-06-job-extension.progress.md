# Progress: 2026-11-06-job-extension.md

Worktree `resumora-job-extension`, branch `rebuild/job-extension`, based on `main` at 7dde331.
Briefs put the task section first (its `---` scope block must be the file's first `---`), then the plan header without its divider.
Kept in the main checkout during the build so it never trips the worktree's scope check; committed on the branch at the end.

## Docs: plan — approved by the user
codex: scout 01a1b1c6 (code facts), counterpoints 01a1b1cc · codex tokens: 671,654 · guard denials: 1 (a shell edit of the plan whose text named product paths; redone with Edit)
open: the counterpoint changed the plan twice: (1) `popup.html` moved to the package root, since Vite keeps an HTML input's path relative to its root and `dist/src/popup/popup.html` would break the manifest; (2) `Auth.accessToken` now returns `{ expired: true }` when supabase-js's `getSession()` gives `session: null` plus an error (rejected refresh), so a token that expired while the worker slept shows "Your sign-in expired" instead of a bare sign-in form.

## Task 1: Extension scaffold — done
commit: 8cd4aa9 · codex: build 01a1b1d2, review 01a1b1d9 (pass) · codex tokens: 957,678 · fix rounds: 0 · guard denials: 0
open: none. 1134 tests. Built without `.env`: `dist/` has all five files, `popup.html` at its root, `host_permissions` empty (no environment configured), as planned.

## Task 3: Sign-in and the environment switch — done
commit: 906bfac · codex: build 01a1b1db (+2 resume fix rounds), reviews 01a1b1e2 (pass), 01a1b1e5 (fix), 01a1b1e9 (fix, stale brief), 01a1b1eb (pass) · codex tokens: ~2,276,000 (log sum, last cumulative line per session) · fix rounds: 2 · guard denials: 1 (a PowerShell call whose -Task text named product paths; fix text now goes through a scratch file)
open: none. 1161 tests. Built in Task 2's place while waiting for the LinkedIn check. Claude read auth.ts and storage.ts in full (auth code) and found what the first Astra pass missed: a network failure during refresh would have deleted the session as "expired" → `accessToken` now gives `{ offline: true }` and keeps it. Astra then found that `email()` via `getSession()` let a rejected refresh delete the session while the popup opened, losing the "expired" message → `email()` reads the stored session JSON without network. Both changes are in the plan (Tasks 3 and 4). The last fix-round review flagged the old contract because the brief re-extraction failed (PowerShell has no `sh`); re-extracted with Bash and re-reviewed: pass. Lesson: re-extract the brief from the plan before every review after a plan change.

## Task 2: Page readers with fixtures — done
commit: 60ebaa7 · codex: build 01a1b1ec, review 01a1b1f3 (pass) · codex tokens: 506,287 · fix rounds: 0 · guard denials: 0
open: none. 1197 tests. Selectors come from the live check (data-testid markers + "About the job" heading; LinkedIn's classes are hashed). The first test gate failed only on web CV editor / jobs list timeouts (5 s) untouched by this task; a plain rerun passed (Task 3's build saw the same flake). Fixtures: only "Alex Example" and fictional links.

## Task 4: Saving, the API call, and the popup states — done
commit: 69d3310 · codex: build 01a1b1f5 (+2 resume fix rounds), reviews 01a1b202 (fix), 01a1b209 (fix), 01a1b20f (pass) · codex tokens: ~4,196,000 (log sum, last cumulative line per session) · fix rounds: 2 · guard denials: 0
open: none. 1270 tests. Findings fixed: (1) an error reply to getState became the popup's state and the error view itself crashed → blank popup; replies are now type-checked and the error view needs no state; (2) saves were joined by tab only, so a click after switching to Hosted could show Saved for a Local save → joined by environment + tab; (3) Try again after a failed start only retried the save → it now reruns the whole start. Claude read save.ts's token path (401 → one refresh + retry → sign out with "expired"). Kept an unplanned detail: the Connect to select also sits in the signed-in footer, which checklist step 9 needs. Test gate: the web CV editor timeout flake hit once more; the automatic retry passed. Phase rule (fresh session after 4 tasks) not applied: the user is away for ~3 hours and asked the run to continue here.

## Task 5: Web — the Add a job dialog leads with the extension — done
commit: 1f6802d · codex: build 01a1b212, review 01a1b21a (pass) · codex tokens: 1,917,269 · fix rounds: 0 · guard denials: 0
open: none. 1278 tests.

## Whole-branch review 1 (base 7dde331) — fix, 1 finding (→ Task 6)
codex: review 01a1b21c · codex tokens: 681,005
open: two failed attempts first: the plan file has no scope block at its top, and the full plan inlined as a brief exceeds Windows' command-line limit ("filename or extension is too long"). Whole-branch brief = a scope block (every changed file, size = changed lines) + a pointer to the plan on disk. Finding: "Paste it in Resumora" on a signed-out website lost the link through /login and landed on /cv (acceptance criterion 4).

## Task 6: Web — sign-in returns to the page that asked for it — done
commit: 2047d7e · codex: build 01a1b21f, review 01a1b223 (pass) · codex tokens: 431,008 · fix rounds: 0 · guard denials: 0
open: **user to confirm (auth change).** Claude read the full diff: destination only from router state, single leading `/` required, else `/cv`. Built without waiting because the user was away and asked the run to continue; it stays on the branch until approved. 1281 tests.

## Whole-branch review 2 (base 7dde331) — fix, 1 finding (→ Task 7)
codex: review 01a1b224 · codex tokens: 850,342
open: a stalled supabase token refresh had no timeout, so a save could spin forever before postJob's 20 s timeout started.

## Task 7: Extension — supabase requests time out — done
commit: 4ed1939 · codex: build 01a1b228, review 01a1b22e (pass) · codex tokens: 922,117 · fix rounds: 0 · guard denials: 0
open: none. 1283 tests. Claude read the auth diff: a 20 s abort per supabase request, plus a 20 s cap on the whole `getSession()` (supabase retries refreshes, so per-request limits alone could add up); a timeout gives `{ offline: true }`, session kept.

## Whole-branch review 3 (base 7dde331) — pass
codex: review 01a1b22f · codex tokens: 563,460

## Run total
Codex tokens: ~13,970,000 (sum of the blocks above; most cached). Guard denials: 2 (both shell/PowerShell commands whose text named product paths; redone with Edit / a scratch file). Commits on `rebuild/job-extension`: 8cd4aa9, 906bfac, 60ebaa7, 69d3310, 1f6802d, 2047d7e, 4ed1939. Not pushed; no PR.
Extension built for Local in the worktree (`dist/` is git-ignored) with the local Supabase URL and key passed as process variables from `supabase status`, never written to a file: host_permissions = 127.0.0.1:54321 and 127.0.0.1:8788 only.
Still to do with the user: approve Task 6 (sign-in change); the manual Chrome checklist (steps 1–10); commit this plan and progress file on the branch; push / PR on the user's yes.

## Manual checklist (Chrome, Local) — 2026-11-07
1. Signed out on first open — pass.
2. Sign in with a local account; footer shows the email — pass.
3. First try (on the Resumora /cv page): "Can't reach Resumora", no request reached the API. Cause: `postJob` called native `fetch` as `deps.fetch()` → Chrome "Illegal invocation" (confirmed live in Chrome) → mapped to network. → Task 8.

## Task 8: Extension — saving calls fetch unbound — done
commit: 2f396ec · codex: build 01a1b542, review 01a1b545 (pass) · codex tokens: 547,478 · fix rounds: 0 · guard denials: 0
open: none. 1284 tests. Extension rebuilt for Local; checklist resumes at step 3.
3 (retry after Task 8). LinkedIn job → Saved — pass (user confirmed in Chrome). User then asked for an explicit Capture button with visible loading → spec updated (popup table + rules), Task 9.

## Task 9: Extension — the popup opens on a Capture button — done
commit: 13341c0 · codex: build 01a1b54d, reviews 01a1b553 (fix), 01a1b557 (fix), 01a1b55a (pass), 01a1b55b (pass, corrected brief) · codex tokens: ~2,587,000 · fix rounds: 2 · guard denials: 0
open: none. 1296 tests. Fix 1: Capture discarded a pending environment switch's reply (wrong badge). Fix 2 (Claude's instruction after reading popup.ts): a pending-request counter let a stale sign-in block Capture with the button stuck disabled → track only the latest state request. Scope check flagged 307 > 280 lines (205 were tests) → size estimate raised 140 → 170 in the plan, brief re-extracted, fresh review passed.
3 (with Capture, after Task 9) — pass. User: "works well". /jobs checked in Chrome: 4 LinkedIn jobs (TIAB, Lifecycle Operations Lead, ADP, KPMG) all reached a title (ready). One "127.0.0.1:5173 — Failed" entry is the earlier capture of Resumora's own /cv page (not a job ad); expected, not an extension bug.
6. example.com → Saved (expected Couldn't read). The page now has 917 characters (the same notice in several languages), so the 200-character rule passes it; the server's AI then marks it "doesn't look like a job posting". User wants the extension to say up front that a page isn't a job ad. → design options presented (2026-11-07).

## Task 10: Extension — check the page on open; warn when it isn't a job ad — done
commit: 0988ea5 · codex: build 01a1b567, reviews 01a1b56f (fix), 01a1b572 (pass) · codex tokens: ~1,582,000 · fix rounds: 1 · guard denials: 0
open: none. 1342 tests. User chose option A (warn + Capture anyway) over B (block, paste only) and C (server AI verdict). Fix 1: Try again after a failed check saved directly → now repeats the check. Spec popup table, rules and checklist step 6 updated.
6 (after Task 10). example.com → "This doesn't look like a job ad" on open; a LinkedIn job → Capture this job — pass (user: "as expected").
8. Blocked: our dev servers were stopped at 12:08, but another worktree's servers (resumora-feedback-1, started 11:51) hold 127.0.0.1:5173 and :8788, so the API stays reachable. Not stopped (another session's). Waiting for the user's call.
8. Skipped (user's call): another worktree's API holds :8788. "Can't reach" is covered by unit tests and was seen live before Task 8.
Web dialog check on :5174 (this branch's web only): failed for environment reasons, not code. The /v1 proxy is fixed to :8788, held by resumora-feedback-1's API started with the main .dev.vars only (hosted Supabase), so the local account got 401 and the web app signed out. Needs this branch's own API on :8788 (other worktree's servers stopped) or the per-worktree ports work.

## Task 11: Extension — reopening the popup during a capture joins it — done
commit: 1dabf2b · codex: build 01a1b58a, review 01a1b58e (pass) · fix rounds: 0 · from whole-branch review 4 (01a1b587, fix)

## Task 12: Extension — joining a capture never starts a new save — done
commit: 8abbdc8 · codex: build 01a1b593, review 01a1b598 (pass) · fix rounds: 0 · from whole-branch review 5 (01a1b58f, fix)

## Task 13: Extension — captures keyed by page, not only by tab — done
commit: f81b453 · codex: build 01a1b59c, review 01a1b5a0 (pass) · fix rounds: 0 · from whole-branch review 6 (01a1b599, fix). 1352 tests.

## Whole-branch review 7 (base 7dde331) — fix, 1 finding (not fixed yet)
codex: review 01a1b5a1 · open: save.ts:117 — switching Local→Hosted in the milliseconds between clicking Capture and the tab lookup sends that capture to Hosted (environment read after activeTab()). Present since Task 4; very unlikely; Hosted not configured in this build. Awaiting the user's call: fix now or list as known in the PR.
