# Perfect CV · Plan C: editing on the page, and the helper panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit every piece of CV text directly on the page (instant, with Enter/Backspace bullets, keyboard-only), rename sections, reorder by dragging, and replace the form side panel with a helper panel (health flags, sections, per-section tools, "Coming next" AI buttons) that becomes a bottom sheet on phones.

**Architecture:** One pure reducer (`cvReducer`) holds every change as a small action; the existing `useAutosave` keeps saving the result. The editable page is built from small memoised components keyed by item `id`, each made of invisible auto-growing fields. The panel follows which section the cursor is in. Drag uses `@dnd-kit` for mouse and touch; the keyboard path (Space, ↑/↓, Space, Esc) is our own handler on the grip, so it works and is testable in jsdom.

**Tech Stack:** React 19, TypeScript 5.9, vitest 5 + Testing Library + user-event (jsdom), `@dnd-kit/core` + `@dnd-kit/sortable` (new).

**Spec:** `docs/superpowers/specs/2026-11-04-perfect-cv-design.md` · **Mockups:** https://claude.ai/artifact/4yUZFMvXzinYKag7yk5kJn
**Depends on:** Plan A (`CvContent` v2, `SectionKey`, `CATEGORY`, `SECTION_KEYS`, `normalizeLayout`, `missingCategories`, `isSectionEmpty`, `parseTypedDate`, `formatYearMonth`). Independent of Plan B.

## Global Constraints

- Everything in Plan A's Global Constraints applies.
- Look and keys follow the mockups exactly. No ↑↓ arrows anywhere: reorder by dragging.
- Not `contentEditable`. Fields are `<textarea>` (multi-line) or `<input>` (one line) with no visible border, the page font, and `field-sizing: content` plus a JS fallback that sets the height (textarea) or `size` (input).
- Panel width 330 px; under 900 px it becomes a bottom sheet.
- All UI text (buttons, hints, tips, panel copy, aria labels) in `apps/web/src/i18n/en.ts`. CV headings come from `CATEGORY[key].label[cv.locale]` or `layout.titles[key]`.
- Keep the import review, History, the conflict banner, autosave and the top bar working. Existing tests for those must stay green.
- Files under ~300 lines; one component per file where it is reused.

## Review Focus

1. **Typing fast in a long CV** (10 roles × 8 bullets) must re-render only the edited field → render-count test in Task 5.
2. **Enter in the middle of a bullet that contains a line break** (Shift+Enter earlier) must split at the cursor and keep the line break in the right half → reducer test in Task 1.
3. **Pasting multi-line text into a bullet** must stay one bullet with line breaks (no automatic split) → test in Task 3.
4. **A section hidden while the cursor is inside it** must move focus to the page and the panel to the overview, never leave focus on a removed element → test in Task 8.
5. **History preview or the import screen open** while the page is editable must keep the page inert (no edits can race a restore/apply) → test in Task 9.

---

### Task 1: `cvReducer` — every edit as one small action

**Files:**
- Create: `apps/web/src/cv/edit/cvReducer.ts`, `apps/web/src/cv/edit/cvReducer.test.ts`

**Interfaces:**
- Consumes: v2 `CvContent`, `newId`, `normalizeLayout`, `SectionKey`.
- Produces: `cvReducer(cv: CvContent, action: CvAction): CvContent` (pure, returns the same object when nothing changes) with:
  - `type ListKey = "experience" | "volunteering" | "education" | "languages" | "certifications" | "projects" | "awards" | "courses" | "publications" | "interests" | "custom"`
  - `type BulletOwner = { list: "experience" | "volunteering"; itemId: string } | { list: "achievements" }`
  - Actions:
    - `{ type: "setBasics"; field: keyof Basics; value: string }`
    - `{ type: "setTitles"; index: 0 | 1; value: string }`
    - `{ type: "setItemField"; list: ListKey; itemId: string; field: string; value: string | boolean }`
    - `{ type: "addItem"; list: ListKey; id: string }` → appends an empty item with that id (created by the caller with `newId()`, so focus can follow it). Roles get one empty bullet with id `${id}-b1`.
    - `{ type: "removeItem"; list: ListKey; itemId: string }`
    - `{ type: "moveItem"; list: ListKey; from: number; to: number }`
    - `{ type: "setBullet"; owner: BulletOwner; bulletId: string; text: string }`
    - `{ type: "splitBullet"; owner; bulletId; at: number; newId: string }` → text before `at` stays, text after goes to a new bullet right after.
    - `{ type: "joinBullet"; owner; bulletId }` → appends this bullet's text to the previous one and removes it; no-op on the first bullet.
    - `{ type: "addBullet"; owner; newId: string }` (at the end)
    - `{ type: "addSkill"; group: SkillGroup; name: string }` (trimmed; ignored if empty or already in any group, case-insensitive)
    - `{ type: "removeSkill"; group: SkillGroup; skillId: string }`, `{ type: "moveSkill"; skillId: string; to: SkillGroup }`
    - `{ type: "addInterest"; name: string }`, `{ type: "removeInterest"; itemId: string }`
    - `{ type: "setSummary"; value: string }`
    - `{ type: "setSectionTitle"; key: SectionKey; value: string }` (empty string removes the override)
    - `{ type: "toggleHidden"; key: SectionKey }`
    - `{ type: "moveSection"; from: number; to: number }` (indexes into the **visible list of sections present on the CV** as the panel shows it; the reducer maps them to `layout.order` positions)
    - `{ type: "addSection"; key: SectionKey; id: string }` (creates the first empty item or bullet with that id; un-hides the key)
    - `{ type: "addCustomSection"; id: string; title: string }`
    - `{ type: "setCurrent"; list: "experience" | "volunteering"; itemId: string; current: boolean }` (clears `endDate` when true)
  - Limits from `cv.ts` are respected: adding past `MAX_ITEMS` / `MAX_BULLETS` / `MAX_ACHIEVEMENTS` is a no-op.

- [ ] **Step 1: Write failing tests:**
  - `splitBullet at the middle` ("Led a team|of 5" → "Led a team", "of 5"); `splitBullet at the end creates an empty bullet`; `splitBullet keeps an earlier line break in the left half` ("a\nb|c" → "a\nb", "c").
  - `joinBullet merges into the previous bullet`; `joinBullet on the first bullet does nothing`; `an empty bullet joined away just disappears`.
  - `moveSection moves between visible sections only` (hidden ones keep their place relative to neighbours).
  - `setSectionTitle "" removes the override`.
  - `addSection un-hides and creates one empty entry with the given id`.
  - `addSkill ignores duplicates across groups`; `moveSkill moves a to-sort skill into technical`.
  - `setCurrent true clears the end date`.
  - `adding past the bullet limit does nothing`.
  - `an action that changes nothing returns the same object` (`toBe`).
- [ ] **Step 2: Run** `npm test -w apps/web -- cvReducer`. Expected: FAIL.
- [ ] **Step 3: Implement.** If the file passes ~300 lines, split list helpers into `apps/web/src/cv/edit/lists.ts`.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): one reducer for every CV edit`.

### Task 2: `PageField` — text that looks like the page and grows

**Files:**
- Create: `apps/web/src/cv/edit/PageField.tsx`, `apps/web/src/cv/edit/page-field.test.tsx`
- Create: `apps/web/src/styles/cv-page.css` (move the `.cv-*` rules out of `app.css` and add the field rules from the mockup)

**Interfaces:**
- Produces: `PageField` = `memo` component with props `{ value: string; onChange(value: string): void; label: string; placeholder?: string; multiline?: boolean; className?: string; fieldKey: string; onKeyDown?(e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void }`. Renders `data-field={fieldKey}` for focus restore. Exposes a ref (`forwardRef` is not needed in React 19; accept `ref` as a prop).
- `focusField(root: HTMLElement, fieldKey: string, caret?: number): void` in `apps/web/src/cv/edit/focus.ts` — finds `[data-field="…"]`, focuses it, sets the caret (end when omitted). Called after a dispatch in `requestAnimationFrame`.

- [ ] **Step 1: Write failing tests:** `shows the value and calls onChange as you type`; `has the accessible name from label`; `a multiline field is a textarea, a single-line one an input`; `focusField puts the caret where asked`.
- [ ] **Step 2: Run** `npm test -w apps/web -- page-field`. Expected: FAIL.
- [ ] **Step 3: Implement.** Fallback growth: on change and on mount, if `!CSS.supports("field-sizing","content")`, set textarea `style.height = scrollHeight` / input `size = max(2, value.length + 1)`.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): page fields that look like the CV text`.

### Task 3: Bullets, chips and dates

**Files:**
- Create: `apps/web/src/cv/edit/BulletList.tsx`, `ChipInput.tsx`, `DateField.tsx`
- Create: `apps/web/src/cv/edit/bullets.test.tsx`, `chips.test.tsx`, `date-field.test.tsx`

**Interfaces:**
- Consumes: `PageField`, `focusField`, `CvAction`, `parseTypedDate`, `formatYearMonth`.
- Produces:
  - `BulletList` props `{ owner: BulletOwner; bullets: Bullet[]; dispatch(a: CvAction): void; ownerName: string }`. Keys: Enter (no Shift) → `splitBullet` at `selectionStart` and focus the new bullet at 0; Backspace with caret at 0 and no selection on a non-first bullet → `joinBullet` and focus the previous one at its old length; Backspace on the only bullet when empty does nothing. Paste is never intercepted. Each bullet's label: `t("edit.bullet", { n, of: ownerName })` → "Bullet 2 of Senior Product Manager".
  - `ChipInput` props `{ items: {id: string; name: string}[]; onAdd(name: string): void; onRemove(id: string): void; label: string; tone?: "sort" }`. Enter or `,` with text → `onAdd`; Backspace in an empty box → removes the last chip and puts its name in the box.
  - `DateField` props `{ value: string; locale: Locale; label: string; onCommit(value: string): void; onPresent?(): void }`. Shows `formatYearMonth`. On input, valid → `onCommit` (or `onPresent` for "present"); invalid → hint `t("edit.dateHint")` = `Not saved yet. Try "Mar 2021", "03/2021" or "2021".` with `role="status"`. Blur while invalid → puts back the last good formatted value, hint goes away.
- [ ] **Step 1: Write failing tests:**
  - bullets: `Enter splits at the cursor and moves focus to the new bullet`; `Shift+Enter adds a line break, not a bullet`; `Backspace at the start joins with the bullet above`; `pasting two lines keeps one bullet`.
  - chips: `Enter adds a chip`; `a comma adds a chip`; `Backspace in an empty box pulls the last chip back`.
  - dates: `a typed "03/2021" is saved as 2021-03`; `"Spring" shows the hint and is not saved`; `leaving an invalid date puts back the last good one`; `"prezent" calls onPresent`.
- [ ] **Step 2: Run** `npm test -w apps/web -- bullets chips date-field`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): bullets, chips and dates typed on the page`.

### Task 4: Editable sections (header, summary, lists, other) and missing boxes

**Files:**
- Create: `apps/web/src/cv/edit/EditablePage.tsx` (lays out header + sections in `normalizeLayout(cv.layout).order`, skips hidden, renders missing boxes)
- Create: `apps/web/src/cv/edit/SectionHeading.tsx` (heading is a `PageField`; placeholder = standard label)
- Create: `apps/web/src/cv/edit/sections/HeaderEdit.tsx`, `SummaryEdit.tsx`, `SimpleListEdit.tsx` (languages, certifications, projects, awards, courses, publications: one line per item using the item's main field plus its second field, e.g. language + level), `InterestsEdit.tsx`, `OtherEdit.tsx` (each custom section: its own title field + details textarea), `AchievementsEdit.tsx`
- Create: `apps/web/src/cv/edit/MissingBox.tsx`
- Create: `apps/web/src/cv/edit/editable-page.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3, `missingCategories`.
- Produces: `EditablePage` props `{ cv: CvContent; dispatch(a: CvAction): void }`. Each section root has `data-section={key}`; each item root `data-item={id}`. "+ Add …" buttons (`t("edit.add.item")` etc.) are always in the DOM (reachable by Tab) and visually shown on `:hover`/`:focus-within` only. `MissingBox` for flagged sections shows label, the `why` text and an **Add** button → `addSection` and focus its first field.
- [ ] **Step 1: Write failing tests:** `every header field is editable` (type a new name → dispatch `setBasics`); `typing in the summary updates it`; `renaming a heading shows the new name and clearing it brings the standard one back`; `a missing section shows a box with Add, and Add puts the cursor in the new section`; `a hidden section shows neither the section nor its box`; `+ Add item is reachable with Tab`; `a custom section keeps its own heading`.
- [ ] **Step 2: Run** `npm test -w apps/web -- editable-page`. Expected: FAIL.
- [ ] **Step 3: Implement** (mockup 1 styles in `cv-page.css`).
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): edit the header, summary and list sections on the page`.

### Task 5: Roles, education and skills on the page

**Files:**
- Create: `apps/web/src/cv/edit/sections/RolesEdit.tsx` (experience and volunteering), `RoleItem.tsx` (memo), `EducationEdit.tsx`, `SkillsEdit.tsx`
- Create: `apps/web/src/cv/edit/roles.test.tsx`, `apps/web/src/cv/edit/speed.test.tsx`

**Interfaces:**
- Produces: `RoleItem` = `memo(({ role, list, locale, dispatch }) => …)` with title, dates (`DateField` start – end or "Present" text when `current`), company · location, `BulletList`. `dispatch` must be stable (from `useReducer`-style wrapper in Task 9; in tests pass a `vi.fn()` created once). Skills: three rows (Technical, Professional, To sort — last only when not empty) with `ChipInput`.
- [ ] **Step 1: Write failing tests:**
  - `+ Add role adds an empty role and focuses its title`.
  - `a current role shows Present instead of an end date`.
  - `typing "present" in the end date marks the role current`.
  - `skills: typing a chip in Technical adds it there`.
  - speed: `typing in one bullet re-renders only that role` → render a CV with 10 roles × 8 bullets, wrap `RoleItem` render count with a test-only counter (`vi.spyOn` on a module-level `onRender` hook or React `<Profiler>`), type one character in role 3, assert only role 3 rendered again.
- [ ] **Step 2: Run** `npm test -w apps/web -- roles speed`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): edit roles, education and skills on the page`.

### Task 6: Reorder by dragging (sections and items)

**Files:**
- Modify: `apps/web/package.json` (add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` at exact current versions)
- Create: `apps/web/src/cv/edit/DragList.tsx`, `apps/web/src/cv/edit/DragGrip.tsx`, `apps/web/src/cv/edit/drag.test.tsx`
- Modify: `RolesEdit.tsx`, `EducationEdit.tsx`, `SimpleListEdit.tsx`, `OtherEdit.tsx` (wrap items in `DragList`)

**Interfaces:**
- Produces:
  - `DragList<T extends {id: string}>` props `{ items: T[]; onMove(from: number, to: number): void; label(item: T): string; children(item: T, grip: ReactNode): ReactNode }`. Pointer and touch via `DndContext` with `PointerSensor` (distance 4 px) and `TouchSensor` (delay 250 ms, tolerance 5 px) and `SortableContext` with `verticalListSortingStrategy`. **No `KeyboardSensor`.**
  - `DragGrip` = a `<button>` "⠿" with `aria-label={t("edit.drag", { name })}` ("Reorder Senior Product Manager") and `aria-describedby` pointing to a hidden hint `t("edit.dragHint")` = "Press Space to pick up, arrow keys to move, Space to drop, Escape to cancel." Keyboard: Space → picked up (`aria-pressed="true"`, announce `t("edit.picked", {name, n, total})`); ↑/↓ → `onMove(i, i∓1)` and announce new position; Space → drop and announce; Esc → move back to the start index and announce cancelled. Announcements go to one shared `aria-live="assertive"` region.
  - On the page the grip sits in the left margin and shows on hover/focus-within (mockup). In the panel it sits at the start of each section row.
- [ ] **Step 1: Write failing tests:** `Space, ArrowDown, Space moves a role down one place`; `Escape puts it back`; `the move is announced`; `the grip has a name and the hint`. (Pointer dragging is covered by dnd-kit; don't test pointer maths in jsdom.)
- [ ] **Step 2: Run** `npm test -w apps/web -- drag`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): reorder sections and items by dragging`.

### Task 7: Helper panel — overview

**Files:**
- Create: `apps/web/src/cv/panel/HelperPanel.tsx` (switches overview / section tools), `apps/web/src/cv/panel/Overview.tsx`, `apps/web/src/cv/panel/overview.test.tsx`
- Create: `apps/web/src/styles/panel.css`

**Interfaces:**
- Consumes: `missingCategories`, `isSectionEmpty`, `CATEGORY`, `DragList`, `cvReducer` actions.
- Produces: `HelperPanel` props `{ cv: CvContent; dispatch; focus: { key: CategoryKey; itemId?: string } | null; onBack(): void; onFocusField(fieldKey: string): void }`. `Overview`: "Needs attention" cards (pill Missing/Tip, label, `why`, **Add** or **Fill in** for name/email) or "Nothing missing. Every key section is filled in."; "Sections" = sections present on the CV in order, each row: grip, name (`titles[key]` or label), show/hide eye button (`aria-pressed`), "Hidden" badge and strike-through when hidden; "Add section" `<select>` with categories not on the CV plus "Custom section", and an Add button (custom → `addCustomSection` with title "" and focus its heading). Fine print: "Click a heading on the page to rename it. Hidden sections stay saved but are left out of the PDF, and are never flagged."
- [ ] **Step 1: Write failing tests:** `flags list what is missing and Add creates the section`; `Fill in focuses the email field`; `hiding a section strikes it through and removes its flag`; `adding a custom section focuses its heading`; `sections can be reordered from the panel with the keyboard`.
- [ ] **Step 2: Run** `npm test -w apps/web -- overview`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): helper panel overview with flags and sections`.

### Task 8: Helper panel — section tools, following the cursor

**Files:**
- Create: `apps/web/src/cv/panel/SectionTools.tsx`, `apps/web/src/cv/panel/sectionTips.ts` (tips and AI button names per section, as i18n keys), `apps/web/src/cv/panel/section-tools.test.tsx`
- Create: `apps/web/src/cv/edit/useFocusSection.ts` (listens to `focusin` on the page root, reads the closest `data-section` / `data-item`, returns `focus`; Esc or a mousedown on empty page space → `null` and blurs)

**Interfaces:**
- Produces: `SectionTools` shows: "← All sections" (`onBack`), the heading (own or standard) and a hide button, "Your heading. Still counts as {label} for flags and import." with "Use standard name" when renamed; for a role: a box with the role title, "I work here now" switch (`setCurrent`), "Remove role"; for skills with to-sort items: each to-sort chip with "→ Technical" / "→ Professional"; tips list; "Improve with AI" buttons for summary, achievements, experience, skills — `aria-disabled="true"`, `title={t("panel.ai.soon")}`, each with a "Coming next" pill. Copy from the mockup.
- [ ] **Step 1: Write failing tests:** `clicking into a role shows its tools`; `moving into another section switches the panel`; `Esc returns to the overview`; `the work-here-now switch shows Present on the page`; `hiding the section you are in sends focus to the page and the panel to the overview`; `AI buttons are visible, marked Coming next and do nothing`.
- [ ] **Step 2: Run** `npm test -w apps/web -- section-tools`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): section tools that follow the cursor`.

### Task 9: Wire it into the editor; remove the form panel

**Files:**
- Modify: `apps/web/src/cv/Editor.tsx` (use `EditablePage` + `HelperPanel`; `dispatch = useCallback(a => setContent(c => cvReducer(c, a)), [setContent])` — check `useAutosave.setContent` accepts an updater; if not, add that in `useAutosave.ts` with a test)
- Modify: `apps/web/src/cv/page/CvDocument.tsx` (read-only only: remove `selected`/`onSelect` and the block buttons; still used by History preview and the import review)
- Delete: `SidePanel.tsx`, `PanelBody.tsx`, `PanelFooter.tsx`, `AddSection.tsx`, `fields.tsx` (if unused), `sections/*`, `page/blocks.ts` parts no longer used, `side-panel.test.tsx`
- Modify: `apps/web/src/cv/editor.test.tsx`, `history.test.tsx` (new flows)
- Modify: `apps/web/src/i18n/en.ts` (remove unused keys)

**Interfaces:**
- Produces: the final editor: top bar (unchanged), page (`EditablePage`, inert while History or Import is open; History shows the read-only `CvDocument` preview as today), panel on the right (`HelperPanel`, replaced by `HistoryPanel` while History is open). Save notices (`autosave.problem`, conflict banner) sit above the page.
- [ ] **Step 1: Update tests first:** `editor.test.tsx` → `typing on the page autosaves` (type in the summary, `saveCv` called with the new summary after the debounce); `a keyboard-only user can add a role and two bullets` (Tab to "+ Add role", Enter, type title, Tab to bullet, type, Enter, type; content has 1 role with 2 bullets); `the page is inert while History is open`; `the page is inert while an import is open`.
- [ ] **Step 2: Run** `npm test -w apps/web`. Expected: the updated tests FAIL.
- [ ] **Step 3: Implement**, delete the old files.
- [ ] **Step 4: Run** the full check `npm run lint && npm run typecheck && npm test`. Expected: green.
- [ ] **Step 5: Commit** `feat(web): edit on the page; remove the form side panel`.

### Task 10: Phones — the panel becomes a bottom sheet; CSS split

**Files:**
- Create: `apps/web/src/cv/panel/BottomSheet.tsx`, `apps/web/src/cv/panel/bottom-sheet.test.tsx`
- Create: `apps/web/src/styles/auth.css`, `editor.css`, `review.css`; reduce `app.css` to base rules (buttons, inputs, labels) and imports
- Modify: `HelperPanel` usage in `Editor.tsx` (`useMediaQuery("(max-width: 899px)")` → wrap in `BottomSheet`)

**Interfaces:**
- Produces: `BottomSheet` props `{ state: "peek" | "full"; onStateChange(s): void; children }`. A grip button toggles peek/full (`aria-expanded`); a vertical pointer drag of more than 40 px up/down switches state. Peek height shows the section tools' first box; full = up to 80% of the viewport. Focusing a field sets `peek`; Esc sets `peek`. Respects `env(safe-area-inset-bottom)`.
- [ ] **Step 1: Write failing tests:** `the grip toggles between peek and full`; `focusing a page field brings the sheet to peek`.
- [ ] **Step 2: Run** `npm test -w apps/web -- bottom-sheet`. Expected: FAIL.
- [ ] **Step 3: Implement**, then split the CSS by screen with no visual change.
- [ ] **Step 4: Run** the full check. Expected: green. Then `npm run dev` and look at the editor at 375 px and 1280 px in the browser pane (the user signs in themselves) and compare with the mockups.
- [ ] **Step 5: Commit** `feat(web): bottom sheet on phones; split styles per screen`.

### Task 11: Decision record

- [ ] **Step 1:** `docs/decisions/NNNN-edit-the-cv-on-the-page.md` (next free number): text fields styled as the page instead of a form panel or contentEditable; one reducer; drag with @dnd-kit for pointer and touch plus our own keyboard path. `affects: [file:apps/web/src/cv/edit/cvReducer.ts, file:apps/web/src/cv/Editor.tsx, file:apps/web/src/cv/panel/HelperPanel.tsx]`.
- [ ] **Step 2: Commit** only that file: `docs: decision record for editing on the page`.
