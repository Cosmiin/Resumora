# Base CV enrichment: experience scores, questions and rewrites

Status: draft for review · 2026-11-05 · builds on `rebuild/perfect-cv` (Plans A–C)
Mockups: https://claude.ai/artifact/RjBScDyPRxNtsmYMMAYF4y (clickable; the source of truth for look and flow, using the same app frame as the Perfect CV mockups)
Starting point for scoring: the Codex handoff "Resumora experience scoring" (policy experience-score/5), simplified and extended as described below.

## Why

After import and review, most CVs are still weak in the three places recruiters and ATS filters read first: the summary, the experience bullets and the skills. Bullets say "Responsible for various tasks", skills used in the roles are missing from the skills list, and summaries are generic.

This project makes the "Improve with AI · Coming next" buttons real. Three goals:

1. **ATS-friendly:** standard wording, tool and domain names written out, skills that match the experience.
2. **Picked for review:** clear, concrete bullets with results where the person has them.
3. **Obvious to the recruiter:** each bullet says what this person did.

It does this in two ways: **rewriting** the existing text, and **asking short questions** to learn what the person really did. A visible **score per experience** invites people to look, and the tips under it say what to do next.

## Scope

**In:**
- the experience score (per role, 0–100);
- ATS tips without AI;
- the question flow, with answers saved as hidden notes on the role;
- role rewrites with per-bullet accept;
- the summary checklist and summary rewrite;
- the skills checklist and skill suggestions, including sorting "to sort" items;
- the `cv_insights` table;
- an evaluation set.

**Out (later projects):**
- AI for key achievements (stays "Coming next");
- tailoring to a job ad (notes are stored so that phase can use them);
- scores for volunteering and projects;
- an overall CV score;
- translating rewrites into another language;
- a guided step after import.

## Where it lives

Only in the editor's helper panel and on the page (editor-only marks, never in the PDF). No new screen. The score is always visible, and that is the entry point.

## The experience score

### What it measures

How clearly the wording tells a recruiter what this person did, and whether it shows a result when one exists. It does not measure competence, verify history, or compare the person against a vacancy. Technical and nontechnical jobs are judged by the same standard.

### Grades, from the model

For each bullet the model returns four independent grades, each `missing | partial | specific`:

| Grade | missing | partial | specific |
|---|---|---|---|
| **contribution** | no task or responsibility is identified (an unexplained result claim counts as missing) | an area of work is named, but the person's part is vague ("supported", "helped with") | the person's action or responsibility is clear |
| **clarity** | the meaning cannot be understood | needs guessing: ambiguous words, unclear references | the meaning is direct |
| **specificity** | only a generic responsibility or value claim | some context, but still broad | enough context to tell the work apart: the document, task, audience, workflow, deliverable, problem or purpose |
| **impact** | no result, scale, frequency or reason stated | stated vaguely ("improved efficiency") | a concrete result, scale, frequency or reason ("for 1.2M customers", "weekly", "so payroll closed on time") |

Plus `meaningful: boolean`, `issue`, `duplicateOf`, `tip` (≤ 1 sentence) and `question` (≤ 1, or null).

`issue` is one of: `example`, `duplicate`, `contribution`, `clarity`, `specificity`, `impact`, `none`.

The model never returns numbers.

### Numbers, from the app (`packages/shared/src/enrich.ts`)

```
missing = 0, partial = 0.5, specific = 1
bullet score = round(35·contribution + 25·clarity + 20·specificity + 20·impact)
role score   = round(mean of bullet scores)
round = Math.round (halves round up: 42.5 → 43)
```

- A clear, concrete bullet with no result scores **80**, which is in the top band, so routine work is not punished.
- A bullet scores **0** when it is not meaningful, is a placeholder (a deterministic check: empty, "test", "todo", "tbd", "asdf", "lorem ipsum" and RO equivalents, ignoring accents, case and punctuation), or is a duplicate. Duplicates are either flagged by the model (`duplicateOf` must point at an earlier bullet) or found as exact repeats after trimming, collapsing spaces and lowercasing.
- **Only bullets are scored.** The role's title and description are sent as context and never graded. A role with no bullets has no score; its pill says "Add bullets to get a score".
- **The issue is normalized** in this order: unusable → `example`; duplicate → `duplicate`; first grade below specific among contribution, clarity, specificity → that grade; else impact below specific → `impact`; else `none`. If the model's issue differs from this, its `tip` and `question` are dropped (the UI shows a generic tip for the issue).
- **Bands:** 0–39 "Needs work", 40–74 "A good start", 75–100 "Clear". "N of M bullets clear" counts bullets ≥ 75.
- Policy id `score/1`. Changing weights or the prompt bumps the id, and old rows become stale.

### What changes from the Codex design, and why

1. **Impact is added** as a fourth grade with a low weight. Recruiters look for results, but a missing result never drops a clear bullet below "Clear".
2. **The description is not scored.** Codex scored an intro paragraph like a bullet, which skews short roles.
3. **One call per role, always.** The schema caps a role at 20 bullets of ≤ 2000 characters, so a role always fits. This removes batching, fragment merging, partial scopes and batch limits.
4. **No coverage dimensions and no holistic observations.** They never affected the score and doubled the validation code. The role result keeps one `nextStep` (the top-priority bullet and issue) and up to 3 questions.
5. **Freshness is a fingerprint, not an operation system.** `fingerprint(role)` is a hash of the title, description and bullet texts, plus the policy id and CV locale. A matching fingerprint means a valid score. No operation ids, claims or recovery records.
6. **ATS checks run in code** and show as tips, never as points.
7. **A live evaluation exists** (see Testing). Codex's design had none.

### ATS tips (`atsChecks(role)`, no AI)

Each tip is shown only when it applies:
- a bullet longer than 220 characters ("Keep each bullet to one or two lines");
- first person ("I", "my", "me", "eu", "meu", "mea", at word boundaries);
- a missing start date, or an end date missing while "I work here now" is off;
- a missing job title;
- fewer than 2 or more than 8 bullets;
- characters ATS parsers mangle: emoji, ★, ►, ✓, and tabs inside a bullet.

### Score prompt (`apps/api/src/enrich/prompts.ts`, task `enrich_score`)

Built from the Codex assessment prompt, keeping:
- the "untrusted source material" rule;
- the rule that the role title is context only;
- the recruiter comprehension questions;
- the grade definitions above, with the impact rules added;
- the sufficiency test (a tool name, number or location alone is not enough);
- "do not reward length, prestige or keyword density";
- the six calibration lines, with impact grades added;
- the meaningfulness and repetition rules;
- the feedback rules (one-sentence tip, at most one question that assumes nothing the person did not say, no rewritten bullets).

Removed: coverage, holistic review, scope and batching text.

Questions are written in the CV's locale. Calibration lines with their impact grade (contribution / clarity / specificity / impact):

| Line | Grades | Score |
|---|---|---|
| "Responsible for various administrative tasks." | partial / specific / missing / missing | 43 |
| "Prepared employment contracts for temporary workers." | specific / specific / specific / missing | 80 |
| "Supported Romanian market-entry planning through partner outreach." | partial / specific / partial / partial | 63 |
| "Coordinated onboarding documentation between recruiters and payroll teams." | specific / specific / specific / missing | 80 |
| "Increased efficiency by 75% using advanced solutions." | missing / partial / missing / partial | 23 |
| "Investigated failed API requests using application logs." | specific / specific / specific / missing | 80 |
| "Cut onboarding time from 3 days to 20 minutes by introducing video ID checks." | specific / specific / specific / specific | 100 |

## Notes: the person's answers, stored with the CV

`ExperienceSchema` gains `notes: z.array(NoteSchema).max(10).default([])`, where `NoteSchema = { id, question: text(MAX_TEXT), answer: text(MAX_LONG_TEXT), askedAt: ISO string }`.

- No migration: `content` is jsonb. Old CVs parse with `notes: []`.
- Notes are never rendered on the page, in `CvDocument` or in the PDF.
- They autosave, appear in History, and come back on restore.
- **Re-import:** a new import keeps the notes of each old role whose company and title match a new role after trimming and lowercasing. The rest stay in the History copy made before the import.
- Later, job tailoring reads the CV with its notes as extra context. No joins.

## Data: `cv_insights` (one migration)

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid, FK to auth user | part of PK |
| `role_id` | text | part of PK; the experience item id |
| `fingerprint` | text | the fingerprint the result was made for |
| `policy` | text | e.g. `score/1` |
| `result` | jsonb | grades per bullet id, tips, `nextStep`, questions |
| `updated_at` | timestamptz | |

- RLS: the owner can select, insert, update and delete their own rows. The API acts as the signed-in user (decision 0002).
- Rows for roles that no longer exist are harmless. The score route deletes them when it sees them; there is no cleanup job.
- This is a cache: losing it costs only tokens.

## API (`apps/api/src/enrich/`)

Every route needs sign-in and reads the **saved** CV on the server, never CV text sent by the browser. Every model call goes through `callModel` (decision 0007).

| Route | Behaviour |
|---|---|
| `GET /v1/enrich/scores` | All of the user's `cv_insights` rows |
| `POST /v1/enrich/score { roleId, fingerprint }` | If the role is missing from the saved CV, or its fingerprint ≠ the one sent → 409 `not_saved`. If a cached row has that fingerprint and policy → return it. Else call `enrich_score`, validate, normalize, store, return. |
| `POST /v1/enrich/rewrite-role { roleId }` | Save a History copy with reason `ai`. Call `enrich_rewrite_role` with the role, its notes and the CV locale. Run the numbers check. Return `{ proposals: [{ replaces: bulletId \| null, text }] }`. |
| `POST /v1/enrich/rewrite-summary` | History copy `ai`. `enrich_rewrite_summary` with the summary, the roles (titles, companies, dates, bullets, notes) and the locale. Numbers check. Return `{ proposal: string \| null }`. |
| `POST /v1/enrich/skills` | `enrich_skills` with the roles and current skills. Return `{ suggestions: [{ name, group: "technicalSkills" \| "professionalSkills", evidence }], sort: [{ skillId, group }] }`. Drop suggestions whose `name` is not found in the roles' text (case-insensitive), or that are already listed. No History copy, because nothing is applied yet. |

Errors use the existing error shape. `AiUnavailableError` → 503. Validation failures after retries → 502.

### Rewrite rules (prompt, plus a code check where marked)

- Use only facts from the original text and the notes. **Code check:** every number in a proposal (digits, with `%`, `.`, `,`, `k`, `M`) must appear in the role's text or notes, after normalising separators, or the proposal is dropped.
- Write in the CV's own language.
- Start with a verb, using past tense for past roles and present tense for the current role.
- Keep each bullet to 2 lines or less (≤ 220 characters; **code check:** longer proposals are dropped).
- No first person.
- Keep tool, product and domain names exactly as written.
- One result per bullet. Do not merge unrelated bullets. A rewrite may propose a new bullet (`replaces: null`) only when it comes from a note.
- Bullets already scoring 100 are not rewritten.
- If nothing can be improved without new facts, return no proposals.

## Web (`apps/web/src/cv/enrich/`)

- **`useRoleScores`:**
  - loads `GET /scores` once;
  - computes fingerprints locally with the shared function;
  - after autosave reports "saved", waits 2 s, then requests the **first** stale or missing role, one request at a time, until none are left;
  - a 409 → wait for the next save;
  - a result whose fingerprint no longer matches the role is ignored;
  - on failure the last score stays, marked "previous", with "Try again".
- **`ScorePill`:** in each role's margin on the page (editor-only, like the missing-section boxes). Shows the number and band colour, or "…" while scoring, "previous", or "Add bullets to get a score". Click → focus the role's title, so the panel opens the role's tools.
- **`ScoreCard`** at the top of the role's tools in `SectionTools`:
  - the score, band and "N of M bullets clear";
  - up to 2 tips: the model's `nextStep` tip first, then the first ATS tip;
  - **Answer questions** (hidden when there are no questions) and **Rewrite bullets**.
  - While the card is shown, bullets below 75 get a faint marker on the page, with the bullet's tip on hover or focus.
- **`QuestionFlow`:**
  - one question at a time, with a textarea, **Skip** and **Next**;
  - each answer dispatches `setNote` right away;
  - after the last question, **Draft improved bullets** waits for the save, then calls `rewrite-role`.
- **`RewriteReview`:**
  - shows each proposal under the bullet it replaces (or as "New bullet"), with **Use this** / **Keep mine**, plus **Use all** and **Done**;
  - accepted proposals are applied with one `applyProposals` action, so one undo step;
  - "Couldn't improve this without adding facts. Try answering a question first." when there are no proposals.
- **Summary tools:** `summaryChecklist(cv)`, plus **Rewrite my summary** → one proposal with **Use this** / **Keep mine**. The checklist items:
  - 2–4 sentences;
  - no first person;
  - ≤ 600 characters;
  - mentions the latest job title or one of its words;
  - mentions years of experience or a number.
- **Skills tools:** a checklist (no items left to sort; tools named in the roles appear in Skills), plus **Suggest skills from my experience**. Each suggestion is a chip with its evidence line and **Add**. "Sort for me" proposals show as "→ Technical" / "→ Professional", pre-selected and applied with **Apply**.
- **Reducer** (`cvReducer.ts`): adds `setNote { roleId, note }` (insert or update by id) and `applyProposals { roleId, accepted: [{ replaces, text }] }`.
- All strings go in `apps/web/src/i18n/en.ts`. "Coming next" stays only on Key achievements.

## Cost and speed

All of this runs on the existing cheap models (OpenRouter `google/gemini-3.1-flash-lite`, falling back to OpenAI `gpt-5.4-mini`), at temperature 0 for scoring.

Expected:
- about $0.0005–0.001 per role score;
- about $0.001–0.002 per rewrite;
- about $0.01 for a 5-role CV scored and rewritten once.

There is only one score request in flight at a time, and only for saved, changed roles. The eval records real numbers.

## Testing

- **Shared:**
  - `scoreFromGrades`: the 80-without-impact case, the zero rules, rounding, and empty input;
  - `fingerprint`: stable, and it changes with text, policy and locale;
  - `atsChecks` and `summaryChecklist` in EN and RO;
  - the numbers check (`1.2M` vs `1,2 mil`; `%`);
  - `NoteSchema` and the upgrade of old CVs.
- **API**, using memory repos and a fake model:
  - 409 on a stale fingerprint;
  - a cache hit makes no model call;
  - an invalid model answer → 502;
  - an invented number in a proposal is dropped;
  - the rewrite makes the `ai` History copy;
  - a skill not found in the text is dropped;
  - another user's rows are never returned.
- **Web:**
  - the pill shows, and is absent from `CvDocument`;
  - a stale result is ignored;
  - a 409 waits for the next save;
  - the question flow writes notes;
  - **Use all** is one undo step;
  - "unavailable" keeps the previous score.
- **Eval (`apps/api/eval/enrich/`, run like the import eval, results in `RESULTS.md`):**
  - about 15 synthetic roles in EN and RO, including the calibration lines, with expected grades;
  - 5 rewrite cases with traps (a vague number, an answer that adds a number, a duplicate, a placeholder, a Romanian role).
  - **Pass:**
    - each grade within one step of expected on ≥ 90% of bullets;
    - 0 invented numbers in rewrites;
    - every rewrite in the CV's language;
    - cost and speed recorded.

## Decision record

`docs/decisions/NNNN-ai-enrichment-scores-and-notes.md`:
- answers are stored as notes inside the CV, as source data that travels with History and feeds tailoring;
- scores are stored in `cv_insights`, a recomputable cache that never conflicts with autosave;
- the model grades and the app computes the numbers;
- the numbers check guards against invented facts.
