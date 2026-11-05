# Design Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the web app to the approved mockups: the CV shown as an A4 page, a side panel for editing the clicked block, a full-screen import review, history previewed on the page, and a two-column sign-in.

**Architecture:** One pure component, `CvDocument`, draws a `CvContent` as a page; it is clickable in the editor and read-only in import review and history. The existing section forms are split into per-item field components and shown in a `SidePanel` for the selected `BlockRef`. Data flow is unchanged: the panel calls `setContent` from `useAutosave`, so saving, the version check and conflicts behave exactly as today.

**Tech Stack:** React 19, Vite, TanStack Query, Vitest + Testing Library; new deps `@fontsource-variable/newsreader@5.3.0`, `@fontsource-variable/instrument-sans@5.3.0`.

**Spec:** `docs/superpowers/specs/2026-11-04-design-refresh-design.md` (mockups: https://claude.ai/artifact/G6rfmGp8UnZMLaxZu6DnDv)

## Global Constraints

- Colours come from `apps/web/src/styles/tokens.css`; add tokens, never change existing values. Focus ring stays `--focus-ring` (marigold).
- Fonts are self-hosted from the two `@fontsource-variable` packages. No `fonts.googleapis.com` / `fonts.gstatic.com` anywhere.
- Headings and the CV name use Newsreader (`--font-display`); everything else Instrument Sans (`--font-sans`).
- Not built: "Jobs" tab, "Download PDF", "Continue with Google", Technical/Professional buttons in the import review.
- Every clickable block is a real `<button>`; text contrast ≥ 4.5:1; touch targets ≥ 44 px; Escape closes the side panel.
- Below 900 px the side panel is a full-width sheet over the page; sign-in stacks to one column.
- All UI copy goes in `apps/web/src/i18n/en.ts`. Field labels, limits and validation are unchanged.
- Repo conventions (AGENTS.md): plain words, files < ~300 lines, conventional commits, `npm run lint && npm run typecheck && npm test` before each commit.

## Review Focus

1. **An empty CV (new user):** nothing would be clickable. The page must show placeholder blocks for name and summary that open the panel ("Add your name") — Task 2 and Task 4 tests.
2. **The selected item disappears** (removed, history restore, import applied): the panel must close, never show fields for a missing item — Task 4 test.
3. **A long CV** (15 roles, long bullets): every role is drawn; the page grows instead of clipping — Task 2 test.
4. **Romanian CV:** dates use the CV's locale ("mar. 2021" for `ro`), diacritics untouched — Task 2 test.
5. **A conflict while the panel is open:** the conflict banner must stay visible above the page and "Load latest" must refresh what the panel shows — Task 4 test.

---

## File structure

```
apps/web/src/
  layout/AppShell.tsx            top bar (brand, "My CV", actions slot, account + sign out)        T1
  styles/tokens.css              + font, shadow, radius, selection tokens                           T1
  styles/app.css                 rewritten per screen (shell, page, panel, review, auth)           T1–T7
  test/sample-cv.ts              sampleCv(): a full CvContent used by page/editor tests             T2
  cv/page/blocks.ts              BlockRef, SectionKey, findItem(), formatRange()                    T2
  cv/page/CvDocument.tsx         pure A4 page render                                                T2
  cv/sections/*.tsx              per-item *Fields components (lists keep working)                   T3
  cv/SidePanel.tsx               panel frame + editor for the selected ref                          T4
  cv/AddSection.tsx              "+ Add a section" menu                                              T4
  cv/Editor.tsx                  page + panel layout                                                 T4, T6
  imports/ImportScreen.tsx       full-screen review (replaces ImportDialog)                          T5
  imports/ImportSummary.tsx      counts, to-sort skills, warnings, Use this CV                       T5
  cv/HistoryPanel.tsx            history in the panel slot (replaces HistoryDrawer)                 T6
  auth/AuthLayout.tsx            two-column layout for login/sign-up/reset                           T7
```

### Task 1: Fonts, tokens and the app shell

**Files:**
- Modify: `apps/web/package.json`, `apps/web/src/main.tsx`, `apps/web/src/styles/tokens.css`, `apps/web/src/styles/app.css`, `apps/web/src/auth/RequireAuth.tsx`, `apps/web/src/cv/CvPage.tsx`, `apps/web/src/i18n/en.ts`
- Create: `apps/web/src/layout/AppShell.tsx`
- Test: `apps/web/src/auth/auth.test.tsx`

**Interfaces:**
- Produces: `AppShell(props: { actions?: ReactNode; children: ReactNode }): JSX.Element` — `<header>` with brand "Resumora", `<nav aria-label="Main">` holding a "My CV" link (`aria-current="page"` on /cv), the `actions` slot, and an account button (initial of the email, `aria-label` = "Account: <email>") that opens a small menu with the email and "Sign out" (same unsaved-changes confirm as today). `RequireAuth` becomes a guard only (`<Outlet />`); `CvPage` wraps its states in `AppShell`.
- Tokens added: `--font-display: "Newsreader Variable", Georgia, serif; --font-sans: "Instrument Sans Variable", system-ui, sans-serif; --shadow-page: 0 1px 2px rgb(15 40 38 / .06), 0 12px 40px rgb(15 40 38 / .08); --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --outline-selected: 2px solid var(--pine-600); --surface-selected-block: var(--pine-50)`.

- [ ] **Step 1:** `npm install -w @resumora/web @fontsource-variable/newsreader@5.3.0 @fontsource-variable/instrument-sans@5.3.0`; import both in `main.tsx` before `tokens.css`.
- [ ] **Step 2: Write the failing tests** in `auth.test.tsx`:
  - `"top bar shows My CV and the account menu signs out"`: signed in as `ana@example.com` → `getByRole("link", { name: "My CV" })` has `aria-current="page"`; clicking `getByRole("button", { name: "Account: ana@example.com" })` then `"Sign out"` calls `auth.signOut`.
  - Update the two existing sign-out tests to open the account menu first.
- [ ] **Step 3:** Run `npx vitest run src/auth` — Expected: FAIL (no "My CV" link / account button).
- [ ] **Step 4:** Implement `AppShell`, tokens, shell CSS (white top bar, 1px `--border-subtle` bottom, 14px/32px padding, wraps on narrow screens); `body` uses `--font-sans`, `h1,h2` use `--font-display` weight 500.
- [ ] **Step 5:** Run `npx vitest run` in `apps/web` — Expected: all pass. Run `grep -r "googleapis" apps/web` — Expected: no output.
- [ ] **Step 6:** Commit `feat(web): app shell, self-hosted fonts and design tokens`.

### Task 2: The CV page (`CvDocument`)

**Files:**
- Create: `apps/web/src/cv/page/blocks.ts`, `apps/web/src/cv/page/CvDocument.tsx`, `apps/web/src/test/sample-cv.ts`
- Test: `apps/web/src/cv/page/cv-document.test.tsx`
- Modify: `apps/web/src/styles/app.css`, `apps/web/src/i18n/en.ts`

**Interfaces:**
- Produces (blocks.ts):
  - `type SectionKey = "basics" | "summary" | "experience" | "education" | "skills" | "languages" | "certifications" | "projects" | "custom"`
  - `type BlockRef = { section: SectionKey; itemId?: string }` — `itemId` only for list sections (experience, education, languages, certifications, projects, custom).
  - `findItem(cv: CvContent, ref: BlockRef): { index: number; count: number } | null` — null when a list ref's item no longer exists; `{index:0,count:1}` for non-list sections.
  - `formatRange(start: string, end: string, current: boolean, locale: Locale): string` — `"YYYY-MM"` → `Intl.DateTimeFormat(locale, { month: "short", year: "numeric" })`, `"YYYY"` as is, current → `t("cv.page.present")` ("Present"; RO CVs show "prezent"), joined with " – ", empty parts dropped.
- Produces (CvDocument.tsx): `CvDocument(props: { content: CvContent; selected?: BlockRef | null; onSelect?(ref: BlockRef): void; showUnsorted?: boolean }): JSX.Element` — `<article aria-label="CV page">`, A4 proportions as a **minimum** height (`min-height` via `aspect-ratio`, grows with content). Order: basics (name, titles joined " · ", contact line), summary, experience, education, skills (Technical / Professional rows; "To sort" row in amber only when `showUnsorted` and non-empty), languages, certifications, projects, custom (each custom item is its own titled block). With `onSelect`, each block is a `<button type="button">` named by its content (`"Edit <title or name>"`, e.g. "Edit Senior Product Manager", "Edit your details", "Edit skills") with `aria-pressed` = selected; the selected block gets `--outline-selected` and an "Editing" tag. With `onSelect` and an empty name/summary, draws placeholder blocks "Add your name" / "Add a short summary". Without `onSelect`: no buttons, no placeholders, empty sections omitted.
- Produces (sample-cv.ts): `sampleCv(overrides?: Partial<CvContent>): CvContent` — the synthetic "Ana Maria Popescu" CV from the mockups, with every section filled and one unclear skill ("Management").

- [ ] **Step 1: Write the failing tests** (`cv-document.test.tsx`):
  - `"draws every filled section"`: `sampleCv()` → name, both titles, each role title, school, a technical and a professional skill, language, certification, project, custom title all visible.
  - `"read-only page has no buttons and hides empty sections"`: `emptyCv()` with only `fullName` → `queryAllByRole("button")` is empty and no "Experience" heading.
  - `"clicking a role selects it"`: with `onSelect` spy → click "Edit Senior Product Manager" → called with `{ section: "experience", itemId: <first role id> }`; with that ref as `selected` the button has `aria-pressed="true"`.
  - `"an empty CV offers places to start"`: `emptyCv()` + `onSelect` → buttons "Add your name" and "Add a short summary" select `basics` and `summary`.
  - `"skills to sort only show when asked"`: "Management" absent by default, present with `showUnsorted`.
  - `"a long CV draws every role"`: 15 roles → 15 role titles found.
  - `"Romanian dates and diacritics"`: `locale: "ro"`, role `startDate "2021-03"`, `current: true`, title "Inginer Software Senior – Endava, Iași" → text matches `/mar\. 2021 – prezent/` and the title is unchanged.
- [ ] **Step 2:** Run `npx vitest run src/cv/page` — Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `blocks.ts`, `sample-cv.ts`, `CvDocument.tsx` and page CSS (white page, `--shadow-page`, padding 52px 56px, max-width 680px, name 34px display font, section labels 10px uppercase pine, skill chips `--sage-100`, to-sort chips marigold with dashed outline; hover tint `--surface-selected-block`).
- [ ] **Step 4:** Run `npx vitest run src/cv/page` — Expected: 7 pass.
- [ ] **Step 5:** Commit `feat(web): CvDocument renders the CV as a page`.

### Task 3: Per-item field components

**Files:**
- Modify: `apps/web/src/cv/sections/Basics.tsx`, `Experience.tsx`, `Lists.tsx`, `Custom.tsx`
- Test: `apps/web/src/cv/editor.test.tsx` (unchanged; must stay green)

**Interfaces:**
- Produces, each `({ value, onChange }: { value: T; onChange(next: T): void }) => JSX.Element`, rendering exactly today's fields for ONE item: `BasicsFields` (names, titles, contact; T = `CvContent["basics"]`, no summary), `SummaryField` (T = `string`), `ExperienceFields` (incl. description, bullets with add/remove), `EducationFields`, `LanguageFields`, `CertificationFields`, `ProjectFields`, `CustomFields`.
- Produces: `blankItem: Record<ListSection, () => Omit<Item, "id">>` exported from `cv/sections/blank.ts`, where `ListSection = "experience" | "education" | "languages" | "certifications" | "projects" | "custom"` — the same blanks the `create` props use today.
- The existing `*Section` components keep their exports and use these via `renderItem`, so the current editor is unchanged in this task.

- [ ] **Step 1:** Run `npx vitest run src/cv` — Expected: all pass (baseline).
- [ ] **Step 2:** Extract the components and `blank.ts` without changing labels or behaviour.
- [ ] **Step 3:** Run `npx vitest run src/cv` and `npm run typecheck` — Expected: all pass, same count as Step 1.
- [ ] **Step 4:** Commit `refactor(web): per-item field components for the side panel`.

### Task 4: Editor layout — page + side panel

**Files:**
- Create: `apps/web/src/cv/SidePanel.tsx`, `apps/web/src/cv/AddSection.tsx`
- Modify: `apps/web/src/cv/Editor.tsx`, `apps/web/src/styles/app.css`, `apps/web/src/i18n/en.ts`
- Test: `apps/web/src/cv/editor.test.tsx`, `apps/web/src/cv/side-panel.test.tsx`

**Interfaces:**
- Consumes: `CvDocument`, `BlockRef`, `findItem` (T2); `*Fields`, `blankItem` (T3); `AppShell` (T1).
- Produces: `SidePanel(props: { cv: CvContent; selected: BlockRef; onChange(next: CvContent): void; onSelect(ref: BlockRef | null): void }): JSX.Element` — `<aside aria-label={panel title}>`; header = section label ("Experience · role 1 of 3") + display-font title + close button (`aria-label="Close panel"`); body = the matching Fields (skills → existing `SkillsSection`); footer for list items: "Remove", "Move up", "Move down", "Previous", "Next", "Add another" (creates `{...blankItem[section](), id: newId()}` after the current item and selects it). Removing selects the neighbouring item, or closes when none is left. Escape (keydown on the aside) closes. On open, focus moves to the first field; on close, focus returns to the block button for that ref (via `data-block` attribute lookup), else the page.
- Produces: `AddSection(props: { cv: CvContent; onAdd(ref: BlockRef): void })` — a "+ Add a section" button opening a list of the list sections that are empty plus "Skills"; choosing one inserts a blank item (or opens skills) and calls `onAdd` with its ref.
- `Editor` state: `selected: BlockRef | null`. Layout: `AppShell actions` = save status, "History", Import button; main = notices (errors, conflict banner) + hint "Click any part of your CV to edit it." + `CvDocument content selected onSelect showUnsorted` + `AddSection`; `SidePanel` when `selected && findItem(content, selected)`; otherwise `selected` is reset to null in an effect.

- [ ] **Step 1: Write the failing tests** (`side-panel.test.tsx`, render `CvPage` with `getCv` → `sampleCv()` as in `editor.test.tsx`):
  - `"clicking a role opens its fields and edits update the page"`: click "Edit Senior Product Manager" → `getByRole("complementary", { name: /experience/i })` contains `getByLabelText("Job title")` = "Senior Product Manager"; type " II" → the page button "Edit Senior Product Manager II" exists; after 3 s `saveCv` was called with that title.
  - `"Escape closes the panel and returns focus"`: open, press Escape → no complementary; the role button has focus.
  - `"Next moves to the following role"`: "Next" → "Job title" field shows the second role's title; label shows "role 2 of 3".
  - `"removing the only education closes the panel"`: open the education block, "Remove" → no complementary, school gone from the page.
  - `"panel closes when the selected role disappears"`: open role 1, then trigger a conflict and "Load latest" with a CV lacking that role → no complementary. (Review Focus 2 & 5: also assert the conflict banner was visible while the panel was open.)
  - `"an empty CV starts from Add your name"`: `getCv` → `emptyCv()`; click "Add your name", type "Ana" in "Full name" → page shows "Ana".
  - `"Add a section adds a role and opens it"`: "+ Add a section" → "Experience" → panel open with an empty "Job title".
- [ ] **Step 2:** Rewrite `editor.test.tsx` cases to the new flow (same assertions on saved content): "adds an experience and a bullet" uses "+ Add a section" → "Experience"; "edits two titles" opens "Edit your details"; "sorts an unclear skill" opens "Edit skills"; "adds a custom section" via Add a section; "stops adding at the CV limits" checks "Add another" is disabled at `MAX_ITEMS`.
- [ ] **Step 3:** Run `npx vitest run src/cv` — Expected: FAIL (new names not found).
- [ ] **Step 4:** Implement `SidePanel`, `AddSection`, the `Editor` layout and CSS (two columns: page area flex `999 1 640px`, panel flex `1 1 400px` max 460px, white, left border; under 900 px panel `position: fixed; inset: 0` with the close button acting as "Back").
- [ ] **Step 5:** Run `npx vitest run` in `apps/web` — Expected: all pass except import/history tests that query the old dialog/drawer; list them in the commit message if any.
- [ ] **Step 6:** Commit `feat(web): edit the CV from the page with a side panel`.

### Task 5: Full-screen import review

**Files:**
- Create: `apps/web/src/imports/ImportScreen.tsx`, `apps/web/src/imports/ImportSummary.tsx`
- Delete: `apps/web/src/imports/ImportDialog.tsx`, `apps/web/src/imports/ImportReview.tsx`
- Modify: `apps/web/src/cv/Editor.tsx`, `apps/web/src/i18n/en.ts`, `apps/web/src/styles/app.css`
- Test: `apps/web/src/imports/imports.test.tsx`

**Interfaces:**
- Consumes: `CvDocument` (read-only, `showUnsorted`) (T2).
- Produces: `ImportScreen` — same props and polling/apply/give-up logic as today's `ImportDialog` (`importId, canApply, currentVersion, onClose, onApplied, onConflict`; `POLL_MS`, `GIVE_UP_MS` kept and exported), rendered as `<div role="dialog" aria-modal="true" aria-label="Import review">` covering the window: its own top bar (brand, "Import review · <fileName>", "Cancel", "Use this CV"), page area, and `ImportSummary`.
- Produces: `ImportSummary(props: { result: ImportResult; canApply: boolean; applying: boolean; onApply(): void })` — "We organized your CV", counts `<dl>` (Roles, Skills = technical+professional+unclear, Sections = non-empty sections), the "N skills to sort" box listing names with the copy "You can sort these right after using the CV.", warnings as "N things to confirm", the note "Your current CV is kept in History, so you can go back.", and "Use this CV".
- Loading, failed and already-used states keep today's copy, shown centred in the page area.

- [ ] **Step 1: Write the failing tests** (update `imports.test.tsx`):
  - `"shows progress then the review"` → expects `getByRole("dialog", { name: "Import review" })`, the page with the imported name, and counts "3" under "Roles" for a 3-role result.
  - `"shows skills to sort in the review"` → "1 skill to sort", "Management", and the copy "You can sort these right after using the CV."
  - Keep `applies…`, `waits for pending saves…`, `conflict on apply…`, `keeps waiting…`, `cancel closes…`, `not-a-CV` with button names unchanged ("Use this CV", "Cancel").
- [ ] **Step 2:** Run `npx vitest run src/imports` — Expected: FAIL.
- [ ] **Step 3:** Implement; `Editor` renders `ImportScreen` instead of the dialog + backdrop.
- [ ] **Step 4:** Run `npx vitest run` — Expected: all pass except history tests.
- [ ] **Step 5:** Commit `feat(web): full-screen import review`.

### Task 6: History in the side panel, previewed on the page

**Files:**
- Create: `apps/web/src/cv/HistoryPanel.tsx`
- Delete: `apps/web/src/cv/HistoryDrawer.tsx`
- Modify: `apps/web/src/cv/Editor.tsx`, `apps/web/src/i18n/en.ts`, `apps/web/src/styles/app.css`
- Test: `apps/web/src/cv/history.test.tsx`

**Interfaces:**
- Produces: `HistoryPanel(props: { canRestore: boolean; onClose(): void; onPreview(content: CvContent | null): void; onRestore(id: string): void })` — `<aside aria-label="History">`: intro copy "We keep a copy while you edit, and always before an import or a restore. The newest 50 are kept.", items grouped by day ("Today", else `d MMMM` in the UI locale), each a button with time, first title and a reason tag ("While editing" / "Before import" / "Before restore" / "Before AI change"); the chosen item is `aria-pressed`, loads via `getHistoryItem` and calls `onPreview`; "Restore this version" (disabled unless `canRestore` and an item is chosen) with "Restoring keeps your current CV in History too."
- `Editor`: while history is open, the side panel slot shows `HistoryPanel` (selection cleared), the page shows the preview read-only (no `onSelect`) with the notice "Previewing the version from <date> — your current CV isn't changed", and the editing UI is `inert` as today.

- [ ] **Step 1: Write the failing tests** (update `history.test.tsx`): `"previews a version on the page"` → after choosing an item, the page shows that version's name and the "Previewing" notice; `"closing history shows the current CV again"`; keep `lists versions newest first`, `restore replaces…`, `restore conflict…`, `restore is disabled while there are unsaved changes`, `the editor can't be edited while history is open`, `offers Load latest…`.
- [ ] **Step 2:** Run `npx vitest run src/cv/history.test.tsx` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run` — Expected: all pass.
- [ ] **Step 5:** Commit `feat(web): history in the side panel with a page preview`.

### Task 7: Two-column sign-in

**Files:**
- Create: `apps/web/src/auth/AuthLayout.tsx`
- Modify: `apps/web/src/auth/LoginPage.tsx`, `apps/web/src/auth/ResetPasswordPage.tsx`, `apps/web/src/i18n/en.ts`, `apps/web/src/styles/app.css`
- Test: `apps/web/src/auth/auth.test.tsx`

**Interfaces:**
- Produces: `AuthLayout({ children })` — left `<section>` on `--pine-800`: brand, h1 "Your CV, organized and ready for every application.", paragraph "Import the CV you already have. Resumora sorts it into clear sections, keeps your own words, and helps you tailor it to each job.", decorative CV sketch (`aria-hidden`); right: the form, max-width 380px. Sign-in title becomes "Welcome back" with subtitle "Sign in to continue with your CV."; sign-up keeps "Create your account".
- [ ] **Step 1: Write the failing test:** `"login page shows the product promise"` → heading "Your CV, organized and ready for every application." and form heading "Welcome back". Update the existing `findByRole("heading", { name: "Sign in" })` query to "Welcome back".
- [ ] **Step 2:** Run `npx vitest run src/auth` — Expected: FAIL.
- [ ] **Step 3:** Implement; stack to one column under 900 px (left panel shrinks to brand + h1).
- [ ] **Step 4:** Run `npx vitest run` — Expected: all pass.
- [ ] **Step 5:** Commit `feat(web): two-column sign-in`.

### Task 8: Clean-up and a real look

**Files:** `apps/web/src/styles/app.css`, `README.md` (screens section, if it describes the UI)

- [ ] **Step 1:** Remove CSS for deleted classes (`drawer*`, `import-dialog`, `editor-sections`, `cv-section` if unused); `grep` each removed class in `src/` — Expected: no matches.
- [ ] **Step 2:** Run `npm run lint && npm run typecheck && npm test && npm run build` at the root — Expected: all pass.
- [ ] **Step 3:** Open http://127.0.0.1:5173 in the browser pane at 1440 px and 390 px wide: sign in, open a role, use Next, open History and preview, start an import. Compare with the mockups; fix visible gaps (spacing, fonts loading, focus ring) with CSS only.
- [ ] **Step 4:** Commit `chore(web): remove old styles after the redesign`.
