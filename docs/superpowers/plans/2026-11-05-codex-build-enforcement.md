# Codex Build Enforcement Implementation Plan

> **For agentic workers:** Execute with superpowers:executing-plans (native). Do **not** use subagent-driven-development: that skill's builder and reviewer subagents are exactly what this plan forbids. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Codex builds and Astra reviews every task in a worktree, while hooks stop Claude from building, spawning expensive subagents, reading raw test output or committing unreviewed code.

**Architecture:** One hook script (`tools/guard.ps1`) answers every `PreToolUse` call for Agent, Edit/Write and Bash/PowerShell. `tools/codex-ask.ps1` gains `-Build`, `-Review` and `-Test` modes with checks inside the script. A project skill sets the per-task loop and the phase handoff.

**Tech Stack:** Windows PowerShell 5.1, git worktrees, `codex exec` CLI, Claude Code hooks, npm workspaces with vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-codex-build-enforcement-design.md`

All `tools/` paths are in the outer folder `C:\Users\mcosm\claude\resumora\tools`, outside the git repo. Those files aren't product code, so the guard never blocks them. There's nothing to commit for them; "Checkpoint" steps mean "run the test file and stop if it fails".

## Global Constraints

- Hook input on stdin: `{session_id, transcript_path, cwd, hook_event_name, tool_name, tool_input}`.
- Deny output on stdout, exit 0: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<reason>"}}`.
- Allow = exit 0 with no output.
- The guard acts only when `cwd` or the target path is under `C:\Users\mcosm\claude\resumora` (case-insensitive, either slash style). Otherwise it allows.
- Fail closed: a parse error or exception gives deny with `guard error: <message>`.
- Allowed subagent types: `Explore`, `web-fetch`, `claude-code-guide`. Allowed models: `sonnet`, `haiku`. A missing model is denied.
- Override file: `tools/.allow-claude-edits`.
  - Any content lifts the Edit/Write and test guards.
  - A line `opus` allows Opus.
  - A line `commit` lifts the commit gate.
- Models:
  - build/fix: `gpt-6.1-sol` with `model_reasoning_effort="high"`
  - review: `gpt-6-astra` with `"high"`
- Fix rounds per task: at most 2. Phase size: 4 tasks.
- Scope check: size limit = 2 × `size`. Changes to `package.json` or `package-lock.json` need `deps: true`.
- Test output: `PASS (N tests)`, or `FAIL` plus at most 10 lines.
- Logs: `tools/codex-log.jsonl` (new fields `worktree`, `tree`, `verdict`) and `tools/guard-log.jsonl` (`at`, `tool`, `decision`, `rule`, `target` cut to 120 chars).
- Never open `.env*` (except `.example`) or `.dev.vars`.

## Review Focus

1. **Windows path forms.** `C:\Users\...`, `C:/Users/...`, `/c/Users/...` and mixed case must all count as inside resumora. Test in Task 1.
2. **Worktree paths that also match `resumora*`.** `resumora-enrichment/apps/x.ts` must be denied just like `resumora/apps/x.ts`. Test in Task 2.
3. **Test commands inside compound commands.** `cd apps/web && npx vitest run` and `npm --prefix apps/web test` must be denied. Test in Task 3.
4. **A brief with no front matter.** `-Build` must refuse with "brief has no scope block", not build with no scope. Test in Task 5.
5. **A commit after the review passed, then an extra edit.** The gate must deny, because the tree changed. Test in Task 7.

---

### Task 1: Guard skeleton and Agent rule

**Files:**
- Create: `tools/guard.ps1`
- Create: `tools/guard.tests.ps1`

**Interfaces:**
- Produces: `guard.ps1` reads stdin JSON and writes deny JSON or nothing. Internal functions used by later tasks:
  - `Test-InResumora([string]$path) -> bool`
  - `Deny([string]$rule, [string]$reason)` (prints and logs)
  - `Get-Override() -> @{ any=bool; opus=bool; commit=bool }`
  - `Write-GuardLog($tool, $decision, $rule, $target)`
- Produces (tests): `Invoke-Guard([hashtable]$hookInput) -> string`, which returns `'allow'` or the deny reason, by piping JSON to `powershell -NoProfile -File tools/guard.ps1`. Also `Assert-Eq($name, $actual, $expected)`, which prints `ok`/`FAIL` and counts failures; the file exits 1 if any failed.

- [ ] **Step 1: Write the failing tests** in `guard.tests.ps1`:
  - `agent-opus-denied`: Agent, `{subagent_type:'Explore', model:'opus'}`, cwd in resumora → reason contains `Sonnet/Haiku`
  - `agent-no-model-denied`: `{subagent_type:'Explore'}` → denied
  - `agent-general-purpose-denied`: `{subagent_type:'general-purpose', model:'sonnet'}` → denied
  - `agent-explore-sonnet-allowed` → `allow`
  - `agent-webfetch-haiku-allowed` → `allow`
  - `outside-resumora-allowed`: Agent opus with cwd `C:\Users\mcosm\other` → `allow`
  - `path-forms`: cwd `/c/users/mcosm/claude/RESUMORA/resumora` with an opus Agent → denied
  - `bad-json-fails-closed`: pipe `not json` → reason starts with `guard error:`
  - `override-opus`: write `opus` to the override file in a `try/finally` that removes it → opus Explore `allow`
- [ ] **Step 2: Run** `powershell -NoProfile -File C:\Users\mcosm\claude\resumora\tools\guard.tests.ps1`. Expected: it fails, because `guard.ps1` is missing.
- [ ] **Step 3: Implement `guard.ps1`** with the Agent rule. Normalize paths: `/c/` → `C:\`, `/` → `\`, then compare lowercase. Wrap the whole body in `try { } catch { Deny 'error' "guard error: $($_.Exception.Message)" }`. Skip logging for allows on tools other than Agent, so the log isn't flooded.
- [ ] **Step 4: Run the tests.** Expected: all `ok`, exit 0.

### Task 2: Edit/Write rule

**Files:**
- Modify: `tools/guard.ps1`
- Modify: `tools/guard.tests.ps1`

**Interfaces:**
- Consumes: `Test-InResumora`, `Deny`, `Get-Override` from Task 1.
- Produces: `Test-ProductPath([string]$path) -> bool`, true for `\resumora[^\\]*\(apps|packages)\` after normalizing. Task 3 uses it.

- [ ] **Step 1: Tests:**
  - `edit-apps-denied`: Edit `file_path` `C:\Users\mcosm\claude\resumora\resumora\apps\web\src\a.ts` → reason contains `written by Codex`
  - `write-worktree-packages-denied`: Write `...\resumora-enrichment\packages\shared\x.ts` → denied
  - `notebook-denied`: NotebookEdit `notebook_path` under apps → denied
  - `edit-tools-allowed`: `...\resumora\tools\codex-ask.ps1` → `allow`
  - `edit-docs-allowed`: `...\resumora\resumora\docs\plans\p.md` → `allow`
  - `write-override-file-denied`: path `...\tools\.allow-claude-edits` → denied, even with the override present
  - `override-lifts-edit`: override file present → `edit-apps` gives `allow`
- [ ] **Step 2: Run the tests.** Expected: the new ones fail.
- [ ] **Step 3: Implement.** Read `tool_input.file_path`, or `notebook_path` for NotebookEdit.
- [ ] **Step 4: Run the tests.** Expected: all pass.

### Task 3: Bash and PowerShell rules (tests, writes, override)

**Files:**
- Modify: `tools/guard.ps1`
- Modify: `tools/guard.tests.ps1`

**Interfaces:**
- Consumes: `Test-ProductPath` from Task 2. The command text is `tool_input.command`.

- [ ] **Step 1: Tests (cwd in resumora unless stated):**
  - `npm-test-denied`: `npm test` → reason contains `-Test -Worktree`
  - `compound-vitest-denied`: `cd apps/web && npx vitest run` → denied
  - `prefix-test-denied`: `npm --prefix apps/web test` → denied
  - `npm-run-test-denied`: `npm run test` → denied
  - `npm-ci-allowed`: `npm ci` → `allow`
  - `git-status-allowed` → `allow`
  - `redirect-apps-denied`: `printf 'x' >> apps/web/src/i18n/en.ts` → reason contains `written by Codex`
  - `setcontent-packages-denied`: `Set-Content packages/shared/a.ts 'x'` → denied
  - `sed-i-denied`: `sed -i s/a/b/ apps/api/src/x.ts` → denied
  - `cat-apps-allowed`: `cat apps/web/src/a.ts` → `allow` (reading is fine)
  - `override-mention-denied`: `echo opus > tools/.allow-claude-edits` → reason contains `user only`
  - `override-lifts-tests`: override present → `npm test` gives `allow`
- [ ] **Step 2: Run the tests.** Expected: the new ones fail.
- [ ] **Step 3: Implement** with three regexes (case-insensitive):
  - test runner: `\b(vitest|npm\s+(run\s+)?test|npm\s+--prefix\s+\S+\s+test|pnpm\s+(run\s+)?test|npx\s+vitest)\b`
  - write form: `(>>?|\btee\b|\bsed\s+-i|Set-Content|Add-Content|Out-File|Copy-Item|Move-Item|Remove-Item|\bcp\b|\bmv\b|\brm\b|git\s+checkout\s+--|git\s+restore)` together with `(^|[\s'"/\\])(apps|packages)[/\\]`
  - override: `\.allow-claude-edits`
- [ ] **Step 4: Run the tests.** Expected: all pass.

### Task 4: `codex-ask.ps1` worktree check and read-only tree check

**Files:**
- Modify: `C:\Users\mcosm\claude\resumora\tools\codex-ask.ps1`
- Create: `tools/codex-ask.tests.ps1`

**Interfaces:**
- Produces (dot-sourceable: the script's main body runs only when `$MyInvocation.InvocationName -ne '.'`):
  - `Assert-Worktree([string]$path)`: throws `not a linked worktree` when `git -C $path rev-parse --git-dir` equals `--git-common-dir` (both resolved to absolute paths). Throws `secret file present: <name>` when `apps/api/.dev.vars`, `apps/web/.env.local`, or any `.env*` not ending in `.example`, exists in `$path`.
  - `Get-WorkTree([string]$path) -> string`: the tree id of the working tree. It uses a temporary `GIT_INDEX_FILE` (copied from `.git` index via `git read-tree HEAD`), then `git add -A`, then `git write-tree`, and removes the temporary index. It never touches the real index.
- Changes: every `-Tier` call (and later `-Review`) takes `Get-WorkTree` of `$Repo` before and after. If they differ, it logs `status: 'wrote-in-read-only'`, prints `WARNING: Codex changed files during a read-only call`, and exits 1.
- Test fixture, `New-TestRepo -> @{ main; wt }`: a temp git repo with one commit plus `git worktree add <tmp>\wt`.

- [ ] **Step 1: Tests** in `codex-ask.tests.ps1` (dot-source `codex-ask.ps1`; same `Assert-Eq` helper):
  - `main-checkout-refused`: `Assert-Worktree $main` throws `not a linked worktree`
  - `worktree-accepted`: `Assert-Worktree $wt` doesn't throw
  - `secret-refused`: create `$wt\apps\api\.dev.vars` → throws `secret file present`
  - `example-ok`: only `$wt\.env.example` → doesn't throw
  - `tree-detects-second-edit`: modify `a.txt`, take tree1, modify `a.txt` again, take tree2 → they differ
  - `tree-detects-untracked`: add `new.txt` → the tree changes
  - `tree-leaves-index`: `git diff --cached --name-only` is empty after `Get-WorkTree`
- [ ] **Step 2: Run** `powershell -NoProfile -File ...\tools\codex-ask.tests.ps1`. Expected: it fails.
- [ ] **Step 3: Implement** the functions, the dot-source switch and the read-only check around the existing `& $run`.
- [ ] **Step 4: Run the tests.** Expected: they pass. Then run one real call, `.\tools\codex-ask.ps1 -Tier scout -Task "Name the test command in package.json. Max 1 finding."`, and check that it works and logs as before.

### Task 5: `-Build` mode and scope check

**Files:**
- Modify: `tools/codex-ask.ps1`
- Create: `tools/build.schema.json`
- Modify: `tools/codex-ask.tests.ps1`

**Interfaces:**
- Consumes: `Assert-Worktree` from Task 4.
- New params: `-Build` (switch), `-Worktree <path>`, `-Brief <file>`, `-Base <sha>` (defaults to `git -C $Worktree merge-base HEAD origin/HEAD`, falling back to `HEAD` at build start).
- `Read-Brief([string]$file) -> @{ files=[string[]]; new_files=[string[]]; deps=bool; size=int; body=string }`.
  - It parses the first `---` … `---` block. Keys are `key: value`; lists are `[a, b]`.
  - It throws `brief has no scope block` if the block is missing, or if `files` or `size` is missing.
- `Test-Scope([string]$wt, [string]$base, $brief) -> string[]`: the violations, empty when fine.
  - It uses `git -C $wt diff --numstat $base` plus untracked files from `git ls-files -o --exclude-standard`.
  - Violation messages: `outside scope: <p>`, `new file not allowed: <p>`, `dependency change not allowed: <p>`, `size <n> > limit <2*size>`.
- `build.schema.json`: `{summary: string, files_changed: string[], open_questions: string[]}` with every field required and `additionalProperties: false`, matching the style of `codex-findings.schema.json`.
- Run: `codex exec -m gpt-6.1-sol -c model_reasoning_effort="high" --approve-for-me -C $Worktree --output-schema build.schema.json ...`.
  - The prompt is the brief body plus these build rules: "Smallest change that passes the acceptance tests. Change only the files listed; create only the new files listed. No new abstractions, files or dependencies beyond the brief. Never open .env*, .dev.vars or secret files. Before each step send one short sentence."
  - With `-Resume`, it runs `codex exec resume <id>` and keeps the write rules, not the read-only ones.
- After the run: print `Summary:`, `Files:` and any `Open questions:`. Then run `Test-Scope`. If there are violations, print `SCOPE FAIL` plus each one and exit 2.
- Log `tier`: `build` (or `fix` with `-Resume`), plus `worktree` and `tree`.
- The read-only tree check from Task 4 is skipped for `-Build`.

- [ ] **Step 1: Tests:**
  - `brief-no-block`: `Read-Brief` on a file without `---` throws `brief has no scope block`
  - `brief-parses`: the front matter `files: [a.txt]`, `new_files: []`, `deps: false`, `size: 5` parses to the matching values
  - `scope-ok`: in the fixture worktree, change 2 lines of `a.txt` → no violations
  - `scope-outside`: change `b.txt` → `outside scope: b.txt`
  - `scope-newfile`: add `c.txt` → `new file not allowed: c.txt`
  - `scope-deps`: change `package.json` → `dependency change not allowed: package.json`
  - `scope-size`: add 11 lines to `a.txt` with `size: 5` → `size 11 > limit 10`
- [ ] **Step 2: Run the tests.** Expected: the new ones fail.
- [ ] **Step 3: Implement** `Read-Brief`, `Test-Scope`, the schema file and the `-Build` path.
- [ ] **Step 4: Run the tests.** Expected: they pass.

### Task 6: `-Test` and `-Review` modes

**Files:**
- Modify: `tools/codex-ask.ps1`
- Modify: `tools/codex-findings.schema.json` (add an optional `verdict` field)
- Modify: `tools/codex-ask.tests.ps1`

**Interfaces:**
- Consumes: `Assert-Worktree`, `Get-WorkTree`, `Read-Brief`.
- `-Test -Worktree <p>`:
  - It runs `npm ci` first if `$p\node_modules` is missing, and prints `installed deps`.
  - Then it runs `npm test` in `$p`, with the full output going to `%TEMP%\tests-<tag>.log`.
  - It prints `PASS (N tests)`. N is the sum of vitest `Tests  N passed` lines.
  - Or it prints `FAIL`, then at most 10 lines matching ` FAIL |×|AssertionError|Error:`, then `log: <path>`. The exit code matches npm's.
  - Log `tier: 'test'`.
- `-Review -Worktree <p> -Base <sha> -Brief <file>`:
  - It refuses `-Resume` with `review must be a fresh session`.
  - Run: `codex exec -m gpt-6-astra -c model_reasoning_effort="high" --approve-for-me -C $p --output-schema codex-findings.schema.json`.
  - Prompt: "Bug-only review. Run `git diff <base>` yourself (read-only), plus untracked files. The brief is below. Report only bugs, and code the brief does not need (single-use helpers, unused options, layers around one call), each with path:line. verdict is pass only if no finding has confidence medium or high. If nothing qualifies, return no findings and verdict pass." Then the brief text and the existing read-only rules.
  - The read-only tree check from Task 4 applies.
  - Print `Verdict: pass|fix` and the findings.
  - Log `tier: 'review'`, `verdict`, `worktree` (absolute path, lowercase) and `tree = Get-WorkTree $p`.
- Schema: add `"verdict": {"type": "string", "enum": ["pass", "fix"]}` as an optional property, so `-Tier` calls keep working.

- [ ] **Step 1: Tests:**
  - `review-resume-refused`: calling with `-Review -Resume x` throws `review must be a fresh session`
  - `test-summary-parse`: `Format-TestResult` on a canned vitest output with two `Tests  3 passed` blocks gives `PASS (6 tests)`
  - `test-fail-parse`: on canned failing output it gives `FAIL` plus at most 10 lines

  This means splitting the output parsing into `Format-TestResult([string]$output, [int]$exit) -> string[]`.
- [ ] **Step 2: Run the tests.** Expected: the new ones fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: they pass. Then run `-Test -Worktree C:\Users\mcosm\claude\resumora\resumora-enrichment` once for real. Expected: a single `PASS (...)` or `FAIL` block.

### Task 7: Commit gate

**Files:**
- Modify: `tools/guard.ps1`
- Modify: `tools/guard.tests.ps1`

**Interfaces:**
- Consumes: the `codex-log.jsonl` fields from Task 6 (`tier`, `verdict`, `worktree`, `tree`), plus `Get-Override` and `Test-InResumora`.
- Rule: a Bash/PowerShell command matching `\bgit\b(\s+-C\s+\S+)?\s+commit\b`.
  - The repo is the `-C` path if given, otherwise `cwd`.
  - If that repo is a linked worktree under resumora: compute `git -C <repo> write-tree`, which uses the real staged index.
  - Deny with `Commit needs an Astra pass for this state; run -Review.` unless some log line has `tier=review`, `verdict=pass`, the same `worktree` (lowercase absolute) and the same `tree`.
  - The override `commit` line lifts the gate. The main checkout is not gated.

- [ ] **Step 1: Tests** (using the `New-TestRepo` fixture, copied into this test file, and a temporary `CODEX_LOG` path via the env var `GUARD_CODEX_LOG`, which the guard reads instead of the default when set):
  - `commit-no-review-denied`
  - `commit-after-pass-allowed`: stage all, append a log line with the matching `tree` → `allow`
  - `commit-after-pass-then-edit-denied`: Review Focus 5
  - `commit-fix-verdict-denied`
  - `commit-main-checkout-allowed`
  - `commit-override-allowed`
- [ ] **Step 2: Run the tests.** Expected: the new ones fail.
- [ ] **Step 3: Implement.** Read the log with `Get-Content | ConvertFrom-Json` per line, skipping lines that don't parse.
- [ ] **Step 4: Run both test files.** Expected: all pass.

> **Note:** `-Review` logs the tree of the **working tree**, and the gate compares the **staged** tree. They're equal only after `git add -A`. So the skill always stages everything before committing, and commits without paths or `-a`.

### Task 8: Register the hooks

**Files:**
- Modify: `C:\Users\mcosm\.claude\settings.json`: `hooks.PreToolUse`. Load the `update-config` skill first, and show the user the diff before writing.

- [ ] **Step 1:** Add three entries next to the existing RTK Bash entry. Keep RTK unchanged.
  - matcher `Agent`
  - matcher `Edit|Write|NotebookEdit`
  - matcher `Bash|PowerShell`

  Each is `{"type":"command","command":"powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/mcosm/claude/resumora/tools/guard.ps1"}`.
- [ ] **Step 2: Live check in this session:**
  - An Edit attempt on `resumora/apps/web/src/main.tsx` (any no-op change) → denied with the Codex reason
  - `npm test` → denied
  - An Agent call with Explore + haiku → allowed
  - `tools/guard-log.jsonl` has these three lines

### Task 9: The `codex-build` skill and the CODEX-DELEGATION.md update

**Files:**
- Create: `C:\Users\mcosm\claude\resumora\.claude\skills\codex-build\SKILL.md`
- Modify: `C:\Users\mcosm\claude\resumora\CODEX-DELEGATION.md`

**Interfaces:**
- Consumes: the commands from Tasks 4–7:
  - `codex-ask.ps1 -Build -Worktree <wt> -Brief <file>`
  - `-Build -Resume <s> -Task <fixes>`
  - `-Test -Worktree <wt>`
  - `-Review -Worktree <wt> -Base <sha> -Brief <file>`
- Plan file format: `resumora/docs/plans/<name>.md`, with `## Task N: <title>` sections. Each starts with the scope front matter (`---` files / new_files / deps / size `---`), then **Goal**, **Acceptance tests**, **Out of scope**. For `-Brief`, the skill extracts each task section to `%TEMP%\brief-<name>-<N>.md`.

- [ ] **Step 1:** Write `SKILL.md`.
  - Front matter: `name: codex-build`, and a description: "Use to execute a plan file of build tasks in resumora: Codex builds each task in a worktree, tests and an Astra review gate it, Claude commits. Use instead of subagent-driven-development."
  - The body is the per-task loop, the escalation rule, the full-diff-only-for-auth/RLS/migrations rule and the phase split, all from spec section 3.
  - It also covers the spec's error handling:
    - Codex `FAILED` or no output: retry once, then escalate.
    - Codex quota exhausted: mark the task `blocked: codex quota` and stop the run.
  - End of run: one `-Review` of the whole branch from base to HEAD, a cost line, and no push or PR without the user's yes.
  - Then the progress-block template:
    ```
    ## Task N: <title> — done|escalated|blocked
    commit: <sha> · codex: build <s>, review <s> · codex tokens: <sum> · fix rounds: <n> · guard denials: <n>
    open: <one line or none>
    ```
  - Then "stage with `git add -A`, then commit without paths". Under 120 lines.
- [ ] **Step 2:** Edit CODEX-DELEGATION.md as in spec section 4. Add a "Guardrails" section listing the four guard rules, the override file and its lines, and the logs.
- [ ] **Step 3:** Check that the skill appears in a new session's skill list. Expected: `codex-build` is listed.

### Task 10: Dry run on one real task

- [ ] **Step 1:** With the user, pick one small real task from an open plan. Write it as a one-task plan file in `resumora/docs/plans/dry-run.md`.
- [ ] **Step 2:** Create a worktree:
  ```
  git -C resumora worktree add ../resumora-dryrun -b dryrun/<name>
  ```
  Check that `.dev.vars` is absent and run `npm ci`.
- [ ] **Step 3:** Run the `codex-build` skill on it. Expected: build → test → review pass → commit, with no guard denial for Claude's own steps, and a progress block with the token counts.
- [ ] **Step 4:** Report the Claude context used (from `/cost` or the session usage) next to the Codex tokens in the progress block. Ask the user whether to remove the dry-run worktree and branch.
