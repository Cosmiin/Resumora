# codex-build redesign: map, librarian, risk check and audit

**Status:** draft for the owner's review
**Rules:** `C:\Users\mcosm\claude\resumora\codex-build-improvements.md` (the workspace folder, outside the product repo) holds the approved behaviour rules. This spec says how they're built. Where the two seem to disagree, the rules file wins and this spec gets fixed.

## Goal

Codex does more of the work (risk checks, building, reviews, bug hunts, security tests, the audit and the codebase map), steered by Claude through sharp briefs and a living map of the code. Claude's weekly budget is the scarce resource; Codex quota is plentiful.

Success looks like:
- fewer fix rounds and "fix" verdicts per task, because risks and context reach Codex before it builds;
- no scope fails caused by the plan's file list;
- a map that agents trust, because scripts prove it's current and its citations real;
- an audit whose serious findings are each proven by a failing test.

## Components

| # | Component | New or changed | Built by |
|---|---|---|---|
| 1 | `tools/map.ps1` + `tools/map.tests.ps1` | new | Claude |
| 2 | `tools/codex-ask.ps1` + `tools/codex-ask.tests.ps1` | changed | Claude |
| 3 | `tools/build.schema.json`, new `tools/audit.schema.json` | changed / new | Claude |
| 4 | `tools/guard.ps1` + `tools/guard.tests.ps1` | changed | Claude |
| 5 | `.claude/skills/codex-build/SKILL.md` | rewritten | Claude |
| 6 | `.claude/skills/librarian/SKILL.md` | new | Claude |
| 7 | `.claude/skills/codex-audit/SKILL.md` | new | Claude |
| 8 | `tools/pitfalls.md`, `tools/examples.md`, `tools/contract-claims.md` | new | Claude (librarian) |
| 9 | `CODEX-DELEGATION.md` | updated | Claude |
| 10 | `resumora/docs/map/` (the map itself) | new, on the owner's command | Astra, librarian |

**Who builds it:** every file in 1–9 lives in `tools/` or `.claude/` of the workspace folder, which is outside the product repo and outside the guard's product-code rule. Claude builds them directly, test-first, with the existing PowerShell test scripts. Each component gets a Codex `deep` review of its finished files before it counts as done. The map (10) lives in the product repo, because it has to be versioned with the code.

## 1. `tools/map.ps1`

Plain git and file reading. No AI, no network. Runs on Windows PowerShell 5.1.
Usage: `.\tools\map.ps1 <command> [-Repo <path>] [args]`. `-Repo` defaults to `resumora\`, and to a worktree when a worktree path is passed.

### Map entry format (`docs/map/<area>/<name>.md`)

```markdown
---
id: db/cover-letters
area: db
files: [supabase/migrations/20261106_letters.sql, apps/api/src/letters/repo.ts]
depends_on: [shared/letter-type, db/rls-child-tables]
contract: true
checked_hash: 9f2c41ab
decisions: [docs/decisions/2026-11-06-letters-delete-with-job.md]
open: [R14]
---
<one-paragraph purpose>
- <claim> `path:line` → `symbol`
- ...
## Connections
- used by: web/letter-editor (`LetterEditor.tsx:30` → `saveLetter(`)
- uses: shared/letter-type
## Pitfalls
- P7 (see tools/pitfalls.md)
```

- `contract: true` marks shared types, tables, RLS, API routes, queue messages and AI prompts. Contract entries count as overlap in the parallel check, and they're what the claims list refers to.
- `files` entries are repo-relative. An entry may cover several files, and a file may appear in several entries.
- `checked_hash` is a **fingerprint of the covered files' contents** at the last check: the first 8 hex characters of a SHA-256 over one `<path>:<git hash-object id>` line per covered file (`<path>:missing` for a deleted file), sorted by path. The path is included so a rename also counts as a change. It's content-based on purpose. A commit ID would disappear when a PR is squash-merged or a branch is rebased, which would make every entry look stale after a merge.
- The exclusion list lives in `docs/map/EXCLUDE.txt` (glob per line, e.g. generated files, lockfiles, test fixtures).

### Commands

| Command | Behaviour | Exit code |
|---|---|---|
| `check [-Entries <ids>] [-Fix]` | For each entry (or the given ones): **stale** if the current fingerprint of its `files` differs from `checked_hash`. **Stale (dependency)** if any `depends_on` entry is stale, one step only. Citations: **OK** if the claim's `symbol` is within ±10 lines of its cited line; **moved** if it's elsewhere in the same file (with `-Fix`, the script rewrites the line number; moved citations alone don't fail the check); **broken** only if the symbol isn't in the file at all. Also reports `files` that no longer exist. | 0 all OK or only moved, 2 any stale, broken or missing |
| `coverage [-Paths <p1,p2>]` | Lists files from `git ls-files apps packages supabase` (tracked and new) that are in no entry's `files` and match no `EXCLUDE.txt` glob. `-Paths` limits it to one area's folders, which the area brief lists. Unknown options are refused. | 0 / 2 |
| `slice <files...>` | Entries whose `files` include any given file, plus their `depends_on` entries (one step), plus entries that list them under `depends_on` when they're contracts. For each: id, stale or OK, decisions, open issues, pitfalls. | 0 |
| `index` | Rewrites `docs/map/INDEX.md` from the entry headers, sorted by area then id: id, one-line purpose, files. | 0 |
| `used -Given <ids> -Used <ids> [-Task <name>]` | Prints entries used but not given (**slice misses**) and appends them to `tools/map-log.jsonl`. | 0 |
| `claims` | Reads `tools/contract-claims.md` and reports any contract id claimed by two open plans. | 0 / 2 |
| `stamp -Entries <ids>` | Sets `checked_hash` to the current fingerprint for the given entries. Used after an entry is refreshed and reviewed. | 0 |

### Tests (`tools/map.tests.ps1`)
The tests build a throwaway git repo in `%TEMP%` with 3 code files and 4 entries, then cover: fresh vs stale; **an entry stays fresh after a squash merge and a rebase** (same contents, new commits); one-step dependency staleness (not two steps); a citation found at the line, found 5 lines away, moved 40 lines (reported as moved, corrected by `-Fix`), and missing from the file (broken); a deleted file; coverage with and without exclusions; a slice including dependencies; index output; a slice miss logged; a duplicate claim. Same style as `guard.tests.ps1`.

## 2. `tools/codex-ask.ps1`

### `-Test` (changed)
1. `npm test`, as today.
2. **Retry once, inside the right package:** if it fails, take the failing test files from the FAIL lines, work out which workspace package each belongs to (`apps/web`, `apps/api`, `packages/*`), and rerun them with that package's own test command (`npm test -w <package> -- <file>`), so each package's own test config is used. Passing on the retry counts as a pass, and the output says `PASS (N tests, 1 file retried)`.
3. `npm run typecheck`. A failure shows `FAIL typecheck` plus at most 10 error lines.
4. `npm run db:test` when `git diff --name-only <Base> -- supabase/migrations` is non-empty (`-Base` defaults to the worktree's merge base with its parent branch, or is passed in). **Only one database test run at a time:** there's a single local Supabase database, so `-Test` takes a lock (`%TEMP%\resumora-dbtest.lock`, created exclusively, with the worktree path and start time inside) before `db:test` and releases it afterwards. A second lane waits, checking every 10 seconds. A lock older than 30 minutes, or held by a process that no longer runs, counts as abandoned and is taken over. The wait time appears in the output.
5. `map.ps1 check -Entries <entries whose files changed since Base>`. A failure shows `FAIL map` plus the problems.

Output stays condensed: `PASS (...)` or `FAIL` with at most 10 lines per failing step. The log gets one line per run with the steps' results.

### `-Risk` (new)
`-Risk -Worktree <wt> -Brief <brief>`. The `deep` tier (Sol on high, the tier CODEX-DELEGATION.md already uses for counterpoints), read-only, structured output (`codex-findings.schema.json`, at most 3 findings in the prompt, plus "missing scope files" as findings whose claim starts with `missing file:`). Prompt in section 9.

### `-Build` (changed)
- The prompt adds the map rules: use the slice in the brief, read more entries under `docs/map/` when needed, update the entries for the files you change, and report what you used.
- `build.schema.json` gains two required arrays: `map_entries_used` (ids) and `map_gaps` (strings, each `path:line` plus what's missing or wrong).
- **Fresh fix sessions:** a new switch `-Fresh` on a fix round starts a new session instead of resuming, with the prompt "Fix round. Fix only these: <findings>. Context: <fix slice>. The current diff is in your working tree." plus the brief. The skill uses `-Resume` for round 1 and `-Fresh` from round 2 on. The log records `tier: fix-fresh`.

### `-Review` (changed)
The prompt adds two checks to the existing bug and unnecessary-code rules: "the map entries for the changed files still match the code (report a mismatch as a finding)", and "zero findings is a good answer" (already implied, made explicit).

### `-Ask` prompts for the end of a part
The bug hunt and the security test are `-Tier heavy` questions with fixed prompts (section 9), run against the part's worktree with `-Repo <wt>`.

### `-Audit` (new)
`-Audit -Area <name> -Repo <path>`: Astra on high, read-only, `audit.schema.json` output. The prompt is in section 9.

### `-MapArea` (new)
`-MapArea <area> -Worktree <wt> -Brief <area brief>`: Astra on high **with write access in a worktree**, like `-Build`. It writes only under `docs/map/<area>/`. The scope check limits it to that folder, with no size limit (the brief's `size` is set high). Secret-file rules as in `-Build`.

### Tests
`codex-ask.tests.ps1` gains: `Format-TestResult` with a retried pass; the retry picks the right package for a failing file; the database-test lock (a second run waits, an abandoned lock is taken over); the test steps chosen by a migration diff; `-Fresh` refused without `-Build`; `-Risk` and `-Audit` refused without their required arguments; `-MapArea` scope limited to `docs/map/<area>/`.

### Cost tags and `tools/cost-report.ps1` (added 2026-11-10)
- New parameters `-TaskId <feature>#<n>` and `-Purpose core|overhead`. Every mode except plain questions refuses to run without both. Each log line gains `task_id` and `purpose` (`untagged` for questions).
- `core` = the task's own work (risk check, build, test, review, fix rounds, escalation, and part-level review, bug hunt and security test as `<feature>#part<P>`). `overhead` = map fix jobs, debrief questions, map building.
- `tools/cost-report.ps1 [-Feature f] [-Log] [-MapLog] [-BaselineFrom 2026-11-04] [-BaselineTo 2026-11-08]` prints per feature and per task: Codex tokens counted once per session (cumulative counters split into per-call increments, so an overhead call on a resumed session counts only what it added), minutes, overhead share, fix rounds, review fix rate and slice misses (from `tools/map-log.jsonl`), then the medians per task against the baseline. Baseline tasks are untagged older rows grouped by brief file name, with fix rounds attached through their session. Their test runs were never tagged, which the report says.
- Each part's cost line in `codex-build` records Claude's weekly usage % before the part's first task and after the part.

## 3. Schemas

`build.schema.json`: add `map_entries_used: string[]` and `map_gaps: string[]` (both required, may be empty).

`audit.schema.json` (new):
```json
{ "summary": "string (max 2 sentences)",
  "findings": [ {
    "location": "path:line",
    "severity": "high | medium | low",
    "claim": "one sentence",
    "reproduce": "exact steps (attacker steps for security)",
    "related": ["path:line"],
    "fixes": [ { "change": "string", "lines": "integer", "user_impact": "string", "performance_cost": "string" } ]
  } ] }
```
`fixes` has at most 2 items, smallest first. `findings` has no fixed cap: zero is valid.

## 4. `tools/guard.ps1`

In the `bash-write` rule, skip the write check, even if `apps/` or `packages/` paths appear, **only** when the whole command is one **plain** read-only git call:
- `git` (optionally `-C <path>`), then `diff`, `log`, `show`, `status` or `ls-files` (`blame` is excluded: it can apply converters);
- `diff`, `log` and `show` must include both `--no-textconv` and `--no-ext-diff`, because git runs configured converters by default;
- **no other global options**: no `-c`, `--config-env`, `--exec-path`, `--git-dir` or `--work-tree`, because `git -c core.pager=...` and similar settings can run any program;
- no `--output`, `-o`, `--ext-diff`, `--textconv`, `--contents`, `-O` or pager options on the subcommand;
- no quotes at all (they can hide option names, as in `--out"put"`), and none of `$ @ ( ) { }` (PowerShell runs code inside `@(...)`, `$(...)` and `${...}`);
- no `>`, `<`, `|`, `;`, `&` or backticks.

`--output` is also added to the guard's general write signals, because `git diff --output=<path>` writes a file.
(The `blame`, converter, quote and `@(...)` rules come from the Codex security review of the first version, which found working bypasses.)

Anything else gets the normal rules. Tests:
- allowed: `git diff HEAD -- apps/x.ts`, `git -C ../wt log -- apps/x.ts`;
- denied: `git diff > apps/x.ts`, `git show HEAD:apps/x.ts | tee apps/y`, `git -c core.pager="cp a apps/b" log`, `git diff --output=apps/x.ts`, `git diff --ext-diff`, `git log; rm apps/x`.

## 5. `codex-build` skill (rewritten)

It keeps today's inputs, commit gate, phases, progress block, error handling and limits (2 fix rounds, 1 escalation, at most 2 whole-branch reviews per part). It changes or adds:

**Per task**
1. `librarian`: slice (section 6).
2. `-Risk`. Claude keeps only risks the cited code backs up, rewrites them as test cases in the brief, and adds any missing scope files to the scope block.
3. Brief: slice, pattern to copy (`path:line`), risks as test cases, "do not" list, matching pitfalls. Saved to `%TEMP%\brief-<name>-<N>.md`.
4. `-Build`.
5. `-Test`.
6. `-Review`.
7. Fix rounds: the `librarian` fix slice before each round; `-Resume` in round 1, `-Fresh` from round 2; the cause check after.
8. Commit; progress block; `librarian` after-task step (`used`, map gaps, debrief question).

**Parallel lanes**
- Before a part starts, Claude computes lanes from the scope blocks plus `map.ps1 slice` for each task's files. Tasks are independent when their files and their slice entries don't overlap, no contract entry is shared, and the plan doesn't order them. A task that defines a contract another task uses goes first, in its own lane.
- One worktree per lane: `resumora-<name>-<lane>`, branched from the part branch.
- After a lane finishes, it merges into the part branch, followed by `-Test` on the merged branch, `map.ps1 check`, `map.ps1 index`, and refreshing entries changed in both lanes (a `map fix` job). Only then does the next lane merge or work continue.
- The progress file gets a `## Lanes` table: lane, worktree, tasks, current task, last commit, last step. A lane is merged only when all its tasks are `done`.

**End of part:** the whole-branch bug hunt (`-Tier heavy`, section 9); the security test when the part's diff touches `supabase/migrations`, `apps/api/src/**/routes*`, `apps/api/src/auth*` or RLS; `map.ps1 check`, `coverage`, `index`; the cost line; push and draft PR as today.

**Map fix job:** a mini task whose scope block lists only the map entry files, built with `-Build`, tested with `map.ps1 check`, reviewed with `-Review`. Used for gaps found after a commit and for refreshes after merges.

## 6. `librarian` skill (new)

A Claude skill, called by `codex-build`, `codex-audit` and on demand. Sections:
- **Role and boundary:** information, not code. Scripts for everything mechanical; judgement for choosing context and asking questions.
- **Slice (before a task):** `map.ps1 slice <task files>`; refresh any stale entry first (a map fix job); add entries if judgement says so, never remove any; write the slice into the brief as a "Map" section (entry ids plus their key claims and connections).
- **Fix slice (before a fix round):** `map.ps1 slice <files named in the findings>`, plus a "who else uses this" list from the entries' `Connections`, plus matching pitfalls, decisions and open issues.
- **After a task:** `map.ps1 used`; turn `map_gaps` into map fixes; the cause check after a fix round (map wrong → fix the entry; information missing → fill the gap; ignored → sharpen the brief template or add a pitfall).
- **Debrief question:** the rules in section 11 of the rules file, including the reject-generic-wisdom standard and "no question is a good outcome". The question goes to the build session with `-Resume <session> -Task "<question>"`. Kept answers become map fixes or pitfalls.
- **First map build:** its top priority. After each area, a question round to the mapping session (example questions in the rules file, section 6), then `check`, `coverage` and 3 random spot-checks before the area counts as done.
- **Health check (on demand):** `check`, `coverage`, `index`, `claims`, then a short report.
- **Knowledge files:** keeps `tools/pitfalls.md` (`P<n>`: rule, why, applies to entries, source), `tools/examples.md` (one model brief, one model finding), the `decisions` and `open` links in entries, and `tools/contract-claims.md` (plan, contract ids, status open or merged).

## 7. `codex-audit` skill (new)

1. The owner asks for an audit, optionally of named areas.
2. Areas (default): security and data access; API routes and input validation; frontend state and the editor; AI and queue workers; connections between parts. Each one is an `-Audit` run, in parallel (background).
3. The librarian gives each area its slice of the map (the whole area) as context.
4. **Proof:** for each high or medium finding, one Codex `-Build` in that area's own worktree (`resumora-audit-<area>`, from `main`; one worktree per area, so parallel areas never touch each other's tests) writes a test that should fail. Database proof tests share the database-test lock (section 2). `-Test` runs it. The finding is **proven** only if the test fails on an assertion that matches the claim (not a crash or connection error), and a `-Review` of the test agrees. A finding whose test passes is dropped. Proof tests stay uncommitted in the audit worktree until a fix uses them.
5. Report: `docs/audits/<date>-audit.md` with the proven findings first (severity, location, reproduction, related code, fixes with lines, user impact and performance cost), then the low findings, then the dropped ones (one line each).
6. The owner picks findings. Claude turns them into a plan (`## Task N` with scope blocks); each picked finding's proof test is that task's acceptance test. `codex-build` runs it. Picked findings are added to their map entries' `open` lists until fixed.

## 8. `CODEX-DELEGATION.md`

Add the new modes (`-Risk`, `-Fresh`, `-Audit`, `-MapArea`) to "How a call looks"; note that the audit format is the one place where proposals are allowed; move the risk-check prompt from "Counterpoints" to the codex-build flow; add the map and the librarian to "Guardrails". The "Never delegate" rules stay as they are and apply to the map.

## 9. Prompts

Every Codex prompt keeps today's rules (read-only unless building, no secret files, a progress sentence before each step) and adds **"If nothing qualifies, return no findings: that is a good answer."**

- **Risk check:** "Before this task is built, find at most 3 concrete ways it could break or conflict with existing code, each with path:line evidence. Also list files the task will probably need to change that its scope block does not list, as findings starting `missing file:`. No designs, no hardening, no 'consider adding'."
- **Bug hunt (end of part):** "Review the whole branch diff against <part base> for bugs that come from tasks interacting: a contract changed by one task and used by another, missing checks across files, state that two tasks both touch. Report only concrete bugs with path:line."
- **Security test:** today's "Security review" prompt, plus: "Each finding gives the attacker's exact steps. Each proposed fix states its user impact and its performance cost (extra queries, network calls or work per request, and whether that's on a busy path). If a fix adds friction or slows a busy path, give a lighter alternative or say there is none."
- **Audit (per area):** "Find real problems in <area>: bugs, security holes, data loss, broken contracts. For each: location, severity, how to reproduce, related code, and at most 2 fixes, smallest first, each with lines changed, user impact and performance cost. No style issues, no refactors, no generic hardening."
- **Map area (first build):** "Map <area> into entries under docs/map/<area>/ in the given format. Focus on contracts and connections: what each part depends on, what depends on it, what a change here affects. Every claim ends with `path:line` → `symbol`. Cover every file in the area or list it in EXCLUDE.txt with a reason. Never open .env*, .dev.vars or secret files."

## 10. Build order

1. `map.ps1` and its tests (everything else depends on it).
2. Schema changes and `codex-ask.ps1`: `-Test`, then `-Risk` and `-Fresh`, then `-Build`/`-Review` prompt changes, then `-Audit` and `-MapArea`, each with tests.
3. The guard change and its tests.
4. `librarian` skill, plus empty `pitfalls.md`, `examples.md` and `contract-claims.md`. The librarian fills `pitfalls.md` from the existing progress files' rulings and notes, and `examples.md` from one past brief and one past finding.
5. `codex-build` rewrite.
6. `codex-audit` skill.
7. `CODEX-DELEGATION.md` update.
8. **On the owner's command:** the first map build, area by area.

Until step 8, the map is empty. `codex-build` then runs without slices: `map.ps1 slice` returns nothing, and the brief's Map section says "no map yet".

## Testing

- Scripts: `map.tests.ps1`, `codex-ask.tests.ps1` and `guard.tests.ps1` must all pass after every change.
- Skills: a dry run of the new `codex-build` on a tiny throwaway plan (one task, e.g. a docs-only change in a worktree) checks the order of steps, the brief format and the progress block, before it's used on real work.
- The first map build is checked by its own gates (citations, coverage, spot-checks, question round).

## Out of scope

- Simplify passes.
- Size limits on map entries or slices.
- Scheduled or automatic audits.
- Changing the Codex models or tiers in use.
