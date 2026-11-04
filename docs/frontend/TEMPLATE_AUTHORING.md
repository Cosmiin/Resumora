# CV templates: implementation and authoring

The [product registry](../../apps/web/src/templates/registry.ts) owns the selected designs and immutable version IDs. The native **Șablon / Template** control changes the existing document preview immediately and uses normal autosave/history. Classic is a display fallback for legacy documents and unavailable versions, not a selectable design. An unavailable version displays an explicit fallback notice while retaining the saved reference and every content field.

Appearance uses the same accepted structured document and shared renderer for editor preview and searchable PDF output. No template change requests inference. Production PDF activation remains configuration-gated pending Browser Run resource, binding, privacy and budget approval; local synthetic proof does not authorize activation.

## Files and boundaries

- `packages/contracts/src/editor/model.ts`: the existing `BaseDraft` content projection and reusable `DocumentPresentation`; `presentation.templateVersionId` belongs to this document revision, not a global preference.
- `packages/contracts/src/editor/transport.ts`: strict optional-field validation and encode/decode. Version references use the canonical ID grammar, `^[a-z][a-z0-9_-]{1,79}$`; validation does not reject well-formed future versions simply because the current registry cannot render them.
- `apps/web/src/templates/registry.ts`: five immutable ID/version/name/style metadata entries, resolution and clone-only `chooseTemplate(draft, versionId)`. No career content or second CV schema.
- `apps/web/src/templates/TemplateChooser.tsx`: native localized selector; no extra Apply/confirmation step.
- `apps/web/src/templates/templates.css`: scoped common print foundation and selected design rules. Essential text has one normal-flow reading sequence.
- `apps/web/src/components/DocumentContent.tsx` (wrapped by `DocumentPreview.tsx`): the shared content renderer for editing/read-only inspection. It retains section order/visibility, field visibility, `currentWording`, safe rich contributions, dates and editing callbacks. It renders both skill categories as comma-separated inline text, with natural wrapping for long lists.
- `apps/web/src/App.tsx` and `components/Enrichment.tsx`: existing draft changes/autosave are reused; history inspection does not mutate an old version.

The existing database editor snapshot writer stores the versioned envelope as JSONB, so the optional presentation field requires no table/policy change. Canonical publication is a separate boundary owned by the [SQL API contract](../database/api.md#template-publication); the [migration inventory](../database/traceability.md#migration-order-and-table-coverage) records its forward correction. No template table is seeded and no new CV model is introduced. API and client must share the updated editor codec. Editor checkpoints, history and restore retain the exact version reference, including unknown versions; they do not publish canonical CVs.

## Add one selected template

Add an immutable entry to the registry only after selection. For example:

```ts
{
  id: "T09",
  version: "1.0.0",
  versionId: "template_margin_1_0_0",
  name: "Margin",
  className: "template-margin-1-0-0",
  entry: "stacked",
  photoPlacement: "nameband",
  description: {
    ro: "Ierarhie discretă, cu antet serif.",
    en: "Quiet hierarchy with a serif identity.",
  },
}
```

Extend the canonical validator allowlist in a new forward migration with the same registered version ID, and extend the actual canonical publication tests in `supabase/tests/templates.py`. Never edit an applied migration or admit arbitrary well-formed editor references into publication.

Add coordinated CSS, scoped to its class:

```css
.document.document-template.template-margin-1-0-0 h2 {
  font-family: var(--font-document);
  font-size: 29pt;
}
.document.document-template.template-margin-1-0-0 h3 {
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 1.5mm;
}
```

Reuse section primitives. `entry: "stacked"` separates the role/qualification from its employer/institution; `compact` places them in one heading. Either retains primary→secondary→dates→contributions reading order. Build a coherent header/contact/profile/entry/spacing system; a color change alone is not another template. Never add names, placeholder achievements or metrics to CSS/metadata.

Skills remain one comma-separated native text run per professional/technical category. Do not reintroduce vertical skill lists, rating bars, pills or forced breaks. A long real list may wrap at the page boundary; do not clip or shrink it to force one physical line.

The chooser lists registry entries automatically. Use a new `versionId` and a new style class for any layout-affecting update; retain the old registry/style when historical reproduction is supported. Never point an old ID at a different stylesheet. If a version is unavailable, retain the stored choice and content, show the fallback notice, and let the user explicitly select a replacement. Do not auto-upgrade history or rewrite a missing ID.

## Content, optional sections and localization

Facts, accepted wording and presentation stay separate. Switching a template clones the current document and changes only `presentation.templateVersionId`; it must not reset summary, skills, role context, contribution formatting, sources, saved answers, hidden fields or photo settings. Render accepted wording through `currentWording`, including its source/visibility validity checks. Preserve existing sanitized rich text and original-source editing.

Optional projects/certifications/languages/volunteering/custom entries use the existing shared renderer and selected type/spacing. Empty sections remain omitted; authored custom labels and order remain intact. Do not invent dates or proficiency. Structured partial dates keep their precision, and missing dates stay unknown.

Interface copy uses `useCopy`; the CV uses `draft.language`, `sectionName` and existing date helpers. Changing a template does not translate user text or change the CV locale. Keep Romanian diacritics and long user names readable.

Fonts are the existing locally bundled `@fontsource-variable` Figtree, Bricolage Grotesque and Source Serif4 packages imported in `styles.css`. Their existing OFL files are under `apps/web/public/licenses/`. Reuse the bundle and licenses; no CDN, screenshot text, external avatar or new font download is needed. Layout CSS was authored for this project. Scout/unselected/archive sources are not product assets.

## Photo seam

The renderer uses the existing `PhotoPreview` and shared typed `CvPhoto` contract (`packages/contracts/src/editor/photo.ts`). The saved asset ID, normalized crop, `visible` setting and circle/square mask remain separate from template choice. `PhotoEditor` saves through the current App draft; its latest-document merge preserves a concurrently selected template. `PhotoContext` resolves private bytes through the authenticated photo client rather than storing URLs in the CV.

Use `PhotoPreview` before the name for `photoPlacement: "above"`, or after the name inside the nameband. Hidden photos render no element and release header space. The selected CSS resets the legacy photo float/margin; the actual photo component owns crop math and mask classes. Only the portrait uses canvas; all essential CV text stays selectable HTML. Do not recreate crop calculations or a second photo schema. See [profile-photo.md](profile-photo.md) for upload limits, lifecycle and ownership rules. The export endpoint resolves the exact saved asset through that lifecycle, verifies readiness, and repeats source checks after rendering. An unavailable or deleted visible portrait blocks export rather than silently omitting it.

## Current document and export boundary

Template selection belongs to the accepted Base CV or its language version. Reuse `chooseTemplate`, the editor save path and `DocumentPresentation`. Language copies retain independent history and presentation.

`AppearanceExport` offers the existing five choices, photo visibility and zoom. Appearance changes first save through the editor; preparing PDF requires a settled accepted checkpoint. `POST /v1/exports/pdf` accepts only an owned source pin (Base snapshot/revision/optional language variant). It does not accept client HTML, remote resource URLs or another copy of CV content. It reloads accepted content and photo bytes, renders `DocumentContent` with the same template CSS/local fonts, and rechecks the source after asynchronous work. Contacts retain safe hyperlinks. All essential content remains native text.

`build-print.mjs` produces the ignored Worker renderer/parser assets; it is an API prebuild/pretest step. The configured Browser Run session denies external resource requests, waits for fonts/photo, checks overflow and prints A4. Actual PDF bytes are checked for parseability, embedded fonts/ToUnicode (including vector Type3 fonts), page geometry, text completeness/order/diacritics, bounds and links. The client validates the returned bytes and echoed source pin before presenting the same Blob in its PDF preview and named download. Validation failure retains the saved CV and consumes no AI credit. The HTML preview is continuous; prepared PDF preview supplies actual pages and browser PDF navigation. Font/density/accent/paper-size controls beyond current template defaults are not exposed.

Activation requires approved production Browser Run capacity/binding `PDF_BROWSER` and `PDF_EXPORT_ENABLED=on`, plus the existing authenticated Worker configuration. Neither resource creation nor hosted activation is performed by this implementation. With configuration off, the product reports export unavailable and offers no fake download. DOCX, extra locales and RTL remain later scope.

## Print and acceptance

Selected styles use A4 print margins, selectable native text, embedded local fonts, standard section headings, readable body size, associated role/date blocks and page-break rules. No essential text in images, tables, canvas, floating boxes, columns or skill bars. A nonessential optional portrait may share the name row. Several short samples use two pages; a universal one-page default is not promised.

Focused commands:

```sh
npm run test --workspace @resumora/web -- src/templates/templates.test.tsx src/base/http-adapter.test.ts
node --experimental-strip-types --test apps/api/tests/cv.test.mjs
npm run typecheck
npm run build --workspace @resumora/web
```

Before accepting a new layout, inspect its actual product-rendered document and PDF text extraction. Use an authorized synthetic document and the actual renderer/CSS/local fonts; a Python recreation is not proof of the product. Check names/titles, contact text, headings, employer/date association, contributions, education, optional sections, both languages, long content, font embedding and reading order. `scripts/export-proof.mjs` exercises the actual export endpoint/shared SSR/Chrome/PDF.js/native validation path against synthetic localhost data. It covers all five templates, RO/EN, short and multipage content, photo on/off, Unicode/links/order/fonts/bounds, and source deletion during rendering. It requires the explicitly approved isolated local browser; it never authorizes hosted rendering or proves universal ATS compatibility.

Acceptance checklist:

- Stable version ID/class; exactly selected product registry entries; legacy and unknown references preserve all content.
- Save/load/history/restore retain per-document choice; language copies keep their own presentation.
- Current facts, ordering, hidden fields, accepted wording, safe rich contributions and modular sections survive.
- Independent RO/EN CV language; both skill categories remain comma-separated inline text.
- Actual saved photo visibility/shape/crop are honored; no-photo releases space.
- Native chooser and real preview work at1366×768 and390×844 with readable controls and no horizontal clipping.
- Actual renderer/export text, fonts, safe bounds, dates and multipage flow checked; no fabricated metrics or ATS score.
- Distinguish implemented local byte validation from pending production Browser Run activation; no paid inference for changing a template.

Canonical SQL verification uses `python3 scripts/db/test.py --suite templates` with PostgreSQL 16+ on PATH (or an explicitly supplied tool path). It executes the actual validator/profile/Base save and restore interfaces for all five choices, legacy null and invalid/unregistered references, plus focused existing permission/ownership/integrity checks. Migration inclusion in the disposable P0–P3 harness is explicit despite the reserved `p6_templates` filename. SQL acceptance/publication is unproven until that command passes; no hosted apply is implied.
