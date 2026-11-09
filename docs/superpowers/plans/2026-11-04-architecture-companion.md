# Architecture Companion (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A side panel in the Claude desktop app that shows the open project's database map, its decision records and the user's concept cards, plus the first decisions, cards and rules for Resumora.

**Architecture:** The mod is a hooks module (`register.tsx`) that opens a pane. It reads project files through `$.fs`, turns them into plain data with pure parsers (`schema.ts`, `docs.ts`), keeps that data in `$.state` atoms, and draws three tabs (`views.tsx`). It never calls a model. Resumora gets plain-text content files and a new section in `AGENTS.md`.

**Tech Stack:** Claude Code mod API (`claude-code`, `claude-code/testing`), TypeScript/TSX, no npm dependencies. Types: `C:/Users/mcosm/AppData/Local/Temp/claude/bundled-skills/2.1.317/611abc2f8a7c1f4b4a3d827004985462/plugin-authoring/types/claude-code.d.ts` (grep it; e.g. `fs: {`, `Pane: {`, `Button: {`). The example `examples/pane.tsx` and `examples/pane.test.tsx` next to it show the pane, atom and test patterns to follow.

**Spec:** `docs/superpowers/specs/2026-11-04-architecture-companion-design.md`

## Global Constraints

- Mod folder: `C:\Users\mcosm\.claude\dev-mods\eec61be8-d0ed-4e81-a791-ed2b8c033031\architecture-companion\` (call it `MOD/`). It is not a git repo, so its tasks have no commit step.
- The panel never calls an AI model and never writes files in Stage 1.
- No npm dependencies. The module has no DOM or Node, so file access only goes through `$.fs`.
- Files stay under ~300 lines (Resumora convention).
- Resumora commits: conventional, one line (`docs: ...`). **Stage only the files this plan creates or changes.** The working tree has unrelated uncommitted work (`apps/web/src/test/sample-cv.ts`, `apps/web/src/cv/side-panel.test.tsx`) that must not be committed.
- Plain words in all text the user reads. Footer copy, verbatim: `Shows only what's in this project's files. Settings made only in the Supabase or Cloudflare dashboards are not included.`
- Decision file names: `docs/decisions/NNNN-short-title.md` (4 digits). Concept files: `docs/learning/concepts/<id>.md`. Progress: `docs/learning/progress.json`.
- Learned rule (Stage 1): a concept is learned when `seen >= 5`; otherwise its stage is `seen` (0 = not met yet).

## Review Focus

1. **Different SQL spellings:** `create table if not exists`, no `public.` prefix, quoted names (`"Users"`). The table should still appear with the right name. Tested in Task 1.
2. **A later `alter table ... add column`:** the column should show on the table. Tested in Task 1.
3. **Windows line endings (CRLF) in decision or concept files:** they should parse the same as LF. Tested in Task 2.
4. **Stray files in the folders** (`README.md` in `docs/decisions/`, `.DS_Store`, a folder): ignore them and don't show warnings. Tested in Task 3.
5. **A project with no `supabase/` or `docs/` at all** (any new project): every tab shows its empty-state hint and nothing crashes. Tested in Task 3 and Task 4.

---

### Task 1: Mod skeleton and migration reader

**Files:**
- Create: `MOD/.claude-plugin/plugin.json`: `{ "name": "architecture-companion", "version": "0.1.0", "description": "See your app's database, decisions and concepts beside the chat", "types": "./types/index.d.ts" }`
- Create: `MOD/hooks/hooks.json`: `{ "modules": ["./register.tsx"] }`
- Create: `MOD/hooks/register.tsx`: for now just `export const register: Register = () => {}`
- Create: `MOD/types/index.d.ts`: empty `PluginState` entry for `'architecture-companion'` (filled in Task 4)
- Create: `MOD/hooks/schema.ts`
- Create: `MOD/hooks/fixtures/resumora-migrations.ts`: exports `resumoraMigrations: { name: string; text: string }[]`, the four files in `supabase/migrations/` copied word for word, in file-name order
- Test: `MOD/hooks/schema.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Column = { name: string; type: string; references?: string } // "auth.users(id)"
  export type Table = { schema: string; name: string; columns: Column[]; rls: boolean; policies: string[]; createdIn: string }
  export type Bucket = { id: string; isPublic: boolean; policies: string[] }
  export type Schema = { tables: Table[]; buckets: Bucket[]; warnings: string[] }
  export function readSchema(files: { name: string; text: string }[]): Schema
  ```

- [ ] **Step 1: Write the failing tests** in `schema.test.ts` (use `test`/`expect` from `claude-code/testing` and ignore the `$` argument):
  - `reads Resumora's tables`: `readSchema(resumoraMigrations).tables.map(t => t.name)` equals `['base_cvs', 'base_cv_versions', 'ai_calls', 'cv_imports']`. Every table has `rls === true`. Every table has a column `user_id` with `references === 'auth.users(id)'`.
  - `reads policies`: `base_cvs.policies` equals `['own cv: read', 'own cv: create', 'own cv: update']`. `cv_imports.createdIn` equals `'20261105000000_imports.sql'`.
  - `reads the storage bucket`: `buckets` equals `[{ id: 'cv-imports', isPublic: false, policies: ['own import files: upload', 'own import files: read'] }]`.
  - `skips constraint lines`: a column list with `primary key (a, b)`, `constraint x check (...)` and `unique (a)` produces no columns named `primary`, `constraint` or `unique`.
  - `other spellings` (Review Focus 1): `create table if not exists "Notes" (id uuid)` and `create table tags (id int)` give tables `Notes` and `tags`, both with schema `public`.
  - `added columns` (Review Focus 2): a second file with `alter table public.tags add column label text;` gives `tags` the columns `['id', 'label']`.
  - `unknown statements`: `create table broken (` with no closing `);` adds one entry to `warnings` and doesn't throw.

- [ ] **Step 2: Run them and confirm they fail.** Run: `claude plugin test MOD`. Expected: FAIL because `readSchema` isn't defined.

- [ ] **Step 3: Implement `readSchema` in `schema.ts`.** Go through the files in the order given. Remove `--` comments first. Find statements with case-insensitive regexes for `create table [if not exists] <name> ( … );`, `alter table <name> enable row level security`, `alter table <name> add column <col> <type>`, `create policy "<p>" on <name>`, and `insert into storage.buckets (…) values ('<id>', …, <public>, …)`. Split the column list on commas at paren depth 0. A policy on `storage.objects` belongs to every bucket whose id appears as `bucket_id = '<id>'` in its body. Names lose their quotes, and a name without a schema gets `public`.

- [ ] **Step 4: Run the tests and confirm they pass.** Run: `claude plugin test MOD`. Expected: all `schema.test.ts` tests PASS.

### Task 2: Decision, concept and progress readers

**Files:**
- Create: `MOD/hooks/docs.ts`
- Test: `MOD/hooks/docs.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Decision = { id: number; title: string; date: string; status: string; affects: string[]; concepts: string[]; body: string; file: string; warnings: string[] }
  export type Concept = { id: string; title: string; files: string[]; related: string[]; body: string; file: string; warnings: string[] }
  export type ProgressEntry = { seen: number; lastSeen: string; quizRight: number; quizWrong: number }
  export type Progress = Record<string, ProgressEntry>
  export function parseFrontmatter(text: string): { fields: Record<string, string | string[]>; body: string }
  export function readDecision(file: string, text: string): Decision
  export function readConcept(file: string, text: string): Concept
  export function readProgress(text: string | null): { progress: Progress; warning?: string }
  export function stageOf(entry: ProgressEntry | undefined): number | 'learned' // 0 = not met yet
  ```

- [ ] **Step 1: Write the failing tests** in `docs.test.ts`:
  - `reads a decision`: the spec's example record (id 7, `affects: [table:base_cv_versions, table:base_cvs, route:/v1/cv]`, a trailing `# accepted | replaced-by-NNNN` comment on `status`) gives `id: 7`, `status: 'accepted'`, `affects` with those 3 items, `warnings: []`, and a `body` that starts with `## What we decided`.
  - `keeps a decision with missing fields`: no `date` and no `concepts` gives `date: ''`, `concepts: []`, and `warnings` containing `'missing date'`.
  - `crlf` (Review Focus 3): the same record with `\r\n` line endings gives a result equal to the LF one.
  - `reads a concept`: the spec's `rls` example gives `files: ['supabase/migrations/20261104000000_baseline.sql']` and `related: ['jwt', 'supabase-auth']`.
  - `progress`: `readProgress(null)` returns `{ progress: {} }` with no warning. `readProgress('{bad')` returns `{ progress: {}, warning: 'progress.json could not be read; showing no progress' }`.
  - `stages`: `stageOf(undefined) === 0`, `stageOf({ seen: 3, … }) === 3`, `stageOf({ seen: 5, … }) === 'learned'`.

- [ ] **Step 2: Run them and confirm they fail.** Run: `claude plugin test MOD`. Expected: FAIL because the functions aren't defined.

- [ ] **Step 3: Implement them in `docs.ts`.** Normalize `\r\n` to `\n` first. The frontmatter is the block between the first two `---` lines. Each line is `key: value` with a trailing ` # …` removed. A value like `[a, b]` becomes a list of trimmed strings. A file without frontmatter gives empty fields and the whole text as `body`. Missing required fields go into `warnings` as `missing <field>`: `id, title, date, status` for decisions, `id, title` for concepts.

- [ ] **Step 4: Run the tests and confirm they pass.** Run: `claude plugin test MOD`. Expected: PASS.

### Task 3: Project loader

**Files:**
- Create: `MOD/hooks/load.ts`
- Test: `MOD/hooks/load.test.ts`

**Interfaces:**
- Consumes: `readSchema` (Task 1); `readDecision`, `readConcept`, `readProgress` (Task 2)
- Produces:
  ```ts
  export type ProjectData = {
    schema: Schema; decisions: Decision[]; concepts: Concept[]; progress: Progress
    missing: { migrations: boolean; decisions: boolean; concepts: boolean }
    warnings: string[]; loadedAt: string
  }
  export function loadProject($: Dollar): Promise<ProjectData>  // Dollar: the `$` type from 'claude-code'
  ```

- [ ] **Step 1: Write the failing tests** in `load.test.ts`. Stub the engine's `fs.exists`, `fs.list` and `fs.read` calls with `on(...)` hooks answering `{ value }`, as in `examples/pane.test.tsx`. Check the exact event names in the types file.
  - `loads a full project`: 2 migration files, 2 decision files (`0002-b.md` and `0001-a.md`) and 1 concept give 2 tables, and decisions sorted **newest first by id** (`[2, 1]`).
  - `ignores stray files` (Review Focus 4): `docs/decisions/` that also contains `README.md`, `.DS_Store` and a folder `old/` still gives 2 decisions and no new warnings. Only `^\d{4}-.*\.md$` files are decisions, and only `.md` files are concepts.
  - `empty project` (Review Focus 5): `fs.exists` false for everything gives `missing` all true, `schema.tables: []`, `decisions: []`, `progress: {}`, and no throw.
  - `unreadable file`: `fs.read` rejecting for one decision gives the other decisions plus one entry in `warnings` naming the file.

- [ ] **Step 2: Run them and confirm they fail.** Run: `claude plugin test MOD`. Expected: FAIL.

- [ ] **Step 3: Implement `loadProject` in `load.ts`.** Paths are relative to the working directory: `supabase/migrations`, `docs/decisions`, `docs/learning/concepts`, `docs/learning/progress.json`. Migrations are `.sql` files, read in name order. Each file read is in its own `try`, so one bad file never hides the rest. `warnings` collects the schema warnings, each item's warnings prefixed with its file name, and the progress warning.

- [ ] **Step 4: Run the tests and confirm they pass.** Run: `claude plugin test MOD`. Expected: PASS.

### Task 4: The pane

**Files:**
- Modify: `MOD/hooks/register.tsx`: wiring only (pane, command, atoms, refresh)
- Create: `MOD/hooks/views.tsx`: one drawing function per tab
- Modify: `MOD/types/index.d.ts`: the state contract
- Test: `MOD/hooks/pane.test.tsx`

**Interfaces:**
- Consumes: `loadProject`, `ProjectData` (Task 3); `stageOf` (Task 2)
- Produces:
  - State (`types/index.d.ts`, under `'architecture-companion'`): `project: Shaped<ProjectData | null>`, `view: Shaped<{ tab: 'map' | 'decisions' | 'learn'; selected?: string }>`. Atom shapes are tagged `'project-1'` and `'view-1'`.
  - Pane id `'architecture'`, title `'Architecture'`. Slash command `/architecture` (description: `Open the architecture panel and reload it`).
  - `views.tsx`: `mapView`, `decisionsView` and `learnView`, each `(ui, data: ProjectData, view, select: (id?: string) => void) => JSX`, where `ui` is what `$.ui.resolve(e)` returns.

- [ ] **Step 1: Write the failing tests** in `pane.test.tsx`. Follow `examples/pane.test.tsx` and stub `fs.*` with a small Resumora-like project (2 tables, 1 decision, 2 concepts, progress `{ "rls": { "seen": 5, … } }`).
  - `map lists tables`: on mount, Texts show `base_cvs` and `ai_calls`. Pressing the `base_cvs` Button shows its column `user_id → auth.users(id)`, `Security rules: on`, the policy `own cv: read`, `Created in 20261104000000_baseline.sql`, and the title of the decision whose `affects` includes `table:base_cvs`.
  - `decisions tab`: pressing the `Decisions` tab Button shows the decision titles. Pressing one shows its body text.
  - `learn tab`: shows `Row-level security (RLS)` with `✓ learned`, and the other concept under `Not met yet`.
  - `footer`: the footer copy from Global Constraints is present on every tab.
  - `empty project` (Review Focus 5): with nothing on disk, Map shows `No database migrations found in supabase/migrations yet.`, Decisions shows `No decision records yet. Claude adds one in docs/decisions/ when it makes an architectural choice.`, and Learn shows `No concepts yet. They appear here as Claude teaches them.`
  - `every surface`: the map test passes for `terminal`, `desktop`, `vscode` and `mobile`.
  - `old stored value`: a stored `project` without the `'project-1'` shape is declined, and the pane loads again instead of crashing.

- [ ] **Step 2: Run them and confirm they fail.** Run: `claude plugin test MOD`. Expected: FAIL.

- [ ] **Step 3: Implement it.** In `register.tsx`:
  - On `session.start`: register the command, call `loadProject` into the `project` atom, and open the pane.
  - On `command.run` for `architecture`: reload and open.
  - On `ui.render` for the pane: tab Buttons at the top, then the current tab's view, then a `Refresh` Button and the dim footer.
  - Selecting a tab clears `selected`.

  In `views.tsx`: lists are Buttons, and the selected item shows its details under the list. The Learn list is grouped as "Learning" (stage 1–4, shown as `stage N of 5`), "✓ learned" and "Not met yet".

- [ ] **Step 4: Run the tests and confirm they pass.** Run: `claude plugin test MOD`. Expected: PASS.

- [ ] **Step 5: Validate and type-check.** Run: `claude plugin validate MOD`, then `tsc -p MOD` once the engine has written `MOD/.claude-plugin/types/` (before that, use the header `tsconfig.json` from the types file, kept outside `MOD`). Expected: no errors.

### Task 5: Resumora content and rules

**Files (all in the Resumora repo):**
- Create: `docs/decisions/0001-…md` through `0008-…md`, the 8 records listed in the spec, in that order
- Create: `docs/learning/concepts/{migrations,rls,jwt,api-layer,queue,foreign-keys,version-check,shared-schemas}.md`
- Create: `docs/learning/progress.json`: `{}`
- Modify: `AGENTS.md`: add an `## Architecture companion` section

- [ ] **Step 1: Write the 8 decision records** in the spec's format. Base each one only on facts in `AGENTS.md`, `docs/superpowers/specs/2026-11-04-rebuild-design.md` and the code. Fill `affects` with real names: tables from the migrations, routes from `apps/api/src/*/routes.ts`, and files as `file:<path>`. Date: the commit date of the code or spec it comes from (`git log --format=%as -1 -- <path>`). Write them in plain words.

- [ ] **Step 2: Request human input.** Leave the `## Why this one` section of `0002` (the API acts as the signed-in user) as `TODO(human)` and ask the user to write 2–4 sentences in their own words. Then wait for them.

- [ ] **Step 3: Write the 8 concept cards** in the spec's format. Each card links at least one real file and fills every section, including `## Check question` with a question and its answer. Each card's `related` only names other card ids from this list.

- [ ] **Step 4: Add the `AGENTS.md` section**, under ~15 lines. It covers the three rules from spec part 5, the repetition table (seen 0 to 4, plus the once-per-day limit) and the file paths. Keep the file's existing style.

- [ ] **Step 5: Check it in the panel.** Run `/architecture` in a session opened on Resumora. Expected: Map shows 4 tables and the `cv-imports` bucket. Decisions shows 8 records with 0008 on top. Learn shows 8 cards under "Not met yet". No warnings appear.

- [ ] **Step 6: Commit.**
  ```bash
  git add docs/decisions docs/learning AGENTS.md docs/superpowers/specs/2026-11-04-architecture-companion-design.md docs/superpowers/plans/2026-11-04-architecture-companion.md
  git commit -m "docs: architecture companion decisions, concept cards and rules"
  ```
  Expected: `git status --short` still shows only the two unrelated files from before.
