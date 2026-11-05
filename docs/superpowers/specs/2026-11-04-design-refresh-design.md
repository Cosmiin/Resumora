# Design refresh: page + side panel

**Date:** 2026-11-04 · **Status:** approved mockups, spec for review
**Mockups:** [Resumora redesign canvas](https://claude.ai/artifact/G6rfmGp8UnZMLaxZu6DnDv) (private to the owner):
Editor, Sign in, Import review, History.
**Builds on:** `2026-11-04-rebuild-design.md` (Plans 1–2 done). Lands before Plan 3, whose templates
and PDF export reuse the page component defined here.

## What the owner asked for
- A "calm and premium" look: keep the pine/sage brand, plenty of white space, a serif for headings.
- The CV shown as a real A4 page. Clicking a block on the page opens its fields in a **side panel**
  ("page + side panel"; chosen over editing text on the page and over a form-only editor).
- Still simple and reliable: editing stays in ordinary form fields validated by the shared zod schema.

## Decisions
- **Fonts:** Newsreader (headings, the CV name) and Instrument Sans (UI and CV body), **self-hosted**
  from `@fontsource-variable/*` packages. No Google Fonts requests: loading them from Google's CDN
  sends visitors' IP addresses to Google, a known GDPR problem in the EU.
- **Colours:** the existing `styles/tokens.css` palette, unchanged. New tokens only for the page
  shadow, the selected-block outline and radii. The focus ring stays marigold.
- **One page style for now.** Templates are Plan 3; the page is built so a template is a variant of it.
- **Hidden until they exist:** the "Jobs" tab (Plan 4), "Download PDF" (Plan 3), "Continue with Google"
  (open question in the main spec). The mockups show them; the build leaves them out.
- **Import review stays read-only.** The mockup's Technical / Professional buttons for "to sort" skills
  would mean editing the stored import before applying it, which needs a new API. Instead the review
  highlights them and says "you can sort these after using the CV"; the sorting buttons live in the
  editor's Skills panel, where they already work. Cost if wrong: one extra step for the user.

## Screens
1. **Sign in / sign up / reset:** two columns: a dark pine panel (product name, one-line promise,
   small CV illustration) and the form. Stacks to one column under 900 px.
2. **Editor:** top bar (name, "My CV", save status, History, Import CV, account). Below, the page in
   the centre and, when a block is selected, the side panel on the right.
3. **Import review:** replaces today's dialog with a full screen: the imported CV as a page, and a
   panel with counts (roles, skills, sections), "to sort" skills, warnings, and "Use this CV".
4. **History:** opens in the side-panel slot. Selecting a version shows it on the page with a
   "Previewing … your current CV isn't changed" notice; "Restore this version" sits at the bottom.

## Components (apps/web/src)
- `cv/page/CvDocument.tsx`: **pure** render of a `CvContent` as an A4 page, at real proportions
  (210 × 297). Props: `content`, optional `selected: BlockRef | null`, optional `onSelect(ref)`. Without
  `onSelect` it is read-only (import review, history preview, later PDF). Each block is a `<button>`
  when selectable, so it works with keyboard and screen readers. Empty sections are not drawn.
- `cv/page/blocks.ts`: `type BlockRef = { section: SectionKey; itemId?: string }`, where `SectionKey`
  is basics | summary | experience | education | skills | languages | certifications | projects | custom.
  It also provides a helper that finds the item for a ref, and returns null when the item was deleted.
- `cv/SidePanel.tsx`: the panel frame: title, close button, Escape closes it, focus moves into it on
  open and back to the block on close. It renders the editor for the selected ref.
- Section editors: today's `sections/*` components, split so each can edit **one item**
  (e.g. `ExperienceFields` for a single role) plus a list-level view for "add / reorder". Previous / Next
  steps through items of the same section. The fields, limits and validation stay exactly as they are.
- `cv/AddSection.tsx`: "+ Add a section" under the page, listing the sections that are empty.
- `layout/AppShell.tsx`: the top bar, shared by the editor and history; sign-in has its own layout.
- `imports/ImportReview.tsx` becomes the full-screen review built from `CvDocument` and a summary panel.
- `cv/HistoryDrawer.tsx` becomes `HistoryPanel.tsx` in the side-panel slot. The preview uses `CvDocument`.

## Behaviour
- Selecting a block never changes data. Typing in the panel updates `content` exactly as the form does
  today, so autosave, the version check, conflict warnings and `inert` while history is open all stay.
- The selected block has a pine outline and an "Editing" label. Hover shows a light tint.
- If the selected item disappears (deleted, restored, imported), the panel closes.
- **Under 900 px:** the panel becomes a full-width sheet over the page, with a back button.
- The page scales down to fit narrow screens. Text is never cut off: a long CV makes the page
  taller, and splitting it into real A4 pages is part of Plan 3's PDF work.

## Accessibility
Real buttons and labels; visible focus; Escape closes panels; text contrast ≥ 4.5:1 (the `sage-600`
muted text on white passes); touch targets ≥ 44 px; the panel is a labelled `<aside>`, not a modal,
so the page stays reachable.

## Testing (Vitest + Testing Library, behaviour a user sees)
- `CvDocument` shows every filled section of a full sample CV and hides empty ones. Read-only mode
  has no buttons.
- Clicking a role opens the panel with that role's fields. Editing the title updates the page, and
  autosave sends it. Escape closes the panel and returns focus.
- Previous / Next move between roles. Deleting the selected role closes the panel.
- Moving a "to sort" skill in the Skills panel still works.
- Import review shows counts, "to sort" skills and warnings, and "Use this CV" applies as today.
- History: selecting a version previews it on the page. Restore works and is disabled while
  changes are unsaved.
- Existing editor, autosave, history and import tests keep passing, with their queries updated to
  the new layout.

## Out of scope
Templates, PDF export, AI improve (Plan 3); Jobs (Plan 4); Google sign-in; a Romanian UI; dark mode.
