# CV tailoring

**Date:** 2026-11-08 · **Status:** draft for owner review
**Builds on:** `2026-11-04-rebuild-design.md` (planned `tailored_cvs`), `2026-11-05-base-cv-enrichment-design.md`,
`2026-11-05-focus-mode-design.md` (notes, role facts, focus mode), `2026-11-05-job-capture-design.md` (jobs).
**Made from:** a section-by-section Q&A with the owner (about 110 questions).

## Why
Tailoring is the final part of Resumora: turn the enriched Base CV into a CV and cover letter for one job,
show how much better the fit got, and export it, without inventing anything about the person.

## 1. Terms

| Term | Meaning |
|---|---|
| **Base CV** | The one CV per user (`base_cvs`). Enrichment edits it in place, so the Base CV *is* the enriched CV. It holds role notes and role facts. |
| **Enrichment** | Improving the Base CV with no job in mind: scores, focus-mode questions, notes, rewrites. A soft prerequisite for tailoring. |
| **Tailoring** | Building a Tailored CV for one job: reorder, reword, condense, add keywords and inferred items, section by section, with job-specific questions. Never changes the Base CV's text. |
| **Tailored CV** | A separate, independent document for one job and one language, always made from the **current** Base CV (never from History). Frozen: later Base CV edits never reach it. Edited with the same editor as the Base CV. |
| **Translation** | An independent copy of a Tailored CV in another language (RO, EN, FR, DE, ES, IT). Editing one never changes the other. |
| **Cover letter** | A letter belonging to one Tailored CV (one per language copy). Not versioned. |
| **Job** | A saved job ad (`jobs`), structured by extraction (`JobExtractionSchema`). |
| **Requirement** | One `must` or `nice` item from the extracted job, with a category (skill, experience, education, language, certification…). |
| **Gap** | A requirement the CV gives no evidence for (`missing`), or only partly (`partial`). |
| **Keyword** | A key term from the job's requirements and responsibilities (the ATS view). Used as the ad's exact phrase. |
| **Role notes** | Raw answers stored on a role. Two kinds: enrichment notes and **job notes** (answers given during tailoring, tagged with the job id). |
| **Role facts** | The condensed hidden summary of a role's notes (max 8 items), rebuilt from notes. |
| **Inferred item** | A skill or wording the person never wrote, but which is closely implied by their roles, answers and the job. Always tagged `inferred` until the person keeps or removes it. |
| **Score 1** | Base CV vs the job. Computed once when the job becomes `ready`, then fixed. The starting point. |
| **Score 2** | Tailored CV vs the job. Starts at Score 1 and is recomputed after every accepted section. |

## 2. User journey
1. The user adds a job (link or extension). When extraction is `ready`, **Score 1** is computed with the cheap model and stored.
2. **Job detail page** (variant A): the score card (number, band, "How is this scored?"), the requirement breakdown,
   the application status, an optional "Your thoughts on this role" field (typed or **voice**), and **Tailor my CV**.
   The button works only on `ready` jobs; otherwise it shows the reason.
3. **Soft gate**: if the Base CV looks weak, a warning offers "Enrich first" or "Tailor anyway".
   Weak means: the average role score is below 60, **or** the most recent role has no role facts. (Both numbers are tunable constants.)
4. **Full-screen focus mode** opens on the **steering** screen: tone (Formal / Neutral / Confident, default Neutral)
   and an optional short instruction (typed or voice). The CV is written in the ad's language.
5. **For each section, in order:** Experience → Skills → Summary → Achievements → Languages, then section order and the headline:
   1. its job-specific **question cards** (at most 8 across the whole run, ordered by how much they can raise the score, each skippable, plus "Skip all");
   2. the AI pass for that section;
   3. any **check flags** as question cards ("30% isn't in your CV or answers. Is it correct?");
   4. **review**: per item keep/revert, inferred items Keep/Remove, then **Accept section**. Score 2 updates.
6. The tailored CV opens in the **editor** (variant A): changes highlighted, "Use original wording" per item, inferred tags.
7. From there: **Re-tailor…** (the user picks sections), **↻** per section, **Translate** (makes an independent copy), **Template** dropdown,
   **Export** (PDF, DOCX), and the **Cover letter** tab.
8. When tailoring finishes, the job's status moves from `saved` to `tailored`. The user sets the rest (applied, interview, offer, rejected).
9. **Job edited later:** a notice "The job changed. Re-tailor?" opens Re-tailor with the section picker. Questions already answered for this job are never asked again. Score 1 stays fixed.
10. **Job deleted:** a warning says the tailored CVs, translations and cover letters are deleted too.
11. **Leaving mid-run:** coming back resumes at the next unaccepted section. Accepted sections are kept.

## 3. Sources (what the AI may read)
- **Base CV:** every section **except the contact header** (name, email, phone, address, links). The app strips it before the call and adds it back. The headline is sent.
- **Role notes** (enrichment and job notes from *any* job) and **role facts**.
- **Job:** the structured extraction only (not the raw ad text), plus the user's thoughts on the role.
- **This run:** steering tone and instruction, answers to the job questions, confirmed flags.
- **Not read:** other Tailored CVs, the raw ad text, the original imported file, the web.
- **Model knowledge** is allowed for inferring keywords, skills and wording in role descriptions, including inferences from the job answers.

**Hard rules (checked in code, after every pass, for CV and cover letter):**
1. No new numbers. The enrichment numbers check is reused: every number must appear in the person's text, notes or answers.
2. No new employers, job titles or dates. These stay exactly as in the Base CV. The headline may move closer to the job title, but only with terms supported by the CV.
3. No new tools or technologies unless tagged `inferred`.
4. No new achievements: an outcome may be reworded, never invented.

A broken rule becomes a **flag card**. If the user confirms it, the item is kept and the fact is saved as a job note (so it isn't flagged again). If the user rejects it, the item is reverted to the Base CV wording. The model gets one retry with the error before a flag is shown.

## 4. Database

**Base CV History stays as it is** (decision 0005): it remains the Base CV's own undo for bad imports and AI changes.
Tailoring has nothing to do with it:
- **Tailoring always reads the current Base CV** (`base_cvs`) and never reads `base_cv_versions`. Tailored CVs never link to, show or restore an older Base CV version.
- **Restore keeps newer notes:** restoring an older Base CV brings back its text but keeps every note added since (merged by note id), so job answers from tailoring aren't lost and their questions aren't asked again.
  The same per-kind caps apply in that merge.

**New tables** (RLS "own rows only" for select/insert/update/delete, like `jobs`; the API acts as the signed-in user):

```
tailored_cvs (
  id uuid pk, user_id uuid, job_id uuid → jobs on delete cascade,
  language text check in ('ro','en','fr','de','es','it'),
  translated_from uuid null → tailored_cvs on delete set null,
  content jsonb            -- same CvContent schema as base_cvs
  base_snapshot jsonb,     -- Base CV content when tailoring started (for change highlights)
  base_snapshot_at timestamptz,
  template text default 'classic' check in ('classic','modern','compact'),
  tone text, instruction text,
  review jsonb,            -- per-item state: inferred keep/remove, flags, original wording refs
  score jsonb,             -- latest Score 2 result (labels + computed parts)
  cover_letter jsonb null, -- { body, hiringManager, whyCompany, generatedAt } (not versioned)
  version int default 1, created_at, updated_at,
  unique (job_id, language)
)

tailor_runs (
  id uuid pk, user_id uuid, job_id uuid → jobs on delete cascade,
  tailored_cv_id uuid null → tailored_cvs on delete cascade,
  kind text check in ('tailor','retailor','section','translate','cover_letter'),
  sections text[],          -- the sections this run covers
  status text check in ('running','waiting_user','done','failed'),
  current_section text, questions jsonb, answers jsonb, proposals jsonb,
  error_code text, created_at, updated_at
)

match_scores (
  id uuid pk, user_id uuid, job_id uuid → jobs on delete cascade,
  target text check in ('base','tailored'), tailored_cv_id uuid null,
  policy text,              -- 'match/1'
  labels jsonb,             -- per requirement/keyword: met | partial | missing + evidence
  parts jsonb,              -- per component points
  total int, band text, created_at
)
```

**Changed:**
- `jobs`: add `user_thoughts text` (max 2000 chars) and `application_status text default 'saved'`
  `check in ('saved','tailored','applied','interview','offer','rejected')`.
- CV shared schema (`packages/shared/src/cv.ts`):
  - `NoteSchema` gains `jobId?: uuid`. Job notes have their own cap, `MAX_JOB_NOTES = 25` per role. When they're over the cap, they are compacted into role facts first, then the oldest job note drops.
  - The separate caps must hold everywhere notes are merged, not only on new writes. Re-import's `carryNotes`/`merge`
    (`packages/shared/src/notes.ts:20`, used by `apps/api/src/imports/routes.ts:71`) applies one `MAX_NOTES` to all
    notes today, so job notes and enrichment notes could push each other out. It must cap each kind on its own.
  - The header gains an optional `photo` (storage path plus crop: x, y, zoom). It's stored in a private Supabase Storage bucket (`cv-photos`, path `<user_id>/…`).
- **CV language:** the shared `locale` (`packages/shared/src/cv.ts:138`, today `en | ro`) is widened to `ro | en | fr | de | es | it`, so translated copies pass the same schema that autosave validates (`apps/web/src/cv/useAutosave.ts:158`). The section headings get default titles in the 4 new languages. The app's own UI language stays EN/RO.
- **Notes-only write:** a new API path that adds job notes to the Base CV, bumps `base_cvs.version`, and never touches CV text.
  An open My CV tab does **not** reload by itself (the CV query never goes stale, `apps/web/src/cv/CvPage.tsx:15`), and its next save would hit a version conflict (`useAutosave.ts:81`).
  So when a conflict's only server-side difference is notes, the editor merges silently: it keeps its own text, takes the server's notes, and saves again. No conflict banner.
- **Role facts carry compacted notes forward:** the role-facts prompt gets the **previous facts plus the current notes** (today only the notes, `apps/api/src/enrich/focus-prompts.ts:94`), so what was compacted from dropped notes isn't lost when the facts are rebuilt.

**Limits:** none for now. `tailor_runs` records every run so per-plan limits can be added before going public (constants, then a plan column with Stripe).
Failed runs are marked `failed` and will not count once limits exist.

## 5. The tailoring process
**Models:** a new per-task model setting for `callModel`. **Cheap** model: Score 1/2 labelling, gap and question finding, checks retries. **Strong** model: section rewrites, translation, cover letter.
Budget: **under $0.05** per full tailoring without the cover letter. Every call is logged in `ai_calls` with new task names (`tailor_score`, `tailor_questions`, `tailor_section`, `tailor_translate`, `tailor_letter`).

**Per section pass:**
- Input: that section of the Base CV, the job, the notes and facts for the roles involved, the steering, and answers so far. Output: JSON proposals per item, keyed by the existing stable item ids.
- **Experience:** reorder bullets (most relevant first), reword them with the ad's exact keywords inside natural sentences, condense old or less relevant roles to 1–2 short bullets so the export lands at **1–2 A4 pages**. Never hide or remove a role, section or bullet's facts.
- **Skills:** reorder by relevance, add job-relevant inferred skills (tagged).
- **Summary:** rewritten for this job, after Experience and Skills, so it describes the final content.
- **Achievements, Languages:** reorder and reword only.
- **Final step:** section order, and the headline adapted toward the job title.

**Questions:**
- Generated per section from the gaps. Answer by picking options, typing, voice (counts toward the existing voice limit), or confirming an inferred item ("We think you know gRPC because of X. Correct?").
- At most 8 per run. Any already answered for this job (found in job notes or in earlier runs' answers) are skipped.

**Review:**
- Per item: keep, or revert to the Base CV wording. Inferred items: Keep/Remove.
- "Accept section" saves the section into `tailored_cvs.content` and triggers Score 2.
- Unreviewed inferred items at export: a warning listing them, export still allowed. Tags are never printed.

**After tailoring:**
- **Re-tailor:** the user picks sections, and only those re-run. Hand edits in the other sections stay.
- **Translate:** makes or refreshes the copy for that language from the original (`translated_from`). Checks run again, and the cover letter is translated too if one exists.
- **Failures:** an AI step that fails shows "Couldn't tailor <section>. Try again". Progress is kept.

## 6. Screens (wireframes agreed in chat)
- **Job detail (A):** header line (title · company · location · mode, status dropdown); score card (ring, band, "2 must-haves missing") next to the requirement list (✓ met, ~ partial, ✗ missing with honest next step); thoughts field with mic; **Tailor my CV**. "How is this scored?" opens the component points. Phone: stacked, score first, sticky Tailor button.
- **Steering:** title, Score 1, CV language, tone pills, instruction box with mic, "Start · 5 sections".
- **Section flow (2A, one column):** step bar (sections plus "Score 62→71"), question card on top, section review card below (changes highlighted green, inferred amber, Keep/Remove, Revert all, Accept section). Flags appear as question cards.
- **Tailored CV (A):** tabs CV | Cover letter. Toolbar: Score 1 → 2 and band, Template ▾ (live switch), Language ▾ Translate, Re-tailor…, Export ▾. Below it, the A4 page (`CvDocument`) with highlights and a ↻ per section; the side panel shows "Was: …", "Use original wording" and the edit fields.
- **Editor reuse limit:** the page, side panel fields and autosave are reused, pointed at `tailored_cvs`. The **enrichment tools in the side panel** (summary rewrite, skill suggestions, focus mode) are **hidden** in the Tailored CV. They call Base CV routes (e.g. `/v1/enrich/rewrite-summary` reads the Base CV, `apps/web/src/cv/enrich/SummaryTools.tsx:28`) and would apply a Base CV-based result onto the tailored copy. AI help in the Tailored CV comes only from ↻ per section and Re-tailor.
- **Cover letter tab:** the letter as a page on the left. On the right: optional "Why <company>?" (mic), hiring manager name, "Uses your thoughts on the role ✓", Write letter, Regenerate (warns that it replaces edits), Export.
- **Desktop first, usable on phone:** everything stacks, and the focus flow is one column already.

## 7. Match score
- **Method:** the model labels each requirement and keyword `met` / `partial` / `missing`, with evidence quoted from the CV. **Code computes the number.**
- **Modular:** each component is a pure function `(labels, job, cv) → points` with its own weight, all under a versioned policy (`match/1`). Changing weights or adding a component means bumping the policy.

| Component | Weight | Rule |
|---|---|---|
| Requirements coverage | 50 | `must` counts 2× `nice`; met = 1, partial = 0.5, missing = 0 |
| Keyword coverage | 30 | share of keywords found (exact or close form) |
| Seniority fit | 10 | the CV's level vs the job's `seniority` |
| Language + education | 10 | required languages and degrees present |

- **Nothing to measure:** a component with no input is left out, and its weight is shared among the remaining components in proportion to their weights. Examples: no requirements, `seniority: unknown`, or no language or degree asked for. If every component is left out, there's no score, only "This ad doesn't list enough to score".
- **Inferred items** count as `partial` until the user keeps them.
- **Must cap:** any missing `must` caps the total at **69**. The breakdown says exactly what's missing and gives an honest next step ("If you have it, answer the question; if not, mention related experience or treat it as a gap"). It never says "add it".
- **Bands:** Excellent 85+ · Strong 70–84 · Fair 50–69 · Low under 50.
- **Where it shows:** the job detail page only (Score 1), and the tailoring flow and Tailored CV (Score 2).
- **Stability:** the same CV and job scored 3 times must land within ±3.

## 8. Cover letter
- **Shape:** 3–4 paragraphs, about 250–350 words: a hook, 2 proof points from the Tailored CV, why this company, and a close.
- **Inputs:** the Tailored CV, the job, the user's thoughts, optional "Why <company>?", and an optional hiring manager name ("Dear <name>" or "Dear Hiring Team").
- **Added by the app, not the AI:** name and contact from the Base CV header, the date in the letter's language, "Re: <role>, <company>", and the signature.
- **Rules:** the same hard rules and flag cards as the CV.
- **Regenerate:** warns, then replaces. Stored unversioned on `tailored_cvs.cover_letter`, one per language copy.

## 9. Export and templates
- **Formats:** PDF and DOCX, for **Tailored CVs and cover letters only** (no Base CV export).
- **Templates:** Classic, Modern and Compact to start, all single-column and ATS-safe. A template is a variant of `CvDocument` registered in one list, so adding one is one file plus one entry (8–15 planned). Picked from the toolbar dropdown, with a live switch.
- **PDF:** a one-click download made in the browser with a client PDF library, with selectable text, at A4.
- **DOCX:** the `docx` npm library (approved), built in the browser from the same content.
- **Photo:** an optional photo in the Base CV header, with upload, position and zoom. Each template can show it or not.
- **File name:** `Name_Company_Role.pdf` / `.docx` (ASCII, underscores).

## 10. Errors, limits, quality
- **AI failure:** a retry button per step, progress kept.
- **Limits:** unlimited for now. Runs are recorded so limits can be added before going public.
- **Quality gate before shipping:**
  1. A **live eval set** like enrichment: fictional CVs plus jobs, with invented facts **= 0**, keyword coverage, the lift from Score 1 to Score 2, and cost per run.
  2. The score stability test (±3).
  3. A **manual pass** in your signed-in Chrome.
- **Rollout:** stacked PRs by area, in this order:
  1. DB and shared schemas (including the notes caps and "restore keeps newer notes")
  2. Score 1 and the job page
  3. The tailoring flow
  4. Editor, re-tailor and translate
  5. Cover letter
  6. Export, templates and photo

## Out of scope (follow-ups)
- Copy a tailored bullet back to the Base CV.
- Plans, paid tiers and real limits (with Stripe).
- Tailoring from the jobs list, the Base CV page or the extension.
- Score in the jobs list or the extension.
- Company research from the web.
- Two-column templates.
- An Undo shortcut in the editor.

## Open items for review
- **Weak CV thresholds** (average role score 60, latest role without facts) and the **8-question cap** are first guesses, tuned with the eval.
- **Score 1 stays fixed** even when the job's requirements are edited. Score 2 always uses the current job. So after a job edit, the two compare against different requirement lists. Confirm that's what you want.
