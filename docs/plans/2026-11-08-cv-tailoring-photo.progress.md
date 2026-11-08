# CV tailoring — photo side lane progress (Task 26)

Branch `rebuild/tailor-photo`, worktree `resumora-tailor-photo`, cut from `rebuild/tailor-score` at `278aa6d`. Not pushed.

## Task 26: Photo in the Base CV header — done (Tailoring S3 · Side · Task 26)
commit: 851961f · codex: build 01a1bbe9-fdad-7881-a02e-b3b4cbbdc0fb, review 01a1bc07-d125-74b2-86d1-464ce67476ad · codex tokens: see cost line · fix rounds: 2 scope/decision rounds (Codex's open questions) + 2 review rounds · guard denials: 1
open: deleting removed or replaced photo files from storage (see Open)

## Task 26b: Photo in the DOCX and PDF exports (optional) — done (Tailoring S3 · Side · Task 26)
commit: 89ff04a · codex: build 01a1bc0a-0038-7b82-b4cd-548da6f1c2fd, review 01a1bc0f-b1f2-7a73-b5f4-66a21d2066af · fix rounds: 0 · guard denials: 0
open: no caller passes photo bytes yet (ExportMenu, Task 24/25 remainders); WebP is skipped

## Whole-branch review (Tailoring S3 · Side · Task 26)
- Review 1 (01a1bc10-…) was given only the Task 26 brief, so it flagged the 26b export changes as out of scope. That was a briefing mistake, not a bug; it still counts as 1 of 2.
- Review 2 (01a1bc12-7d24-7240-b739-fc3e39d4b016, combined 26 + 26b brief): one finding. An upload that finishes after a History restore overwrote the restored photo. Fixed in 3c48595 (2 fix rounds; the first fix compared object identity, which dropped uploads during a drag, so it now compares the photo path).
- Decision: fix-only review (01a1bc1a-8a00-75e1-8abd-ed09724e7049, pass). The fix stays inside `PhotoField.tsx` and its test, with no shared type, schema, migration or RLS change.
- Tests: PASS 1606. Local stack: only `20261108030000_cv_photos.sql` applied (`supabase migration up`), no reset.

## Rulings (Tailoring S3 · Side · Task 26)
- **Templates:** Classic and Modern have `showsPhoto: true`, Compact `false` (decided by Tailoring 00; undo by flipping the flag in `templates.ts`). The Base CV editor (`Editor.tsx`) renders `CvDocument` with no template, so it uses the default Classic and shows the photo. The import preview uses Classic too, but an import never has a photo.
- **Never sent to AI:** a Codex scout (01a1bbe8-…) found no API prompt builder that sends the whole `basics` or the whole CV; they all pick named fields. The one leak path was the import's `emptyDraft()`, built from `emptyCv().basics`, which gained `photo`. `packages/shared/src/imports.ts` now strips it. `ImportDraftSchema.basics` is its own strict shape without `photo`, so the model can't receive or return one. **Later parts (tailoring prompts) must keep picking named fields and never spread `basics`.**
- **No storage deletes from the editor:** Remove and replace only change the CV field and never delete the stored file. Deleting before autosave succeeds broke the photo after a version conflict plus "Load latest" (Astra, high). Leftover files stay private to their owner.
- **Late uploads:** an upload result applies only if `PhotoField` is still mounted and the photo path it started from is still current (a drag keeps the path; a restore or Remove changes it).
- **Export:** both builders take caller-supplied bytes (`photo?: { data, type }`) and draw JPEG/PNG scaled to fit about 96 px, without zoom/x/y cropping. WebP is skipped in both.
- **CvDocument:** the header uses `display: flow-root`, so the floated photo never spills beside the next section.
- Owner DB steps: added "Photo, Task 26" to `resumora/docs/superpowers/plans/2026-11-08-tailoring-db-steps.md`. It goes out together with the code that uses it.

## Files outside the plan's Task 26 list
`apps/web/src/cv/edit/cvReducer.ts` (photo through autosave), `apps/web/src/cv/edit/sections/HeaderEdit.tsx`, `apps/web/src/cv/page/cv-document.test.tsx`, `apps/web/src/cv/page/templates.ts` + `templates.test.tsx` (showsPhoto flags), `packages/shared/src/imports.ts` + `imports.test.ts` (strip photo from the AI draft), and for 26b `apps/web/src/export/docx.ts`, `docx.test.ts`, `pdf.tsx`, `pdf.test.tsx`. `apps/web/src/i18n/en.ts` gained photo keys (possible merge spot next to the template label keys).

## Open
- Delete orphaned photo files: after a successful save, or on account deletion.
- ExportMenu must fetch the photo bytes (signed URL, then fetch) and pass them to `buildCvDocx` / `buildCvPdf`.
- WebP in exports (convert to PNG in the browser first), and zoom/position cropping in exports.
- Manual browser check of upload, drag and zoom in the real app (only unit tests ran).

## Cost
Codex tokens: about 11.1M across 12 sessions (highest cumulative count per session, mostly cached; the build session alone is 8.1M after 6 resumes). Guard denials: 1 (my heredoc that wrote the brief named `apps/` paths; rewritten with Write).
