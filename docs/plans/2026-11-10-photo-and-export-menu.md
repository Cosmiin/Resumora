# Photo controls and Export menu (manual testing 2026-11-10, group E)

Points #1, #13, #14 of `manual-testing-notes-2026-11-10.md`. Owner's decisions (2026-11-10):
- Photo picker design: **variant B**: an outline "Upload photo" button in the app's `.btn` style with a "JPG, PNG or WebP" hint (no browser-default file input). The saved photo has a small round X badge on its corner.
- **Save** works save-as-you-go: upload, drag and zoom autosave right away like the rest of the CV. Save only closes the editing controls.
- The **template** decides whether there's a photo and where it goes. Screen, PDF and Word all follow it. Classic and Modern: top right of the header. Compact: no photo.
- Export menu: closes on any click outside it **and on Escape**.
- Photo shape: the user picks **square or round** on My CV. The page, the tailored CV, PDF and Word all use it (Task 6). Exports also use the drag/zoom crop, and WebP works (Task 5, owner OK'd).

Feature id for cost tags: `photo-and-export-menu`. One branch, tasks in order (Tasks 2 and 3 both touch `HeaderEdit.tsx`).
Contract change: Task 6 adds an optional `shape` to `basics.photo` in `packages/shared/src/cv.ts` (row in `tools/contract-claims.md`).

## Task 1: Export menu closes on outside click and Escape

---
files: [apps/web/src/export/ExportMenu.tsx, apps/web/src/export/export.test.tsx]
new_files: []
deps: false
size: 60
---

**Goal:** While the Export ▾ menu (tailored job toolbar) is open, a pointer press anywhere outside the menu's root (`.tailored-menu`), including on another button, closes it. Pressing Escape closes it too. Clicks inside the menu (the warning text, the export choices) keep it open as they do today; the Review button still closes it as today (`ExportMenu.tsx:78`, relied on by `tailor/guided-review.test.tsx:109`). The Export button still toggles.

**Acceptance tests:**
- Open the menu, press the pointer on an element outside it: the menu closes (`aria-expanded="false"`, choices gone).
- Open the menu, click "CV as PDF" inside it: the menu stays open.
- Open the menu, press Escape: it closes.
- Click Export twice: open, then closed (no double toggle from the outside listener).
- With the menu closed, an outside press or Escape does nothing.

**Out of scope:** the menu's contents, export logic, other menus in the toolbar.

## Task 2: Tailored CV shows the photo read-only, where its template puts it

---
files: [apps/web/src/styles/cv-page.css, apps/web/src/cv/edit/sections/HeaderEdit.tsx, apps/web/src/export/pdf.tsx, apps/web/src/export/docx.ts, apps/web/src/export/export-files.ts, apps/web/src/cv/edit/EditablePage.tsx, apps/web/src/cv/page/CvDocument.tsx, apps/web/src/cv/page/templates.ts, apps/web/src/cv/edit/editable-page.test.tsx, apps/web/src/cv/page/cv-document.test.tsx, apps/web/src/cv/page/templates.test.tsx]
new_files: [apps/web/src/cv/page/CvPhoto.tsx]
deps: false
size: 90
---

**Goal:** The tailored CV (job → CV tab) has no photo editing: no upload, drag, zoom or remove. `HeaderEdit` gets the `tailored` flag and the template from `EditablePage`. When tailored, it renders the photo read-only, only if the template has a photo slot, in the same spot and crop as `CvDocument`'s header (96 px square, top right, `object-position`/`scale` from the saved x/y/zoom). The base CV keeps `PhotoField`.
- Templates declare their photo slot: replace `showsPhoto: boolean` in `templates.ts` with `photo: "header-right" | null` (Classic and Modern `"header-right"`, Compact `null`). Update every reader (`CvDocument.tsx`, and in Task 4 the exports). `"header-right"` is the only slot today.
- New `cv/page/CvPhoto.tsx`: the signed-URL fetch plus the cropped `<img>` box, moved out of `CvDocument.tsx` so `CvDocument` and the tailored `HeaderEdit` share one copy.

**Acceptance tests:**
- Tailored page, Classic template, CV with a photo: the photo is shown and there is no file input, no "Photo zoom" slider, no "Remove photo" button, no position hint.
- Tailored page, Compact template, CV with a photo: no photo and no photo controls.
- Base CV editor: `PhotoField` still rendered (existing photo tests keep passing).
- `CvDocument` still shows the photo for Classic/Modern and not for Compact (existing tests, updated for the `photo` field).
- `templates.ts`: Classic and Modern have `photo: "header-right"`, Compact has `null`.

**Out of scope:** `PhotoField`'s look (Task 3), exports (Task 4), any other template styling.

## Task 3: My CV photo picker: styled button, Save, small X, click to edit

---
files: [apps/web/src/cv/panel/PhotoField.tsx, apps/web/src/cv/panel/photo.test.tsx, apps/web/src/cv/edit/sections/HeaderEdit.tsx, apps/web/src/i18n/en.ts, apps/web/src/styles/cv-page.css]
new_files: []
deps: false
size: 120
---

**Goal:** `PhotoField` on the base CV, in three states:
- **No photo:** an outline button "Upload photo" (`.btn` look, upload icon optional) that opens the file picker, with the hint "JPG, PNG or WebP" under it. The native input is visually hidden but still keyboard-reachable through the button (a `<label>` styled as the button for the hidden input, or a button that calls `input.click()`). While uploading, the button reads "Uploading photo..." and is disabled.
- **Editing** (right after an upload, or after clicking the saved photo): the draggable preview, the position hint, the zoom slider and a primary **Save** button. Upload, drag and zoom still call `onChange` immediately (autosave, as today). Save only switches to the saved state. No "Remove photo" button here.
- **Saved** (a photo exists and editing is closed; this is the state on page load): only the photo, with a small round X badge on its corner (`aria-label` "Remove photo") that calls `onChange(null)`. Clicking the photo (or Enter/Space on it) opens Editing.
- In `HeaderEdit`, the base CV's photo control sits at the header's top right, where Classic/Modern place the photo, instead of a block under the contact line.
- Replace the strings "Choose a photo" (`cv.photo.choose`) with "Upload photo". Add `cv.photo.formats` "JPG, PNG or WebP", `cv.photo.save` "Save", `cv.photo.edit` "Adjust photo" (accessible name of the saved photo). Keep `cv.photo.remove` for the X.

**Acceptance tests:**
- No photo: an "Upload photo" button is shown; choosing a file uploads it (existing upload tests), and the field then shows the zoom slider and a Save button.
- Editing: moving the slider calls `onChange` with the new zoom right away (autosave), before Save.
- Save: slider, position hint and Save disappear. The photo and an X labelled "Remove photo" remain.
- Saved: clicking the photo shows the slider and Save again.
- X: calls `onChange(null)`; the field shows the "Upload photo" button again.
- A CV loaded with a photo starts in the saved state (no slider).
- Existing upload error, unsupported type and shrink tests still pass.

**Out of scope:** the tailored CV (Task 2), exports, photo storage and shrink logic, the CV data shape.

## Task 4: PDF and Word place the photo in the template's slot

---
files: [apps/web/src/export/pdf.tsx, apps/web/src/export/docx.ts, apps/web/src/export/export-files.ts, apps/web/src/export/pdf.test.tsx, apps/web/src/export/docx.test.ts, apps/web/src/export/export-files.test.ts]
new_files: []
deps: false
size: 80
---

**Goal:** The exports read the template's `photo` slot (Task 2) instead of `showsPhoto`. For `"header-right"`, the photo sits at the top right of the header with the name, titles and contact on the left, as on screen. Today it sits above the name at the left. `null` (Compact) means no photo. PDF: a header row with the text column on the left (flex 1) and the 72 pt photo on the right. Word: a right-floating image in the name paragraph (no table: the builder handles only paragraphs), keeping the name's TITLE heading.

**Acceptance tests:**
- PDF, Classic with a photo: the header's image comes after the text column in a row (`flexDirection: "row"`), not before the name.
- PDF, Compact with a photo: no image.
- Word, Classic with a photo: the image is in the header's right position (table cell or floating anchor to the right), and the name paragraph is still TITLE.
- Word, Compact: no image.
- `export-files`: the photo is downloaded only for templates with a slot.

**Out of scope:** cropping the photo in exports (Task 5), WebP in exports (Task 5), other export layout.

## Task 5 (needs the owner's OK): exports use the photo's crop, and WebP works

---
files: [apps/web/src/export/export-files.ts, apps/web/src/export/export-files.test.ts, apps/web/src/cv/panel/shrink-photo.ts, apps/web/src/cv/panel/shrink-photo.test.ts]
new_files: []
deps: false
size: 60
---

**Goal:** Today both exports ignore the saved drag/zoom (the whole image is fitted in the box), and a WebP photo is left out silently. Before building the PDF/Word, `export-files.ts` crops the downloaded photo in the browser to the square the page shows (same x/y/zoom maths as `object-position` + `scale`) and encodes it as JPEG with a canvas, the way `shrinkPhoto` does. The exports then always get a cropped JPEG. A photo that can't be read is still left out without blocking the export.

**Acceptance tests:**
- The crop maths: x/y 50/50, zoom 1 on a 200×100 image gives the centred 100×100 square. Zoom 2 gives the centred 50×50. x 0 gives the left edge.
- A WebP photo reaches the PDF/Word builders as JPEG bytes.
- Canvas or decode failure: export continues without a photo.

**Out of scope:** changing what the page shows, the upload path.

## Task 6: Square or round photo, picked on My CV

---
files: [packages/shared/src/cv.ts, packages/shared/src/cv.test.ts, apps/web/src/cv/panel/PhotoField.tsx, apps/web/src/cv/panel/photo.test.tsx, apps/web/src/cv/page/CvPhoto.tsx, apps/web/src/cv/page/cv-document.test.tsx, apps/web/src/export/pdf.tsx, apps/web/src/export/pdf.test.tsx, apps/web/src/export/export-files.ts, apps/web/src/export/export-files.test.ts, apps/web/src/cv/panel/shrink-photo.ts, apps/web/src/cv/panel/shrink-photo.test.ts, apps/web/src/i18n/en.ts]
new_files: []
deps: false
size: 110
---

**Goal:** `basics.photo` gets an optional `shape: "square" | "round"`. A missing value means square, so existing CVs are unchanged and still parse. In `PhotoField`'s Editing state, a two-option choice "Square / Round" (`cv.photo.shape`, `cv.photo.square`, `cv.photo.round`) sets it via `onChange` (autosave like zoom). The saved photo on My CV, `CvPhoto` (the tailored CV and `CvDocument`), the PDF (border radius half the size) and the Word export all show it in that shape. For Word, the Task 5 crop step outputs a PNG with a circular transparent mask when the shape is round (JPEG stays for square).

**Acceptance tests:**
- Schema: a photo with `shape: "round"` parses. One without `shape` parses and is treated as square. `shape: "oval"` is rejected.
- PhotoField: choosing Round calls `onChange` with `shape: "round"`. The saved photo then has the round style.
- `CvPhoto`/`CvDocument`: a round photo renders with a 50% border radius, a square one without.
- PDF: the round photo's image style has `borderRadius` half its size.
- export-files: a round photo is cropped to a PNG (transparent corners). A square one stays JPEG.

**Out of scope:** other shapes, per-template shapes, the import draft (photos never enter it).
