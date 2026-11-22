# Skills from roles, after Enrich: implementation plan

> Built with `claude-build` (owner's rule): test-first in a worktree, a fresh review agent per task, Claude commits.

**Goal:** at the end of each Enrich round, offer the technical and professional skills the roles show (deduced ones too, each backed by exact lines), and add them to the CV with one tap.

**Architecture:** the existing `/v1/enrich/skills` route gets the new prompt, new checks and a new answer shape. The Skills panel button and the end screen both use it. The end screen gets a `SkillsFound` block (owner's pick C). Confirmed tools from the Tools step are read from the saved role notes by the code, not by the AI.

**Tech stack:** Hono Worker (`apps/api`), React (`apps/web`), zod schemas in `packages/shared`, vitest.

**Spec:** workspace `skills-from-roles-design-2026-11-22.md` (approved 22 Nov 2026). Picks: screen C; deduction ① from several lines together; naming ② "the shortest most recognizable, most ATS friendly version"; ③ confirmed tools in the list, marked "you picked"; ④ at most 15.

## Global constraints

- Every suggestion rests on exact quotes from the person's own text. A skill with any quote not found in one title, description, bullet or note answer is dropped. Case and spacing are ignored when comparing (today's `norm`).
- The AI never gives a role id. The code finds each quote's role.
- At most 15 AI suggestions (`MAX_SUGGESTIONS = 15`, as today). Confirmed tools don't count toward the 15.
- A skill already in any of the three lists is never suggested (same normalised name).
- Nothing is added to the CV until the person presses Add.
- A failed request shows no block and no error on the end screen. The panel keeps its own error and Try again.
- No new limits, retries or safeguards beyond the ones named here.
- Copy in en and ro. Real-AI checks use made-up CVs only.

## Review focus

1. A round's answer arrives after the person started another round ("more questions"): it must not show on the next end screen. Test in Task 3.
2. The person adds one of the suggested skills by hand before pressing Add all: it disappears from the block and the counts drop. Test in Task 3.
3. A Tools answer of "None of these": no tool skills come from it. Test in Task 1.
4. A role with two Tools notes (a later round changed the ticks): only the latest note counts. Test in Task 1.
5. A quote that appears in two roles, or with different case or spacing: it is accepted, and the line gets the first role that contains it. Test in Task 1.

---

## Task 1: Deduced skills with checked lines, and confirmed tools (API)

**Goal:** `suggestSkills` returns skills deduced from what the roles say, each with the lines it rests on and their roles, plus the confirmed tools, marked as picked.

**Files:**
- Create: `packages/shared/src/tools-note.ts` (export from `packages/shared/src/index.ts`).
- Modify: `apps/api/src/enrich/skills-prompts.ts`, `apps/api/src/enrich/skills.ts`, `apps/api/src/enrich/skills.test.ts`.

**Interfaces (produced):**
```ts
// packages/shared/src/tools-note.ts: the Tools step's note, as the web saves it (en-basecv / ro-basecv use these).
export const TOOLS_NOTE = {
  en: { question: "Which tools did you use?", none: "None of these" },
  ro: { question: "Ce instrumente ai folosit?", none: "Niciunul dintre acestea" },
} as const;

// apps/api/src/enrich/skills.ts
export type SkillLine = { roleId: string; text: string };
export type SkillSuggestion = { name: string; group: "technicalSkills" | "professionalSkills"; lines: SkillLine[]; picked: boolean };
export type SkillsResult = { suggestions: SkillSuggestion[]; sort: { skillId: string; group: "technicalSkills" | "professionalSkills" }[] };
```
The model's own schema becomes `suggestions: { name, group, evidence: string[] }[]` (evidence at least one item), and `sort` is unchanged. Raise `maxOutputTokens` from 1500 to 2500, since quotes are now lists.

**Prompt** (`skillsSystemPrompt`'s BODY). Replace the TASK part 1 with the rules below. Keep the SKILL GROUPS heading, part 2 (sort), the empty-list line and the untrusted-data sentence.
- technicalSkills: "named software, apps, platforms, systems, programming languages, equipment and technologies."
- professionalSkills adds: `An activity, method or practice is professional ("recruitment", "onboarding", "KPI reviews"), never technical.`
- `Deduce a skill from what the lines say the person did, not only from words they name. A skill may rest on one line or on several lines together.`
- `Only what the person did themselves: never from a goal, a team's or the company's work, and never a level ("advanced", "expert") or a number of years.`
- `"name": the shortest, most recognisable name for the skill, the one CVs, job ads and ATS filters use, in the CV's language. Not a sentence, not the line reworded.`
- `"evidence": a list of short exact quotes (copy each character for character), one from each line the skill rests on: a role's title, description, bullet or note answer.`
- `One entry per skill. Do not suggest a skill already in any list, also under another name ("Recruiting" is "Recruitment"), or one under "Confirmed tools".`
- `Suggest at most 15, the clearest first.`

`skillsUserMessage` adds one line after the listed skills: `Confirmed tools (already offered to the person): ["Gem","Pin"]` (a JSON list of the confirmed tool names).

**Checks** (`suggestSkills`):
- Fields are one entry per title, description, bullet and note answer of each experience role, each with its role id, normalised.
- For an AI suggestion, each quote must sit inside one field. Its line is `{ roleId: <first field's role>, text: quote.trim() }`. Drop the whole suggestion if any quote fails or the list is empty. The name no longer has to appear in a quote. Drop duplicate lines (same role and normalised text).
- Confirmed tools: for each experience role, take its latest note (by `askedAt`) whose question is one of `TOOLS_NOTE.*.question` and whose `via` includes `"pick"`. Skip it when the answer is one of `TOOLS_NOTE.*.none`. Split the answer on `","`, trim, and drop empties. Each tool not already listed becomes `{ name, group: "technicalSkills", lines: [{ roleId, text: answer }], picked: true }`. The same tool on another role adds a line, not a second entry.
- Order: confirmed tools first, then the AI's suggestions. Names taken by confirmed tools or existing lists drop the AI's duplicates. The 15 cap counts only the AI's suggestions.
- With no text in any role, still return empty lists with no model call (as today).

**Acceptance tests** (`skills.test.ts`; update the existing ones to the new shape):
- "keeps a deduced skill whose name is not in its line": `sug("Team leadership", ["trained 3 new colleagues"], "professionalSkills")` is kept, with `lines: [{ roleId: role.id, text: "trained 3 new colleagues" }]` and `picked: false`. This replaces "drops a suggestion whose name is not in the experience text".
- "drops a skill when any of its quotes is not in the text": `["Ran payroll in SAP", "led a team of 9"]` is dropped.
- "a skill may rest on lines of two roles": two roles, one quote from each, give two lines with the two role ids.
- "matches quotes ignoring case and spacing, and takes the first role that contains it" (review focus 5): the quote `"excel MACROS daily"` matches the note `"I used Excel   macros daily"`. With the same quote in two roles, roleId is the first role's.
- "adds confirmed tools from the latest Tools note, marked picked": a role with note `{question: TOOLS_NOTE.en.question, answer: "Gem, Pin", via: ["pick"]}` gives `Gem` and `Pin` first, technical, `picked: true`, with the line text `"Gem, Pin"`.
- "only the latest Tools note of a role counts" (review focus 4): notes `"Gem, Pin"` (older) and `"Gem"` (newer) give only `Gem`.
- "a None of these answer gives no tools" (review focus 3), in en and ro.
- "a Tools note typed rather than picked is not a confirmed tool": `via: ["type"]` gives nothing from it.
- "confirmed tools don't count toward the 15, and drop the AI's duplicates": 2 tools plus 16 AI suggestions, one of them "gem", give 2 + 15 with no second Gem.
- "a confirmed tool already in a list is left out": `technicalSkills: [skill("gem")]`.
- "the user message lists the confirmed tools": it contains `Confirmed tools (already offered to the person): ["Gem","Pin"]`.
- "the prompt deduces, names the short ATS way and never adds a level": the system prompt contains the deduce, "Only what the person did themselves" and "name" rules verbatim, and no longer contains `"name" is the skill as written in the experience text`.
- Keep: the 503/502 error mapping, the sort checks, the note period labels, already-listed and duplicate-name drops.

```scope
files: packages/shared/src/index.ts, apps/api/src/enrich/skills-prompts.ts, apps/api/src/enrich/skills.ts, apps/api/src/enrich/skills.test.ts
new_files: packages/shared/src/tools-note.ts
deps: none
size: ~260 lines
```

## Task 2: The panel and the web client read the new answer

**Goal:** the web parses the new answer shape. "Suggest skills from my experience" shows each suggestion's lines, and the Tools step saves its note with the shared strings.

**Files:** `apps/web/src/cv/enrich/enrich-api.ts`, `apps/web/src/cv/enrich/SkillsTools.tsx`, `apps/web/src/cv/enrich/summary-skills.test.tsx`, `apps/web/src/i18n/en-basecv.ts`, `apps/web/src/i18n/ro-basecv.ts`.

**Interfaces:**
- Consumes: the Task 1 answer shape and `TOOLS_NOTE`.
- Produces, in `enrich-api.ts`: `export type SkillSuggestion = SkillsAnswer["suggestions"][number]`. The schema is `suggestions: z.array(z.object({ name, group, lines: z.array(z.object({ roleId: z.string(), text: z.string() })), picked: z.boolean() }))`.

**Steps:**
- `"enrich.path.tools.note"` and `"enrich.path.tools.none"` take their values from `TOOLS_NOTE.en` / `TOOLS_NOTE.ro`, so the two can't drift apart.
- The panel's evidence line shows every line's text, each in quotes, joined with " · ".

**Acceptance tests:**
- Update "shows each suggestion with its evidence line…": a suggestion with two lines shows both quotes. Add still puts it in its group and then reads Added.
- New: "the Tools step note uses the shared strings": `basecvEn["enrich.path.tools.note"] === TOOLS_NOTE.en.question` (and the same for ro and for none).

```scope
files: apps/web/src/cv/enrich/enrich-api.ts, apps/web/src/cv/enrich/SkillsTools.tsx, apps/web/src/cv/enrich/summary-skills.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts
new_files: none
deps: none
size: ~50 lines
```

## Task 3: "Your roles show N skills" on the end screen

**Goal:** after each round, the end screen shows the block from option C: tags, Add all, and Look through with removal and each skill's lines.

**Files:**
- Create: `apps/web/src/cv/enrich/SkillsFound.tsx`, `apps/web/src/cv/enrich/skills-found.test.tsx`.
- Modify: `apps/web/src/cv/enrich/EndStep.tsx`, `apps/web/src/cv/enrich/EnrichPath.tsx`, `apps/web/src/cv/enrich/end-step.test.tsx`, `apps/web/src/cv/enrich/enrich-path.test.tsx`, `apps/web/src/styles/focus.css`, and the en/ro basecv i18n files.

**Interfaces:**
- Consumes: `getSkillSuggestions()` and `SkillSuggestion` (Task 2); the reducer's existing `addSkills` action.
- Produces:
  ```ts
  export function SkillsFound(props: { cv: CvContent; suggestions: readonly SkillSuggestion[]; onAdd(skills: { name: string; group: "technicalSkills" | "professionalSkills" }[]): void }): JSX.Element | null
  ```
  `EndStep` gets optional props `skills?: readonly SkillSuggestion[] | null` and `onAddSkills?(skills)`. It renders `<SkillsFound>` after the held lines, before the actions, when both are set.

**Behaviour:**
- **Shown suggestions:** the ones whose name isn't in any CV list yet (case-insensitive, trimmed), so a skill added meanwhile drops out. None, and not yet added: render nothing.
- **Closed:**
  - an h3 with `title` / `titleOne`;
  - a `counts` line;
  - the first 9 tags, technical (`sf-tag is-tech`) then professional (`is-pro`), then `more` when there are more;
  - **Add all** (`addAll`, or `addOne` when there is one), which calls `onAdd` with all of them;
  - **Look through** (`look`).
- **Open:**
  - the `lookNote` line;
  - the technical and the professional group, each under its heading (`enrich.skills.technical` / `professional`; skip an empty group);
  - each tag is a toggle button (`aria-expanded`) with the name, plus `picked` when `picked`;
  - next to each tag, a remove button labelled `remove` with `{name}`;
  - an expanded tag shows its lines under its group: each quote in quotes, then the role's title · company;
  - **Add {n}** (`add`) for the ones not removed, disabled at 0;
  - **Back** (`back`) closes the list and restores removed ones.
- **After either Add:** the block is one line, `added` / `addedOne` with the number added, `role="status"`.
- **EnrichPath:**
  - `prepare` starts a new round number and clears the skills.
  - After `setStage({ kind: "end", … })`, run `waitForSave()` (errors ignored), then `getSkillSuggestions()`. Put `suggestions` in state only if the round number is unchanged. A failure leaves `null`.
  - `onAddSkills` dispatches `addSkills` with `newId()` for each.

**Copy (en / ro):**
| key | en | ro |
|---|---|---|
| `enrich.path.skills.title` | Your roles show {n} skills | Rolurile tale arată {n} competențe |
| `enrich.path.skills.titleOne` | Your roles show 1 skill | Rolurile tale arată o competență |
| `enrich.path.skills.counts` | {t} technical · {p} professional | {t} tehnice · {p} profesionale |
| `enrich.path.skills.more` | +{n} more | încă {n} |
| `enrich.path.skills.addAll` | Add all {n} | Adaugă toate {n} |
| `enrich.path.skills.addOne` | Add to my CV | Adaugă în CV |
| `enrich.path.skills.look` | Look through | Vezi lista |
| `enrich.path.skills.lookNote` | Remove any you don't want. Tap one to see the line it came from. | Scoate ce nu vrei. Atinge una ca să vezi rândul din care vine. |
| `enrich.path.skills.add` | Add {n} | Adaugă {n} |
| `enrich.path.skills.back` | Back | Înapoi |
| `enrich.path.skills.added` | {n} skills added to your CV. | Am adăugat {n} competențe în CV. |
| `enrich.path.skills.addedOne` | 1 skill added to your CV. | Am adăugat o competență în CV. |
| `enrich.path.skills.picked` | you picked | ales de tine |
| `enrich.path.skills.remove` | Remove {name} | Scoate {name} |

**Style** (`focus.css`, `.sf-*`):
- The block is a soft green panel (`--color-good-soft` border and top, paper below).
- Technical tags use `--color-coach-soft`, professional tags `--color-good-soft`.
- The lines box uses `--color-coach-soft`, as the ScoreRows/`rr-*` styles do.
- No horizontal overflow at 375px wide.

**Acceptance tests:**
- `skills-found.test.tsx`:
  - "closed: title, counts, the first 9 tags, +N more, Add all adds every one": 12 suggestions (4 technical, 8 professional) show "Your roles show 12 skills", "4 technical · 8 professional", 9 tags and "+3 more". Add all 12 calls `onAdd` with 12, then shows "12 skills added to your CV.".
  - "one suggestion reads Your roles show 1 skill and Add to my CV".
  - "Look through: remove one, see a skill's lines, Add 11": a tag's expansion shows the line `“Led a team of four”` and `Talent Acquisition Manager · Gameloft`. Remove takes one out and the button reads Add 11. Back then Look through shows all 12 again.
  - "a picked tool shows you picked".
  - "a suggestion already on the CV is left out, and with none left it renders nothing" (review focus 2).
- `end-step.test.tsx`: "shows the skills block after the held lines when skills are given, and nothing when skills is null".
- `enrich-path.test.tsx`:
  - "after a round, asks for skills once the save is done and shows them on the end screen; Add all puts them in the CV in one addSkills".
  - "a failed skills request shows the end screen without the block or an error".
  - "an answer from an earlier round is not shown after More questions starts a new one" (review focus 1).

```scope
files: apps/web/src/cv/enrich/EndStep.tsx, apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/end-step.test.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/styles/focus.css, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts
new_files: apps/web/src/cv/enrich/SkillsFound.tsx, apps/web/src/cv/enrich/skills-found.test.tsx
deps: none
size: ~380 lines
```

## Task 4: Real-AI check of the prompt (not committed)

**Goal:** before the PR leaves draft, see what the real model returns on three made-up CVs:
- an HR manager in English, with Tools notes;
- a software developer in English;
- a sales role in Romanian.

**Steps:**
- Write a temporary `apps/api/eval/skills-tmp/skills.eval.ts` in the worktree that runs `suggestSkills` against a `memoryCvRepo` with each CV. Use the real model deps, the way the other `apps/api/eval/*.eval.ts` files build them.
- Run each CV twice with `EVAL_DEV_VARS` set and `npx vitest run --config vitest.eval.config.ts eval/skills-tmp`. Write the results to `out.txt` in that folder.
- Read every suggestion and check:
  - names are 1–4 words and the common ATS form;
  - no level or years;
  - no activity in technical;
  - the Romanian CV gets Romanian names;
  - confirmed tools are present and marked picked;
  - at least one deduced skill whose name is not in its lines.
- Count how many suggestions the checks dropped.
- Put the findings in the PR description. Delete `apps/api/eval/skills-tmp` before committing anything.

```scope
files: none
new_files: apps/api/eval/skills-tmp/skills.eval.ts (temporary, deleted)
deps: none
size: ~80 lines, not committed
```
