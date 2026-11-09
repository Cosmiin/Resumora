# codex-build redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans (native) to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. This is tooling outside the product repo, so `codex-build` does not apply. Claude builds it directly (spec, "Who builds it").

**Goal:** Build the map script, the `codex-ask.ps1` changes, the guard exception, and the `librarian`, `codex-build` and `codex-audit` skills, so Codex does more of the work, steered by Claude through a living codebase map.

**Architecture:** Mechanical rules go into PowerShell scripts with their own test scripts (`map.ps1`, `codex-ask.ps1`, `guard.ps1`). Judgement goes into skill files. Scripts expose their functions when dot-sourced (`if ($MyInvocation.InvocationName -eq '.') { return }`, as `codex-ask.ps1` does today), so the tests call functions directly.

**Tech Stack:** Windows PowerShell 5.1 (no `&&`, no `?:`, no `??`), git, the Codex CLI through `codex-ask.ps1`, Markdown skills.

**Spec:** `resumora/docs/superpowers/specs/2026-11-09-codex-build-redesign-design.md`. The rules file `C:\Users\mcosm\claude\resumora\codex-build-improvements.md` wins where they differ.

## Global Constraints

- All paths below are relative to `C:\Users\mcosm\claude\resumora` (the workspace folder, **not a git repo**). There are no commits for these files: a task is done when its test script passes and a Codex `deep` review of the task's files returns no medium or high finding.
- Windows PowerShell 5.1 only. Write files as UTF-8 without a BOM (`[IO.File]::WriteAllText(path, text, (New-Object Text.UTF8Encoding $false))`).
- Never read, copy or print `.env*`, `.dev.vars` or other secret files. Codex prompts say so.
- Don't edit anything under `resumora/apps/**` or `resumora/packages/**` (the guard denies it). The product repo is touched only by the map build, which happens later, on the owner's command.
- Test scripts follow `tools/guard.tests.ps1`: `Assert-Eq` / `Assert-Match`, print `ok`/`FAIL` lines, end with `all passed` or exit 1, and use temp folders under `%TEMP%`.
- Codex review per task: `.\tools\codex-ask.ps1 -Tier deep -Task "Review <files> for bugs only against spec section <n>. Report only concrete defects with path:line. If nothing qualifies, return no findings."`
- Existing behaviour must keep working: `tools/codex-ask.tests.ps1` and `tools/guard.tests.ps1` stay green after every task.

## Review Focus

1. **Paths with backslashes or a leading `./`** in an entry's `files` must match git's forward-slash repo-relative paths. Pinned in Task 1 (`norm-paths`).
2. **Entry files with CRLF line endings or a BOM** (written on Windows) must parse the same as LF files. Pinned in Task 1 (`crlf-bom`).
3. **Symbols containing regex characters** (`saveLetter(`, `a.b`, `[x]`) must be matched literally, not as patterns. Pinned in Task 1 (`literal-symbol`).
4. **An empty map** (no `docs/map/` folder yet) must give an empty slice, a passing `check`, and an index saying "no entries". This is the state until the owner orders the map build. Pinned in Task 2 (`empty-map`).
5. **A crashed run leaving the database lock behind** must not block later runs forever. Pinned in Task 3 (`lock-abandoned`).

---

### Task 1: `map.ps1` core: entries, fingerprints, `check`, `stamp`

**Files:**
- Create: `tools/map.ps1`
- Create: `tools/map.tests.ps1`

**Interfaces:**
- Produces (dot-sourced functions):
  - `Read-MapEntry([string]$path) -> hashtable` with keys `id, area, files[], depends_on[], contract(bool), checked_hash, decisions[], open[], claims[], path`. Each claim is `@{ file; line(int); symbol; text }`, parsed from list lines ending in `` `path:line` → `symbol` ``.
  - `Get-MapEntries([string]$repo) -> hashtable[]` (every `docs/map/**/*.md` except `INDEX.md`; empty array if the folder is missing).
  - `Get-Fingerprint([string]$repo, [string[]]$files) -> string`: the first 8 hex characters of SHA-256 over `"<path>:<git hash-object id>"` lines, sorted by path. A missing file contributes `"<path>:missing"`.
  - `Test-Citation([string]$repo, $claim) -> @{ state = 'ok'|'moved'|'broken'; line = int }`.
  - `Invoke-MapCheck([string]$repo, [string[]]$ids, [switch]$Fix) -> @{ problems = string[]; moved = string[]; exit = 0|2 }`.
  - `Set-MapStamp([string]$repo, [string[]]$ids)`.
- CLI: `map.ps1 check [-Entries a,b] [-Fix] [-Repo p]`, `map.ps1 stamp -Entries a,b [-Repo p]`.

- [ ] **Step 1: Write the failing tests** in `tools/map.tests.ps1`. A helper `New-TestRepo` creates a git repo in `%TEMP%` with `src/a.ts`, `src/b.ts`, `src/shared.ts` and entries `docs/map/x/a.md` (files `src/a.ts`, depends_on `x/shared`), `docs/map/x/shared.md` (contract: true), and `docs/map/x/b.md`, all stamped fresh. Tests:
  - `fresh`: `Invoke-MapCheck` returns exit 0 with no problems.
  - `stale`: editing `src/shared.ts` makes `x/shared` stale.
  - `dep-one-step`: then `x/a` is reported `stale (dependency)`, and an entry depending on `x/a` is **not**.
  - `squash-rebase-fresh`: create a branch, commit an unrelated file twice, squash-merge it into main with `git merge --squash`, then rebase. `x/b` stays fresh.
  - `cite-ok` (symbol at the line), `cite-near` (5 lines away → ok), `cite-moved` (40 lines away → `moved`, exit 0), `cite-fix` (`-Fix` rewrites the line number in the entry file), `cite-broken` (symbol absent → `broken`, exit 2).
  - `missing-file`: deleting `src/b.ts` reports `missing file` for `x/b`.
  - `norm-paths`: `files: [.\src\a.ts]` matches `src/a.ts`.
  - `crlf-bom`: an entry written with CRLF and a BOM parses to the same `id`, `files` and claims.
  - `literal-symbol`: the symbol `saveLetter(` and the symbol `a.b` are found literally; `a.b` does not match `axb`.
  - `stamp`: after `Set-MapStamp`, a stale entry is fresh.

- [ ] **Step 2: Run the tests and check they fail**
  Run: `powershell -NoProfile -File tools\map.tests.ps1`
  Expected: FAIL, because `map.ps1` doesn't exist.

- [ ] **Step 3: Implement the functions and the CLI in `tools/map.ps1`.** Header parsing: YAML-like `key: value` and `key: [a, b]` lines between `---` markers, no YAML library. Normalise paths with `-replace '\\','/'` and strip a leading `./`. Literal symbol search uses `.Contains()` / `[regex]::Escape`. `-Fix` rewrites only the line number inside the claim's backticks.

- [ ] **Step 4: Run the tests and check they pass**
  Run: `powershell -NoProfile -File tools\map.tests.ps1`
  Expected: every line `ok`, then `all passed`.

- [ ] **Step 5: Codex review** of `tools/map.ps1` and `tools/map.tests.ps1` against spec section 1. Fix any medium or high finding and re-run Step 4.

### Task 2: `map.ps1` lookups: `coverage`, `slice`, `index`, `used`, `claims`

**Files:**
- Modify: `tools/map.ps1`
- Modify: `tools/map.tests.ps1`

**Interfaces:**
- Consumes: `Get-MapEntries`, `Invoke-MapCheck` from Task 1.
- Produces:
  - `Get-MapCoverage([string]$repo, [string]$area) -> string[]` (uncovered files from `git ls-files apps packages supabase`, minus globs in `docs/map/EXCLUDE.txt`).
  - `Get-MapSlice([string]$repo, [string[]]$files) -> hashtable[]`: each item `@{ id; reason = 'file'|'dependency'|'dependent-contract'; stale(bool); decisions; open; pitfalls }`. Pitfalls are the `P<n>` ids in tools/pitfalls.md whose "applies to" lists the entry.
  - `Write-MapIndex([string]$repo)` writes `docs/map/INDEX.md`.
  - `Add-SliceMiss([string[]]$given, [string[]]$used, [string]$task) -> string[]` appends one JSON line per miss to `tools/map-log.jsonl` (`at, task, entry`).
  - `Test-ContractClaims([string]$claimsFile) -> @{ conflicts = string[]; exit }`.
- CLI: `coverage [-Area a]`, `slice <files...>`, `index`, `used -Given a,b -Used c,d [-Task t]`, `claims`.

- [ ] **Step 1: Write the failing tests** (same test repo helper):
  - `coverage-gap`: an untracked-by-map `apps/x.ts` is listed. `coverage-exclude`: `apps/gen/**` in `EXCLUDE.txt` hides `apps/gen/y.ts`.
  - `slice-direct`, `slice-dependency` (a's slice includes `x/shared` with reason `dependency`), `slice-contract-dependents` (shared.ts's slice includes `x/a` with reason `dependent-contract`), `slice-stale-flag`.
  - `index-sorted`: INDEX.md lists entries by area then id, and is byte-identical on a second run.
  - `used-miss`: given `x/a`, used `x/a,x/b` → returns `x/b` and appends 1 log line.
  - `claims-conflict`: two `open` plans claiming `x/shared` → conflict and exit 2; a `merged` plan doesn't count.
  - `empty-map`: with no `docs/map/` folder, the slice is empty, check exits 0, and the index contains `no entries`.

- [ ] **Step 2: Run the tests and check they fail**
  Run: `powershell -NoProfile -File tools\map.tests.ps1`
  Expected: the new tests FAIL, and Task 1's tests still pass.

- [ ] **Step 3: Implement the functions and CLI commands.** Globs use `-like` after converting `**` to `*`. `tools/contract-claims.md` format: a Markdown table `| plan | contracts | status |` with comma-separated ids and status `open` or `merged`.

- [ ] **Step 4: Run the tests and check they pass**
  Run: `powershell -NoProfile -File tools\map.tests.ps1`
  Expected: `all passed`.

- [ ] **Step 5: Codex review** of both files against spec section 1. Fix any medium or high finding.

### Task 3: `codex-ask.ps1 -Test`: retry per package, type check, database tests with a lock, map check

**Files:**
- Modify: `tools/codex-ask.ps1` (the `-Test` branch, around lines 120–129 and 220–240)
- Modify: `tools/codex-ask.tests.ps1`

**Interfaces:**
- Consumes: `map.ps1 check -Entries` (Task 1), `Get-MapEntries` (to find entries whose files changed since `-Base`).
- Produces:
  - `Get-TestPackage([string]$file) -> string`: `apps/web`, `apps/api` or `packages/<name>` from a repo-relative path. `''` when there's no match.
  - `Get-FailingTestFiles([string]$output) -> string[]`, taken from vitest `FAIL` lines.
  - `Enter-DbTestLock([string]$lockPath, [int]$staleMinutes = 30, [int]$pollSeconds = 10) -> int` (seconds waited), and `Exit-DbTestLock([string]$lockPath)`.
  - `Format-TestResult` gains `[int]$retried` and prints `PASS (N tests, 1 file retried)` when it's above 0.
  - `-Test` output: one line per step, `PASS ...` or `FAIL <step>` plus at most 10 lines: `tests`, `typecheck`, `db` (only when migrations changed), `map`.

- [ ] **Step 1: Write the failing tests** (dot-source `codex-ask.ps1`):
  - `pkg-web`: `apps/web/src/a.test.ts` → `apps/web`; `pkg-shared`: `packages/shared/src/x.test.ts` → `packages/shared`; `pkg-none`: `scripts/x.ts` → `''`.
  - `failing-files`: a sample vitest output with 2 FAIL lines returns both paths.
  - `format-retried`: `Format-TestResult` with exit 0 and retried 1 → `PASS (12 tests, 1 file retried)`.
  - `lock-wait`: a lock held by another live process makes a second `Enter-DbTestLock` (poll 1s) wait until it's released, and return more than 0 seconds.
  - `lock-abandoned`: a lock file older than `$staleMinutes`, or naming a PID that isn't running, is taken over immediately.
  - `db-only-on-migration`: a helper `Test-NeedsDbTest($wt, $base)` is true only when `supabase/migrations` changed.

- [ ] **Step 2: Run the tests and check they fail**
  Run: `powershell -NoProfile -File tools\codex-ask.tests.ps1`
  Expected: the new tests FAIL, and the old tests pass.

- [ ] **Step 3: Implement.** Retry command: `npm test -w <package> -- <file>`, run from the worktree. The lock file is created with `[IO.File]::Open(path, 'CreateNew')` and holds `pid|worktree|ISO time`. `Exit-DbTestLock` sits in a `finally` block. The type check runs `npm run typecheck`. The map step runs only when `docs/map/` exists in the worktree.

- [ ] **Step 4: Run the tests and check they pass**
  Run: `powershell -NoProfile -File tools\codex-ask.tests.ps1`
  Expected: `all passed`.

- [ ] **Step 5: Codex review** of the changed parts against spec section 2 (`-Test`). Fix any medium or high finding.

### Task 4: `-Risk`, `-Fresh`, and the build and review prompt changes

**Files:**
- Modify: `tools/codex-ask.ps1` (params, mode selection, the prompts around lines 137–188)
- Modify: `tools/build.schema.json`
- Modify: `tools/codex-ask.tests.ps1`

**Interfaces:**
- Produces:
  - Params `[switch]$Risk` and `[switch]$Fresh`. `-Risk` needs `-Worktree` and `-Brief`, uses model `gpt-6.1-sol` with effort `high`, the findings schema, and logs `tier: risk`. `-Fresh` is valid only with `-Build` and `-Task`, refuses `-Resume`, starts a new session with the prompt `Fix round. Fix only these:` + Task + the brief body + scope + build rules, and logs `tier: fix-fresh`.
  - `build.schema.json` requires `map_entries_used: string[]` and `map_gaps: string[]`.
  - `Get-Prompt([string]$mode, ...) -> string`: the prompt builder pulled out into a function so tests can check prompt text.

- [ ] **Step 1: Write the failing tests:**
  - `risk-needs-brief`: `-Risk` without `-Brief` → `codex-ask: -risk needs -Brief <file>`.
  - `fresh-needs-build`: `-Fresh` without `-Build` is refused. `fresh-no-resume`: `-Fresh -Resume x` is refused.
  - `risk-prompt`: it contains `at most 3`, `missing file:` and `If nothing qualifies, return no findings`.
  - `build-prompt-map`: it contains `docs/map/` and `map_entries_used`.
  - `review-prompt-map`: it contains `map entries` and `If nothing qualifies`.
  - `build-schema`: the schema JSON lists `map_entries_used` and `map_gaps` under `required`.

- [ ] **Step 2: Run the tests and check they fail.** Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** The prompt texts are copied from spec section 9 (Risk check), plus the map sentences from spec section 2 (`-Build`, `-Review`). The existing review rule about unnecessary code stays word for word.

- [ ] **Step 4: Run the tests and check they pass.** Expected: `all passed`.

- [ ] **Step 5: Codex review** against spec sections 2, 3 and 9. Fix any medium or high finding.

### Task 5: `-Audit` and `-MapArea`

**Files:**
- Modify: `tools/codex-ask.ps1`
- Create: `tools/audit.schema.json`
- Modify: `tools/codex-ask.tests.ps1`

**Interfaces:**
- Produces:
  - `-Audit -Area <name> [-Repo <path>]`: model `gpt-6-astra`, effort `high`, read-only, schema `audit.schema.json`, logs `tier: audit`. The prompt comes from spec section 9 (Audit).
  - `-MapArea <area> -Worktree <wt> -Brief <brief>`: model `gpt-6-astra`, effort `high`, write mode like `-Build`. After the run, `Test-Scope` is replaced by `Test-MapScope($wt, $base, $area) -> string[]`, which allows only `docs/map/<area>/**` and `docs/map/EXCLUDE.txt` and has no size limit. Logs `tier: map`.
  - `audit.schema.json` follows spec section 3, with `fixes.maxItems = 2`.

- [ ] **Step 1: Write the failing tests:**
  - `audit-needs-area`: refused without `-Area`.
  - `mapscope-ok`: changes under `docs/map/db/` pass. `mapscope-outside`: a change to `apps/x.ts` → `outside map scope: apps/x.ts`. `mapscope-exclude`: `docs/map/EXCLUDE.txt` passes.
  - `audit-schema`: `fixes.maxItems` equals 2, and each fix requires `lines`, `user_impact` and `performance_cost`.
  - `mapping-prompt`: it contains `path:line` and `EXCLUDE.txt` and names the area.

- [ ] **Step 2: Run the tests and check they fail.**

- [ ] **Step 3: Implement.** `-MapArea` reuses `Assert-Worktree` (secret scan) and the `-Build` run path. Only the prompt, schema (`build.schema.json`) and scope check differ.

- [ ] **Step 4: Run the tests and check they pass.**

- [ ] **Step 5: Codex review** against spec sections 2, 3 and 9.

### Task 6: Guard exception for plain read-only git

**Files:**
- Modify: `tools/guard.ps1` (the `bash-write` block, around lines 128–133)
- Modify: `tools/guard.tests.ps1`

**Interfaces:**
- Produces: `Test-PlainReadOnlyGit([string]$cmd) -> bool`. When it's true, the `bash-write` check is skipped. Nothing else in the guard changes: the commit gate, test rule and override handling stay as they are.

- [ ] **Step 1: Write the failing tests**, using the exact allow and deny lists in spec section 4:
  - allow: `git diff HEAD -- apps/x.ts`, `git -C ../wt log -- apps/x.ts`;
  - deny (`written by Codex`): `git diff > apps/x.ts`, `git show HEAD:apps/x.ts | tee apps/y`, `git -c core.pager="cp a apps/b" log`, `git diff --output=apps/x.ts`, `git diff --ext-diff`, `git log; rm apps/x`, and `` git log `cp a apps/b` ``.

- [ ] **Step 2: Run the tests and check they fail**
  Run: `powershell -NoProfile -File tools\guard.tests.ps1`
  Expected: the allow tests FAIL (they're denied today), and the deny tests pass.

- [ ] **Step 3: Implement `Test-PlainReadOnlyGit`.** It's an allow-list match on the whole command: `^git(?:\.exe)?(?:\s+-C\s+\S+)?\s+(diff|log|show|status|blame|ls-files)\b`, plus no character from `> < | ; & `` ` `` and no `$(`, and no token matching `--output|^-o$|--ext-diff|--textconv|--pager|--no-pager|-c|--config-env|--exec-path|--git-dir|--work-tree`.

- [ ] **Step 4: Run the tests and check they pass.** Expected: `all passed`, including every existing guard test.

- [ ] **Step 5: Codex review** of `Test-PlainReadOnlyGit` and the new tests, asking specifically for a command that passes the check and still writes a file. Fix every finding of any confidence.

### Task 7: `librarian` skill and knowledge files

**Files:**
- Create: `.claude/skills/librarian/SKILL.md`
- Create: `tools/pitfalls.md`, `tools/examples.md`, `tools/contract-claims.md`

**Interfaces:**
- Consumes: the `map.ps1` commands (Tasks 1–2), `-Resume` debrief questions, map fix jobs (`-Build` with a scope block that lists only map files).
- Produces: skill sections named exactly **Slice**, **Fix slice**, **After a task**, **Debrief question**, **First map build**, **Health check** and **Knowledge files**, which `codex-build` and `codex-audit` refer to by name. `pitfalls.md` entries have the form `## P<n>: <rule>` with the lines `Why:`, `Applies to: <entry ids or "all">` and `Source:`.

- [ ] **Step 1: Write the skill.** Its frontmatter `description` says to use it for map slices, fix slices, after-task map upkeep, debrief questions, the first map build and health checks in resumora. The body follows spec section 6 and rules section 11, including the debrief standards (specific questions only, reject generic wisdom, `path:line → symbol` required, no question is a good outcome) and the first-build priority with its 4 example questions.
- [ ] **Step 2: Seed `tools/pitfalls.md`** from the Rulings and Notes sections of `resumora/docs/plans/*.progress.md`. Keep only rules that apply beyond one task (e.g. type check after shared type changes, drop the old SQL function before redefining it, RLS child tables check parent ownership, never `db:reset`). Use `Applies to: all` until the map exists.
- [ ] **Step 3: Seed `tools/examples.md`** with one real brief (the clearest `## Task` section of `resumora-tailor-score/docs/plans/2026-11-08-cv-tailoring.md`) and one real finding (from an Astra review summary in `tools/codex-log.jsonl`), each with 2 lines on why it's a good model.
- [ ] **Step 4: Create `tools/contract-claims.md`** with the table header `| plan | contracts | status |` and no rows.
- [ ] **Step 5: Check:** every `map.ps1` command the skill names exists (`powershell -File tools\map.ps1 <cmd>` doesn't print "unknown command"), and `map.ps1 claims` runs on the empty table with exit 0.
- [ ] **Step 6: Codex review** of the skill against spec section 6 and rules sections 6 and 11, for contradictions or missing rules only.

### Task 8: Rewrite the `codex-build` skill

**Files:**
- Modify: `.claude/skills/codex-build/SKILL.md`

**Interfaces:**
- Consumes: the `librarian` sections (Task 7), `-Risk`, `-Fresh`, `-Test`, `-Review` (Tasks 3–4), `map.ps1` (Tasks 1–2).

- [ ] **Step 1: Rewrite the skill** following spec section 5. Keep word for word: the Inputs, the commit gate commands, the Errors section, the progress block format (adding `risk:` and `map: used <n>, gaps <n>, misses <n>`), the limits (2 fix rounds, 1 escalation, at most 2 whole-branch reviews per part), and "Push or PR only after the user says yes". Add:
  - the per-task steps 1–8;
  - the parallel lanes rules, including the `## Lanes` progress table and the one-lane database lock note;
  - the end-of-part bug hunt and security test, with their triggers and their **prompts copied word for word from spec section 9** (they're sent with `-Tier heavy -Repo <wt>`);
  - the map fix job;
  - the "no map yet" behaviour.
- [ ] **Step 2: Dry run** on a throwaway plan: create `%TEMP%\dryrun-plan.md` with one task whose scope is a single docs file (`docs/dry-run-note.md`, size 5) in a fresh worktree made with `tools\dev-worktree.ps1`. Walk the skill: slice (empty map), `-Risk`, brief, `-Build`, `-Test`, `-Review`, commit, progress block. Expected: every step runs in order, the brief has all 5 parts, and the progress block matches the format. Then remove the worktree and branch.
- [ ] **Step 3: Codex review** of the skill against spec section 5 and rules sections 2–5, for contradictions or missing rules only.

### Task 9: `codex-audit` skill

**Files:**
- Create: `.claude/skills/codex-audit/SKILL.md`

**Interfaces:**
- Consumes: `-Audit` (Task 5), `-Build`/`-Test`/`-Review` for proof tests, the librarian's area slice (Task 7).
- Produces: report files `resumora/docs/audits/<YYYY-MM-DD>-audit.md` and worktrees `resumora-audit-<area>`.

- [ ] **Step 1: Write the skill** following spec section 7 and rules section 10:
  - on demand only;
  - the 5 default areas;
  - parallel `-Audit` runs in the background;
  - proof per high or medium finding, in its area's own worktree: the test must fail on an assertion matching the claim, be reviewed, and a passing test drops the finding;
  - the report layout;
  - the owner picks the findings, and the picked ones become a plan whose acceptance tests are the proof tests;
  - picked findings are added to their map entries' `open` lists.
- [ ] **Step 2: Check** that every `codex-ask.ps1` switch the skill names appears in the script's `param(...)` block (grep for each name).
- [ ] **Step 3: Codex review** of the skill against spec section 7 and rules sections 8 and 10.

### Task 10: Update `CODEX-DELEGATION.md` and do a final consistency check

**Files:**
- Modify: `CODEX-DELEGATION.md`

- [ ] **Step 1: Update** following spec section 8:
  - add `-Risk`, `-Fresh`, `-Audit` and `-MapArea` to "How a call looks";
  - state that the audit format is the one place proposals are allowed;
  - point "Counterpoints" to the codex-build risk check;
  - add the map and the librarian to "Guardrails";
  - leave "Never delegate" unchanged.
- [ ] **Step 2: Run all three test scripts**
  Run: `powershell -NoProfile -File tools\map.tests.ps1; powershell -NoProfile -File tools\codex-ask.tests.ps1; powershell -NoProfile -File tools\guard.tests.ps1`
  Expected: `all passed` three times.
- [ ] **Step 3: Consistency check:** every switch, command, file and skill section that a skill or the delegation doc names exists. Grep each name. Report the result to the owner, together with the reminder that **the map build waits for the owner's command**.
