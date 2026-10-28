# CV templates: implementation and authoring

The product registry contains the five selected designs: T01 Folio, T02 Meridian, T05 Signal, T06 Archive and T08 Monograph, all version2.1.0. The native **Șablon / Template** control changes the existing document preview immediately and uses normal autosave/history. Legacy documents keep the classic layout. A missing version displays an explicit classic fallback while retaining the saved reference and every content field.

**FOUNDATION delivery — end-to-end job tailoring/export PARTIAL:** the Base/review/enrichment preview is connected. Job-tailored selection/preview/export is a core acceptance requirement, but this base has no tailored-document editor/HTTP persistence/export path. The reusable renderer and typed document-presentation seam are implemented; end-to-end tailoring remains partial until the vacancy owner wires those paths below. No template change requests inference. Downloadable PDF export is not implemented by adding a stylesheet.

## Files and boundaries

- `packages/contracts/src/editor/model.ts`: the existing `BaseDraft` content projection and reusable `DocumentPresentation`; `presentation.templateVersionId` belongs to this document revision, not a global preference.
- `packages/contracts/src/editor/transport.ts`: strict optional-field validation and encode/decode. Version references use the canonical ID grammar, `^[a-z][a-z0-9_-]{1,79}$`; validation does not reject well-formed future versions simply because the current registry cannot render them.
- `apps/web/src/templates/registry.ts`: five immutable ID/version/name/style metadata entries, resolution and clone-only `chooseTemplate(draft, versionId)`. No career content or second CV schema.
- `apps/web/src/templates/TemplateChooser.tsx`: native localized selector; no extra Apply/confirmation step.
- `apps/web/src/templates/templates.css`: scoped common print foundation and selected design rules. Essential text has one normal-flow reading sequence.
- `apps/web/src/components/DocumentPreview.tsx`: the shared content renderer for editing/read-only inspection. It retains section order/visibility, field visibility, `currentWording`, safe rich contributions, dates and editing callbacks. It renders both skill categories as comma-separated inline text, with natural wrapping for long lists.
- `apps/web/src/App.tsx` and `components/Enrichment.tsx`: existing draft changes/autosave are reused; history inspection does not mutate an old version.

The existing database editor snapshot writer stores the versioned envelope as JSONB, so the optional presentation field requires no table/policy change. Canonical publication is a separate boundary: the forward migration `supabase/migrations/20261028050000_p6_templates.sql` replaces the shared `validate_canonical` rejection with an allowlist of the exact five registry version IDs while retaining legacy null and the existing schema, graph and deferred-prose checks. No template table is seeded and no new CV model is introduced. Unknown editor references remain roundtrippable/displayable, but canonical publication rejects unregistered references. API and client must share the updated codec. Checkpoints, history and restore retain the exact version reference. Canonical published CVs already have `document.templateVersionId`; that publication contract is distinct from the editor envelope.

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

Use `PhotoPreview` before the name for `photoPlacement: "above"`, or after the name inside the nameband. Hidden photos render no element and release header space. The selected CSS resets the legacy photo float/margin; the actual photo component owns crop math and mask classes. Only the portrait uses canvas; all essential CV text stays selectable HTML. Do not recreate crop calculations or a second photo schema. See [profile-photo.md](profile-photo.md) for upload limits, lifecycle and ownership rules. Authenticated production export must resolve the exact saved asset through that lifecycle; local print proofs do not implement that exporter.

## Required job-tailored wiring

Template selection must belong to the current tailored document/revision independently from Base and older tailored versions. Use the same executing `DocumentPreview` and chooser, passing that document's content and a callback that saves that document. `chooseTemplate(tailoredDraft, selectedVersionId)` preserves its summary, both skills and accepted experience wording; do not pass the latest Base draft or mutate a Base adapter. The shared `DocumentPresentation`/editor codec can carry that reference. This is a reusable seam, not a claim that the job screen already calls it.

Current missing paths are concrete:

1. `JobsScreen` captures/reviews vacancies and pins an editor snapshot; it has no tailored editor route. `App`/`base/routes.ts` need the independently loaded job-CV document view.
2. The Worker router and `db/supabase.ts` expose Base editor snapshots and vacancy context, not job-CV document load/save/history/export. The vacancy work must add authenticated, owner-scoped routes/gateway calls with existing Origin/CSRF/revision/replay rules.
3. Existing SQL `save_job_cv_checkpoint` persists a job-kind document/version. The foundation forward migration permits the five registered `p_layout.templateVersionId` choices through the shared canonical validator; grammar compatibility alone did not previously make non-null references publishable. `cv_versions.canonical_json.document` and `cv_documents.draft_payload` retain that per-document layout. However, the editor→confirmed profile/Base publication bridge is missing; do not send an unconfirmed editor envelope as canonical layout or invent its mapping. The chosen registry version ID fits the existing canonical ID grammar.
4. The future exporter must consume that exact saved tailored version and the same renderer/style. No production exporter exists here. Switching presentation must not regenerate tailoring or call an AI/provider.

The queued vacancy-owner handoff must connect independently loaded per-job content/revision, that document’s versioned template choice, the confirmed editor→canonical publication bridge and export of the exact saved version. Import validation belongs to the separate sibling lane. The owner approved “Publish foundation; complete wiring next (Recommended)”; PR title/body must describe FOUNDATION and keep end-to-end job tailoring/import/export explicitly PARTIAL. No production migration/activation is authorized here.

Until those are wired, report acceptance as PARTIAL rather than displaying an inactive tailored chooser. No generic job-only helper or second CV model substitutes for integration.

## Print and acceptance

Selected styles use A4 print margins, selectable native text, embedded local fonts, standard section headings, readable body size, associated role/date blocks and page-break rules. No essential text in images, tables, canvas, floating boxes, columns or skill bars. A nonessential optional portrait may share the name row. Several short samples use two pages; a universal one-page default is not promised.

Focused commands:

```sh
npm run test --workspace @resumora/web -- src/templates/templates.test.tsx src/base/http-adapter.test.ts
node --experimental-strip-types --test apps/api/tests/cv.test.mjs
npm run typecheck
npm run build --workspace @resumora/web
```

Before accepting a new layout, inspect its actual product-rendered document and PDF text extraction. Use an authorized synthetic document and the actual renderer/CSS/local fonts; a Python recreation is not proof of the product. Check names/titles, contact text, headings, employer/date association, contributions, education, optional sections, both languages, long content, font embedding and reading order. The current lab proof printed the real DOM/CSS with WeasyPrint and extracted it with pypdf; that is a test artifact, not a shipped export adapter or universal ATS certificate. Revalidate with the actual production export engine when one exists.

Acceptance checklist:

- Stable version ID/class; exactly selected product registry entries; legacy and unknown references preserve all content.
- Save/load/history/restore retain per-document choice; changing Base cannot overwrite a tailored choice.
- Current facts, ordering, hidden fields, accepted wording, safe rich contributions and modular sections survive.
- Independent RO/EN CV language; both skill categories remain comma-separated inline text.
- Actual saved photo visibility/shape/crop are honored; no-photo releases space.
- Native chooser and real preview work at1366×768 and390×844 with readable controls and no horizontal clipping.
- Actual renderer/export text, fonts, safe bounds, dates and multipage flow checked; no fabricated metrics or ATS score.
- Clearly distinguish active Base behavior, reusable tailored seam and missing job/export wiring; no paid inference for changing a template.

Canonical SQL verification uses `python3 scripts/db/test.py --suite templates` with PostgreSQL 16+ on PATH (or an explicitly supplied tool path). It executes the actual validator/profile/Base/job save and restore interfaces for all five choices, legacy null and invalid/unregistered references, plus focused existing permission/ownership/integrity checks. Migration inclusion in the disposable P0–P3 harness is explicit despite the reserved `p6_templates` filename. SQL acceptance/publication is unproven until that command passes; no hosted apply is implied.
