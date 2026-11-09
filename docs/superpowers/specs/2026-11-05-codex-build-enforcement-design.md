# Codex builds, Claude checks: enforced delegation

Date: 2026-11-05 · Status: design approved in chat, spec awaiting review

## Why

The overnight 17-task run cost about 32M effective Claude tokens and about 1.3M Codex.
Most of the Claude cost was 52 Claude builder and reviewer subagents (22.7M, 9.8M of it Opus) and one 244-turn session re-reading its history (4.2M).
`CODEX-DELEGATION.md` only gave advice. The superpowers `subagent-driven-development` skill overrode it, because no hook enforced anything.

**Goal:** a run like that should spend most of its tokens on Codex. Claude briefs, checks gate results and commits.
The rules that matter most are enforced by hooks and scripts, not by instructions.

## Decisions (from the brainstorm)

1. Codex writes product code, only in a git worktree. Claude reviews results and commits.
2. Every task passes a review gate by **Astra** (`gpt-6-astra`, high) in a fresh session before Claude looks at it.
3. Claude subagents: Sonnet or Haiku only, and only the lookup types `Explore`, `web-fetch` and `claude-code-guide`.
4. Long runs are split into phases. A progress file carries state between fresh sessions.
5. Hard guards:
   - Claude can't edit `apps/**` or `packages/**`.
   - Tests run only through a one-line test function.
   - A commit needs a logged Astra pass.
6. Lean by design:
   - Cut: a Skill guard and a per-session agent counter.
   - Overengineering is caught by a scope check and by the reviewer.

## Components (4 files + settings)

### 1. `tools/codex-ask.ps1` (extended)

The existing `-Tier scout|deep|heavy` and `-Resume` calls keep working. New modes:

| Mode | Model / effort | Writes? | Output |
|---|---|---|---|
| `-Build -Worktree <p> -Brief <file>` | gpt-6.1-sol / high | yes, in `<p>` | `build.schema.json`: `summary`, `files_changed[]`, `open_questions[]` |
| `-Build -Resume <build-session> -Task "<fix list>"` | same | yes | same (a fix round) |
| `-Review -Worktree <p> -Base <sha> -Brief <file>` | gpt-6-astra / high | no | the findings schema plus `verdict: pass\|fix` |
| `-Test -Worktree <p>` | (no model) | no | `PASS (N tests)`, or `FAIL` plus at most 10 lines; the full output goes to `%TEMP%\tests-<tag>.log` |

**Rules checked by the script (each exit is non-zero with a one-line reason):**
- **Worktree check.** `-Build` and `-Review` require `<p>` to be a linked worktree (`git rev-parse --git-dir` differs from `--git-common-dir`). They also require that `<p>` contains no `apps/api/.dev.vars`, `apps/web/.env.local` or other non-`.example` `.env*` file.
- **Read-only is now checked, not only requested.** `-Review`, and every `-Tier` call, snapshots the working tree as a tree id before and after the run: `HEAD` plus `git add -A` into a temporary index (`GIT_INDEX_FILE`), then `git write-tree`. This catches further edits to files that were already modified, and new untracked files. Writes to ignored paths (`node_modules`, build output) are not caught; that's an accepted limit. If anything changed, it logs `status: wrote-in-read-only`, prints a warning and exits 1. (`--approve-for-me` runs in the workspace-write sandbox, so the prompt alone does not guarantee read-only.)
- **Fresh reviews.** `-Review` combined with `-Resume` is rejected.
- **Scope check after `-Build`, before any review.** The brief has a front-matter block:
  ```
  files: [apps/web/src/cv/edit/cvReducer.ts, ...]   # may change
  new_files: [apps/web/src/cv/edit/merge.ts]        # may create (each needs a reason in the brief)
  deps: false                                       # package.json / lock may not change
  size: 40                                          # expected changed lines
  ```
  The scope check fails if:
  - a changed path isn't in `files`
  - a new path isn't in `new_files`
  - `package.json` or a lock file changed while `deps: false`
  - added plus removed lines are more than 2× `size`

  A scope failure is reported like a review `fix`, so it goes back to the builder without spending a review.
- **Build prompt rules:** the smallest change that passes the brief's acceptance tests; no new abstractions, files or dependencies unless the brief lists them; never open secret files.
- **Review prompt rules:**
  - Report only bugs and code the brief doesn't need (single-use helpers, unused options, layers around one call), each with `path:line`.
  - `pass` means no finding at `medium` or `high`.
  - If nothing qualifies, return no findings.
- **Logging.** Each call is logged as now. `tier` is `build`, `fix`, `review` or `test`, plus new fields `worktree`, `head` (sha after the call) and `verdict`.

**Test command:** `npm test` at the worktree root (it runs `vitest run` in `apps/api`, `apps/web` and `packages/shared`). If `node_modules` is missing, `-Test` runs `npm ci` first and says so in its output line.

### 2. `tools/guard.ps1` + `tools/guard.tests.ps1`

These are `PreToolUse` hooks, registered in **user** settings (`~/.claude/settings.json`). Sessions open in the outer folder, in the repo or in worktrees, so project-level settings would not reliably load.
The guard acts only when the tool call's `cwd` or target path is under `C:\Users\mcosm\claude\resumora`; otherwise it allows the call.
It reads the hook JSON on stdin and answers allow, or deny with a reason.

| Matcher | Denies when | Reason given |
|---|---|---|
| `Agent` | `model` missing or `opus`, or `subagent_type` not in {Explore, web-fetch, claude-code-guide} | "Lookup agents on Sonnet/Haiku only. Building/review → `codex-ask.ps1 -Build/-Review` via the codex-build skill." |
| `Edit\|Write\|NotebookEdit` | the path matches `resumora*/apps/**` or `resumora*/packages/**`, or is the override file | "Product code is written by Codex; brief it via codex-build." |
| `Bash\|PowerShell` | the command runs `vitest`, `npm test`, `npm run test`, `pnpm test` or `npx vitest` directly | "Run tests with `codex-ask.ps1 -Test -Worktree <p>`." |
| `Bash\|PowerShell` | `git commit` in a resumora worktree whose staged tree (`git write-tree`) has no `review` entry with `verdict: pass` and the same `tree` in `codex-log.jsonl` (see commit-gate detail) | "Commit needs an Astra pass for this state; run `-Review`." |
| `Bash\|PowerShell` | the command names a path under `apps/` or `packages/` together with a write form: `>`, `>>`, `tee`, `sed -i`, `Set-Content`, `Add-Content`, `Out-File`, `Copy-Item`, `Move-Item`, `Remove-Item`, `cp`, `mv`, `rm`, `git checkout --`, `git restore` | "Product code is written by Codex; brief it via codex-build." Pattern-based, so not airtight. **The commit gate is the backstop:** any write Claude makes this way changes the staged tree, the tree no longer matches an Astra pass, and the commit is denied. |
| `Bash\|PowerShell` | the command text mentions `.allow-claude-edits` | "The override file is set by the user only." |

- **Override:** `tools/.allow-claude-edits`, created by hand by the user.
  - Any content: lifts the Edit/Write and test-command guards.
  - A line `opus`: also allows Opus subagents.
  - A line `commit`: lifts the commit gate.

  Known limit: a Bash command that writes the file without naming it plainly could get past the guard. Every such attempt is a visible tool call and lands in the guard log.
- **Fail closed:** if the input can't be parsed, or the script throws, the answer is deny with "guard error: <message>".
- **Guard log:** every decision is appended to `tools/guard-log.jsonl` (time, tool, decision, rule, short target).
- **Coexists with the RTK hook:** both are `PreToolUse` on Bash and both must allow.
- **Hooks fire inside subagents too**, so the rules apply there.
- **Tests:** `guard.tests.ps1` feeds sample JSON inputs and checks each row of the table above, plus the override and fail-closed cases.

**Commit-gate detail:** the review runs on the working tree. The gate compares the `tree` logged by the review against `git write-tree` of the staged index at commit time. So the review logs `tree` (from `git add -A; git write-tree` in a temporary index, without touching the real index), and the guard compares trees, not commit shas.

### 3. `.claude/skills/codex-build/SKILL.md` (in the outer `resumora` folder)

**Inputs:** a plan file `resumora/docs/plans/<name>.md` with numbered tasks. Each task has its brief (the front matter above plus goal, acceptance tests and out-of-scope).

**Per task:**
1. Claude checks the brief (complete, scope stated). It doesn't re-read code Codex will read.
2. `-Build`, then `-Test`.
3. If the tests pass, the scope check runs inside `-Build`, then `-Review`.
4. On `fix` (failed tests, scope or review findings), `-Build -Resume` with only the failing lines or findings. At most **2** fix rounds.
5. Still failing → **escalate once**: Claude either rewrites the brief, or calls `-Tier heavy` for an independent hypothesis. If that also fails, the task is marked `escalated` and the run moves on.
6. On `pass`, Claude reads `git diff --stat` and the review summary. It reads the full diff only for files touching auth, RLS, migrations or `apps/api/src/auth*`, then commits.
7. Claude appends the task's block to `resumora/docs/plans/<name>.progress.md`: status, commit, Codex sessions, open issues, the Codex token sum, and guard denials.

**Phases:**
- After 4 tasks, Claude stops and continues in a fresh session (`start_session`, context `fresh`). The new session reads only the skill, the plan and the progress file.
- When the user is present, Claude offers the split instead of doing it.

**End of run:**
- One `-Review` of the whole branch, from base to HEAD.
- A cost line in the progress file.
- Push or PR only after the user says yes.

### 4. `CODEX-DELEGATION.md` (edit)

- Replace "Writing code by default" under "When Claude does not" with a short pointer: building goes through the `codex-build` skill.
- Add a "Guardrails" section that lists the hooks and the override.
- Remove "Claude stays the only writer". Codex now writes in worktrees.
- Keep the secrets and decisions rules unchanged.

## Data flow per task

```
brief (plan file) → -Build (Sol, worktree) → -Test → scope check → -Review (Astra, fresh)
      ↑                         │ fail            │ fail           │ fix
      └── -Build -Resume ◄──────┴─────────────────┴────────────────┘   (≤2 rounds, then escalate)
pass → Claude: diff --stat + summary (+ full diff for auth/RLS/migrations) → git commit (gate checks tree) → progress entry
```

## Error handling

- Codex `FAILED` or `ERROR`, or no output file: the script exits 1 and logs `failed`. The skill retries once, then escalates.
- Worktree missing `node_modules`: `-Test` runs `npm ci` (logged).
- Codex quota exhausted: the task is marked `blocked: codex quota` and the run stops. Claude does not take over the building, since the guard would deny it anyway, unless the user creates the override.

## Testing

- `tools/guard.tests.ps1`: each guard rule, the override, fail closed, and paths outside resumora being allowed.
- `codex-ask.ps1`:
  - `-Build` refuses the main checkout and a worktree containing `.dev.vars`.
  - The scope check against a fake diff.
  - A read-only violation is detected.

  These are tested on a throwaway worktree.
- A dry run: one real small task through the whole skill, reporting Claude vs Codex tokens.

## Out of scope

- An external orchestrator (approach C).
- Codex's paid priority tier.
- Supabase access for Codex.
- Changes to the RTK hook.
