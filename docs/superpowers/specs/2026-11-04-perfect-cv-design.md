# Perfect CV: fixed categories, layout-proof import, editing on the page

Status: draft for review · 2026-11-04 · builds on `rebuild/design`
Mockups: https://claude.ai/artifact/4yUZFMvXzinYKag7yk5kJn (clickable; the source of truth for look and keys)

## Why

Three problems with the app as it is:

1. **Import depends on layout.** The PDF's text layer is flattened and sent to the model. For a two- or three-column CV, or one with a coloured sidebar or tables, that flattening can mix the columns, so sections bleed into each other or go missing.
2. **There is no fixed target shape.** The CV format has 11 lists, but nothing defines what a complete CV looks like, so the app can't tell the user what is missing.
3. **Editing is slow.** Each bullet sits in its own form box in a side panel, which means a lot of scrolling and clicking for a single role.

This round gives every CV the same 15 categories, makes import read the file as it looks and not as flattened text, flags missing categories, and moves all text editing onto the page itself. The right panel turns into a helper: health flags, section order, per-section tools, and the place where AI enrichment will go in the next project.

## Scope

**In:** CV format v2 with 15 categories plus layout (order, hidden, own headings); a shared category list with EN and RO synonyms; missing-section flags; import that sends the PDF file itself; a check against invented text; a heading → category table in the import review; an evaluation set of 12 synthetic CVs; editing on the page; the helper panel; a bottom sheet on phones.

**Out (next project):** the AI enrichment itself (the buttons are shown as "Coming next"), PDF export and templates, translating the app's own labels into Romanian.

## The 15 categories

Defined once in `packages/shared/src/categories.ts`, and used by the prompt, the flags, the review and the editor.

| # | Key | Label (EN / RO) | Flag when empty | Shape |
|---|---|---|---|---|
| 1 | `header` | Header / Antet | Missing if name **or** email is empty | name, first/last, up to 2 titles, email, phone, location, LinkedIn, website |
| 2 | `summary` | Summary / Profil | Missing | text |
| 3 | `achievements` | Key achievements / Realizări principale | Missing (gentle wording) | 3–5 bullets (max 10) |
| 4 | `experience` | Experience / Experiență profesională | Missing | roles: title, company, location, start, end, current, description, bullets |
| 5 | `skills` | Skills / Competențe | Missing | technical, professional, "to sort" |
| 6 | `education` | Education / Educație | Missing | school, degree, field, start, end, notes |
| 7 | `languages` | Languages / Limbi străine | Tip | name, level |
| 8 | `certifications` | Certifications / Certificări | none | name, issuer, date |
| 9 | `projects` | Projects / Proiecte | none | name, description, url |
| 10 | `volunteering` | Volunteering / Voluntariat | none | same shape as a role |
| 11 | `awards` | Awards & honours / Premii și distincții | none | name, issuer, date, description |
| 12 | `courses` | Courses & training / Cursuri și training-uri | none | name, provider, date |
| 13 | `publications` | Publications / Publicații | none | title, publisher, date, url |
| 14 | `interests` | Interests / Interese | none | short items (chips) |
| 15 | `other` | Other / Altele | none | sections that keep their own heading: title plus details |

Each entry also carries `synonyms: { en: string[]; ro: string[] }`, for example `languages` → "Language skills", "Foreign languages", "Limbi străine", "Competențe lingvistice". The prompt receives them as examples. Mapping is still **by meaning**: a heading the list doesn't contain still lands in the right category if its content fits, and goes to Other only when nothing fits.

**Default order:** Header (always first, can't be hidden or moved), then Summary → Key achievements → Experience → Skills → Education → Languages → Certifications → Projects → Volunteering → Awards → Courses → Publications → Interests → Other.

### Flags: `missingCategories(cv)`

A pure function in shared code that returns `{ key, level: "missing" | "tip" }[]` in page order.

- A category is flagged when its level is set, it is empty, and it is **not hidden**. Hiding a section is how the user says "I don't want this", so a hidden section is never flagged.
- The header is checked field by field: name and email.
- Wording stays gentle and says why, for example "Three to five results you are proud of make a strong opening." It never says "error".

Flags appear in two places (see the mockups): as a dashed box where the section would sit on the page, and as a card with an **Add** button in the panel. Both are editor-only and never part of the exported CV.

## CV format v2 (`packages/shared/src/cv.ts`)

The changes are additive, so v1 data loses nothing.

```ts
schemaVersion: 2
// unchanged: locale, basics (summary stays in basics), experience, education,
//            technicalSkills, professionalSkills, unclearSkills,
//            languages, certifications, projects, custom (= Other)
achievements:  Bullet[]                                  // max 10
volunteering:  Experience[]                              // same shape as a role
awards:        { id, name, issuer, date, description }[]
courses:       { id, name, provider, date }[]
publications:  { id, title, publisher, date, url }[]
interests:     { id, name }[]
layout: {
  order:  SectionKey[]                          // every key except header, each once
  hidden: SectionKey[]
  titles: Partial<Record<SectionKey, string>>   // the user's own heading; "" or absent = standard label
}
```

- **Upgrading v1.** `upgradeCv(v1) → v2` adds empty lists and the default layout. The API upgrades on every read: the current CV, history versions and the import result. The API accepts and saves **only v2**. No database migration is needed, because `content` is `jsonb`. Old history rows stay v1 in the database and are upgraded whenever they are opened.
- **The web app** only ever sees v2. Autosave validates against v2.
- **Dates** stay stored as `YYYY-MM`, `YYYY` or `""`. The editor shows them as "Mar 2021" (or "mar. 2021" in Romanian) and accepts typed forms through a shared `parseTypedDate`: `Mar 2021`, `March 2021`, `03/2021`, `3.2021`, `2021`, Romanian month names, and `present`/`prezent`, which switches on "I work here now".
- **Own headings (your change after the mockups).** Click any section heading on the page and type to rename it, for example "Experience" → "Work history". This only changes the heading shown. The section still counts as Experience for flags, import and ordering. Clearing the heading brings back the standard name, and the panel offers "Use standard name". Other sections already have their own heading (`custom[].title`), so renaming one edits that title. **Add section → "Custom section"** creates a new Other entry with a heading the user types. Several custom sections can exist, each with its own name.

## Part 1: import that works for any layout

### Pipeline (`apps/api/src/imports/process.ts`)

```
upload → text layer (unpdf / mammoth, as today)
       → checks: ≤ 8 pages, file size limit as today
       → admit ("is this a CV?") on the text layer, as today
       → extract:  PDF  → the PDF file itself goes to the model (OpenRouter `file` part)
                   DOCX → mammoth text, as today (DOCX has no visual layout to lose)
       → toCvContent v2 → invention check → review
```

- **Why send the file.** Gemini models read a PDF as pages, layout included, so two columns stay two columns and a coloured sidebar stays a sidebar. Text-layer flattening is the root cause of the layout problem; better prompting can't undo it. Cost stays low: a 2-page CV adds about 500 input tokens per page, well under the $0.01 limit.
- **Scans.** Today a PDF with almost no text layer fails as "no text". When the file goes to the model, a scan becomes readable. Admit then runs on the file instead of the text, and the review shows "This file is a scan. Check every line," because the invention check (below) has no text to compare against.
- **The first task of Plan B is a quick check** that `google/gemini-3.1-flash-lite` on OpenRouter with zero-data-retention routing accepts a PDF `file` part, and the same for the `gpt-5.4-mini` fallback on OpenAI.
  - **Fallback if it doesn't (changed from what we agreed; please confirm):** we had said "page images". Workers have no canvas to draw PDF pages, so rendering images would need a paid rendering service or a heavy WASM library. The proposed fallback is the text path we have today, plus a warning in the review that the layout may be mixed. If the check passes, this never comes up.

### Prompt v3 (`apps/api/src/imports/prompts.ts`)

- Keeps all of the owner's v2 rules: word-for-word copying, diacritics, skills sorted into three groups, never inventing anything, dates normalised.
- The category part is **built from `categories.ts`**: each key with its EN and RO labels and synonyms. Adding a synonym therefore changes the prompt and the review in one edit.
- New output field `sourceHeadings: { heading: string; category: SectionKey }[]`: every heading as written in the file, with the category its content went to. This drives the review table.
- Content with no matching category goes to `custom` with its original heading. Nothing is dropped.
- `ImportDraftSchema` grows the six new categories and `sourceHeadings`. `toCvContent` produces v2, with the default layout and Other last.

### Invention check (new, `apps/api/src/imports/source-check.ts`)

The model sees the file, so it could make text up. Every copied line (summary sentences, bullets, achievements, item names, Other details) is checked against the text layer:

- Both sides are normalised: Unicode NFC, letters folded to lower case, whitespace collapsed, dashes, quotes and bullet marks unified. Diacritics are **not** folded, so a lost "ș" counts as a miss.
- A line passes if it appears as a substring of the source, or if at least 90% of its words appear in the source in the same order. This allows for line breaks and hyphenation in the text layer.
- A line that fails is **kept and highlighted** in the review ("We couldn't find these lines in your file: …"). It is not deleted, because a broken text layer (some PDFs have one) would otherwise lose real text.
- It is skipped for scans and DOCX. For DOCX the mammoth text is the source, so the check is trivial there, but it is still run for safety.

### Import review

The review screen gains the table from mockup 2: *In your file → Placed in → Items*. Rows placed in Other have a **Move to…** choice (Certifications, Courses, Awards, Interests, Languages, Projects). Moving one splits its details into one item per line. Flags for missing categories appear under the table. Apply, conflict warnings and history work as they do today.

### Evaluation: `npm run eval:import` (run manually, not in CI)

- 12 **synthetic** CVs (invented people, no real data) in `apps/api/eval/import/cases/<name>/`, each with the file and an `expected.json` answer key:
  - 2-column; 3-column; coloured sidebar; tables for layout; icons instead of headings; Romanian with diacritics; unusual headings ("What I've built", "Toolbox"); a CV with no skills section; a scan (an image-only PDF); a DOCX with tables; a long 4-page CV; a plain one-column CV as the baseline.
  - The PDFs are made from HTML with headless Chrome, the scan is rasterised, and the DOCX is made with the `docx` package. The generator script is checked in, so the cases can be rebuilt.
- The script runs the real pipeline against the configured models and prints a table per CV, plus totals.

**Pass bar (all 12):**

| Check | Target |
|---|---|
| Every section in the file found and placed in the right category | 12/12 |
| Fields correct (normalised exact match against the answer key) | ≥ 95% |
| Invented lines | 0 |
| Copy word for word, diacritics included | 100% of checked lines |
| Missing flags match the answer key | 12/12 |
| Time per import | < 30 s |
| Cost per import (from the `ai_calls` log) | < $0.01 |

## Part 2: editing on the page, and the helper panel

### Editing (mockup 1)

- **Every piece of text on the page is a field.** A `<textarea>` (or an `<input>` for one-line fields) styled exactly like the page text: no border, same font and size, and it grows with its content. Growing uses CSS `field-sizing: content` where supported, with a small script fallback for Firefox and Safari. Hovering tints the field; focus adds a thin underline. **Not `contentEditable`**: plain fields keep the CV data as the only source of truth, and keep paste, the cursor and undo predictable.
- **Keys:**

| Where | Key | Does |
|---|---|---|
| Bullet | Enter | Splits at the cursor into a new bullet below and moves there |
| Bullet | Shift+Enter | Line break inside the bullet |
| Bullet | Backspace at the start | Joins the bullet into the one above; an empty bullet just goes away |
| Any field | Tab / Shift+Tab | Next / previous field, in reading order |
| Chips (skills, interests) | Enter or `,` | Adds the chip |
| Chips | Backspace in an empty box | Pulls the last chip back into the box to edit it |
| Page | Esc | Leaves the field; the panel goes back to the overview |

- **Dates** are typed in place. A date that can't be read shows a small hint ("Try 'Mar 2021', '03/2021' or '2021'") and is **not saved**. Leaving the field puts back the last good value.
- **"+ Add bullet / role / school / item"** buttons appear only while the pointer is over the section or the cursor is inside it. They are also reachable with Tab.
- **Section headings** are fields too (renaming, as above).
- **Speed:** the CV lives in one reducer with small actions (`setField`, `splitBullet`, `joinBullet`, `addRole`, `moveSection`…). Roles, bullets and chips are `React.memo` components keyed by their `id`, so a keystroke re-renders only the field being typed in. Autosave keeps its current debounce. Ctrl+Z inside a field uses the browser's own undo. Larger mistakes are covered by History, as today.
- **Keyboard only:** every action has a key or a focusable button, every field has an accessible name ("Bullet 2 of Senior Product Manager"), and focus is always visible.

### Helper panel (right side, 330 px)

- **With nothing selected (overview):**
  - "Needs attention": the flags from `missingCategories`, each with **Add** (it creates the section and puts the cursor in it) or **Fill in** (for the name or email).
  - "Sections": the list in page order with show/hide. **Reorder by dragging** a row by its grip (⠿); there are no ↑↓ arrows. Hidden sections are struck through and labelled "Hidden".
  - "Add section": a dropdown of the categories not yet on the CV, plus "Custom section".
- **With the cursor in a section:**
  - its heading and hide
  - a note when the heading was renamed
  - section-specific tools: for a role, the "I work here now" switch and remove; for skills, sorting the "to sort" chips into a group
  - short tips
  - **"Improve with AI"** buttons marked **Coming next**, for Summary, Key achievements, Experience and Skills
- **The panel follows the cursor:** moving into another role or section switches it. Clicking empty page space or pressing Esc goes back to the overview.
- **Under 900 px** the panel becomes a bottom sheet. It is short while typing (the tools for the current role) and can be dragged up to the full overview (mockup 3).

### Reordering by dragging (changed after the mockups)

No ↑↓ arrows anywhere. Order changes by drag and drop:

- **Sections:** drag a row in the panel's section list by its grip (⠿).
- **Roles, schools and other items inside a section:** drag by a grip that appears in the left margin of the page when the pointer is over the item or the cursor is inside it, the same way the "+ Add" buttons appear. Bullets keep Enter/Backspace and are not dragged.
- **Works on touch and with the keyboard.** We use `@dnd-kit` (`core` + `sortable`), which handles mouse, touch (long-press on phones) and keyboard: Tab to the grip, Space to pick up, ↑/↓ to move, Space to drop, Esc to cancel. A screen-reader message announces the new position. The native HTML drag API is not used, because it doesn't work on touch screens and has no keyboard support.
- A drop is one reducer action (`moveSection` / `moveItem`), so it autosaves and shows up in History like any edit.

### What is removed and what stays

- **Removed:** `SidePanel.tsx`, `PanelBody.tsx`, `PanelFooter.tsx`, `AddSection.tsx`, `sections/*` and the clickable block buttons in `CvDocument.tsx`.
- **Stays:** the import review (extended), History, the conflict banner, autosave and the top bar.
- `app.css` is split per screen (`auth.css`, `editor.css`, `cv-page.css`, `panel.css`, `review.css`) while it is being changed anyway.

## Plans

Three plans. **A comes first. B and C both depend on A, but not on each other**, so after A they can run in parallel.

- **A. Format v2 and categories.** `categories.ts`, the v2 schema, `upgradeCv`, `missingCategories`, `parseTypedDate`, API read upgrade and v2-only save, and making the existing editor work on v2. Small; makes no visible change apart from the new sections rendering.
- **B. Import for any layout, and the evaluation.** The PDF-file check first, then sending the file, prompt v3, `sourceHeadings`, the invention check, the review table with Move to, the 12 cases with their generator, and `eval:import`.
- **C. Editing on the page, and the panel.** The editable fields, the reducer, bullets/chips/dates, renaming, the helper panel, the bottom sheet, removing the old panel, and splitting the CSS.

## Testing

- **Shared:** `missingCategories` (hidden, header fields, levels); `upgradeCv` (every v1 field kept); `parseTypedDate` (EN and RO months, bad input); a check that every category has labels and synonyms in both languages.
- **API:** v1 rows come back as v2; saving v1 is rejected; the invention check (passes, misses, a lost diacritic counts as a miss); `toCvContent` v2 with `sourceHeadings`; Move to splits into items.
- **Web:** the bullet keys (Enter at middle/start/end, Backspace joining, deleting an empty bullet), chips, dates (invalid not saved), renaming and resetting a heading, the panel following focus, hide/show, reordering sections and roles with the keyboard (Space, ↑/↓, Space) and by pointer, and a keyboard-only walk-through of adding a role.
- **Eval:** the pass bar above, run by hand before each merge of Plan B.

## Decisions from review (2026-11-04)

1. Approved: if PDF files are rejected, the fallback is the text path plus a warning, in place of page images.
2. Approved: Move to offers the six list-shaped categories only.
3. Added: sections can be renamed, and custom sections can be added with your own name.
4. Changed: reorder by dragging, with no arrows (see "Reordering by dragging").
5. Checked 2026-11-04: both providers accept a PDF file part with privacy routing on (OpenRouter `google/gemini-3.1-flash-lite` with zdr and no data collection, OpenAI `gpt-5.4-mini`); each returned the right email from a test PDF. No fallback needed.
