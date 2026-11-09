# Architecture Companion: design

A mod for the Claude desktop app that helps a non-coder understand the web apps Claude builds for them.
First project: Resumora. It must also work on future projects.

## Goal

The user builds apps with Claude Code and does not write code. They want to:

1. **See the big picture** of their app (database, backend, how the parts connect) and **open any part for details**.
2. **Know why** each part of the architecture is the way it is. Every architectural decision is recorded and shown.
3. **Learn while building.** Concepts are taught in the context of their own app, repeated 4–5 times spaced out, and later checked with a short quiz.

Success: after a few weeks on Resumora, the user can explain in their own words how a request travels from the browser to the database, and why the main decisions were made.

## Principles

- **The panel only displays and makes no decisions.** It reads files and draws them. It never calls an AI model. All writing (decision records, concept cards, quiz questions) is done by the Claude chat session, which knows what it just did and why.
- **Files are the source of truth.** Everything lives as plain text in the project's git repo, next to the code.
- **Only what's in the code.** Settings made only in the Supabase or Cloudflare dashboards are not shown. The panel says this in its footer.

## Parts

### 1. The panel (the mod)

A side panel next to the chat, installed as a mod outside the Resumora repo so it works on any project. It reads the folder of the project that is currently open.

Tabs:

- **Map:** for Stage 1, the database layer. Tables, columns, links between tables (foreign keys) and security rules (RLS on/off plus policy names). Built by reading `supabase/migrations/*.sql` in order. Click a table to see its columns, its links, its policies, the migration that created it, and the decision records that mention it.
- **Decisions:** a timeline of decision records, newest first. Click one to read it in full.
- **Learn:** the concept cards the user has met, each with its stage (1–5 or ✓ learned) and the date last seen.

Empty states: if a folder is missing (no `docs/decisions/` yet, no migrations), the tab says what's missing and what would create it. It does not show an error.

### 2. Decision records (`docs/decisions/NNNN-short-title.md`)

```markdown
---
id: 7
title: Keep a history of CV saves
date: 2026-11-04
status: accepted            # accepted | replaced-by-NNNN
affects: [table:base_cv_versions, table:base_cvs, route:/v1/cv]
concepts: [migrations, rls]
---
## What we decided
## Options we considered
## Why this one
## What it means in practice
```

`affects` is how the Map links a table to its decisions. `concepts` links to concept cards.

**Initial records** (written from `AGENTS.md` and `docs/superpowers/specs/`):

1. An API on Cloudflare Workers sits between the browser and Supabase
2. The API queries the database as the signed-in user (RLS); only the import worker and the `ai_calls` log use the admin key
3. Shared schemas in `packages/shared` are used by the web app, the API and the extension
4. CV imports go through a queue instead of being processed during the request
5. One CV per user, with a history of versions
6. Last save wins, but a save that started from an old version gets a 409 conflict and the UI warns
7. Every AI call goes through `call-model.ts` (OpenRouter, then OpenAI as fallback) and is logged
8. Database changes are always a new migration and an applied migration is never edited

### 3. Concept cards (`docs/learning/concepts/<id>.md`)

```markdown
---
id: rls
title: Row-level security (RLS)
files: [supabase/migrations/20261104000000_baseline.sql]
related: [jwt, supabase-auth]
---
## What it is
## Why Resumora uses it
## What would break without it
## Connections            # used for repeat 3
## Check question         # used for repeat 4 (question + answer)
```

Starting concepts for Resumora: migrations, RLS, login tokens (JWT), API layer, queue, foreign keys, version check (409), shared schemas.

### 4. Learning progress (`docs/learning/progress.json`)

```json
{ "rls": { "seen": 3, "lastSeen": "2026-11-04", "quizRight": 0, "quizWrong": 0 } }
```

**Repetition cycle**, run by Claude in the chat whenever its work touches a concept:

| `seen` before | What Claude shows |
|---|---|
| 0 | Writes the card if it doesn't exist and shows the full explanation |
| 1 | One-sentence reminder plus where the concept appears this time |
| 2 | A new angle: how it connects to a related concept |
| 3 | The check question (answer revealed on request) |
| 4 | Marked learned ✓ (Stage 1). From Stage 2, learned also needs one correct quiz answer |

Spacing: a concept moves forward at most once per day, so the repeats are spread out.

If `progress.json` can't be parsed, the panel treats it as empty, shows a warning, and never overwrites it.

### 5. Rules for Claude (added to `AGENTS.md`)

A short "Architecture companion" section:

- When you make an architectural choice (new table, new route, new service, changed security rule, new dependency with a structural role), add a decision record. If it replaces an older one, mark the old one `replaced-by`.
- When your work touches a concept, follow the repetition cycle and update `progress.json`.
- Explain in plain words with no jargon unless it's the concept being taught.

## Stages

**Stage 1 (this spec's first plan)**
- Panel with Map (database only), Decisions and Learn tabs
- File formats above, plus the 8 initial decision records and the 8 starting concept cards
- Rules in `AGENTS.md`

**Stage 2**
- Quiz button in Learn: 3–5 questions from concepts seen at least twice, stored in the card files (written by Claude, so no AI calls during the quiz). Results update `quizRight` and `quizWrong`.
- "Explain" button on any table, decision or card, which sends a question into the chat
- Links in both directions between decisions and map items
- A hook that refreshes the panel and reminds Claude to record a decision after it edits migrations, routes or security rules

**Stage 3**
- API routes, the queue and storage on the Map
- A "follow one request" view, e.g. "Save CV": browser → API → database → back

## Testing

- Migration reader: tested against Resumora's real migrations. Expect 4 tables (`base_cvs`, `base_cv_versions`, `ai_calls`, `cv_imports`), all with RLS on, each linked to `auth.users`, with the policy names from the files, and storage policies on `cv-imports`.
- Decision and concept file readers: a valid file, a file with missing fields (shown with a warning, not dropped), and an empty folder.
- Manual check: open the panel on Resumora and click through each tab.

## Not included

- No AI calls from the panel
- Nothing read from the Supabase or Cloudflare dashboards
- No editing from the panel (it's read-only in Stage 1; Stage 2's quiz only writes `progress.json`)
