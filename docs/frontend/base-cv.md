# Base CV application slice · J05–J08

The React/Vite app now implements a local Base CV journey using the supplied Resumora design. Hosted Auth, Supabase, extraction, AI, job tailoring and export remain unconnected. No account or credentials are required for local review. Use synthetic data.

## Run and review

Use the pinned Node/npm versions from `.nvmrc` and `package.json`. From the repository root:

```sh
npm ci --ignore-scripts
npm run dev:web
```

Manually open **http://127.0.0.1:5173/** in the owner's `cosmin@emedi.ro` Chrome profile. `npm run dev` also starts the existing local Worker, but Base CV editing needs only the web app. Ctrl+C stops the command's own server. Do not run the smoke checks while the dev pair occupies its ports.

1. Create a Base CV → enter manually. Name is required for this **session checkpoint**; title slots, contacts and missing dates can remain empty. This is not a production export/access eligibility policy.
2. Edit fields and confirm each populated section. Add/reorder roles, skills, education, contributions and optional entries; change section order/visibility. Contact/address visibility affects only the preview. Hiding facts does not confirm or delete them. Dates allow year-only precision; an empty month stays unknown.
3. Review the exact user-authored summary separately and approve its wording. Check the final truth acknowledgment, then **Save in session**. Five qualitative checks offer next steps without a score.
4. Home → reopen the saved version. Edit/save another checkpoint; History → inspect/restore the earlier version with explicit confirmation. Restore creates a new version and retains the previous ones. Undo affects only the last draft action; reopening/restoring/replacing a dirty draft requires confirmation.
5. Improve → choose a role/question → answer → review → explicitly confirm. Append adds a contribution; Replace affects only the selected role's context. The answer is used verbatim with a source link. Skip/unknown adds no fact. Save the draft explicitly to retain the answer in a session version.
6. Start → explore Mara for the shared synthetic example. The responsibility from `claim_resp_a` is pending under the existing `extracted-before-confirmation` recipe. Its reference prose stays pending and is excluded from the document. Existing-document selection checks metadata only: no file bytes are read, uploaded, parsed or stored.
7. Switch RO/EN UI independently from CV language. CV language changes document headings/date formatting; text stays unchanged for separate manual review. Visit Jobs/Account to inspect truthful unavailable states; navigation/back retains the draft.

**Persistence boundary:** one adapter instance holds one Base document and cloned versions in page memory. Reloading/closing loses all of it, including “saved” versions. No browser storage, cookies, network writes, cloud sync or retention policy is implied. A reload warning is installed while the session contains data; browser support determines whether it is displayed. It is not durable storage or an offline promise.

## Code and replacement boundary

- `apps/web/src/base/model.ts` defines the editor projection. Source facts, source lineage, user-authored prose/approval, reference prose and presentation are distinct. Edited facts receive new local IDs and require confirmation again; stable field handles preserve input focus.
- `base/adapter.ts` exposes asynchronous load/history/save/restore. Memory operations clone across boundaries, check expected revisions, replay identical request IDs, reject changed replay bodies, avoid unchanged checkpoints and create new restore checkpoints. Conflicts/failures preserve the local draft; no hosted concurrency is claimed.
- `base/mara-review.ts` explicitly projects `schemas/cv/v1/fixtures/journey-mara-base1.json` and the review recipe. Names, titles, employers, dates and text come from those fixtures; absent fields stay empty. Source claim/evidence labels are fixture-scoped references, **never database UUID foreign keys**. Shared source claims have independently editable field handles. Tests compare projection values against the canonical fixture.
- This projection is **not a canonical serializer or a backend request payload**. A real adapter must validate/translate the canonical graph and UUID codec, server-derived identity/ownership, confirmations, revisions and request identity. The DB command contract was consulted read-only; no database, provider or backend contract/configuration was changed here.
- `base/dates.ts` adapts the existing prototype's month-index duration union with lower/upper bounds. Overlaps count once; unknown years and invalid intervals are excluded and reported. The session pins the displayed UTC as-of month. These are duration bounds, never inferred employment dates or exact tenure claims.
- `components/` contains native form controls, the editor, enrichment, review, preview and page views. Hash navigation retains drafts. Native modal dialogs supply focus containment/Escape; focus returns on close. Validation focuses its first affected field.

The app adapts update-2 `AppShell`, `ScrBase`, `ScrEnrich`, `Field` and `Button` patterns. Pine/sage/marigold tokens, spacing and type roles are adopted in `src/design/`; the supplied logo is a local SVG. Bricolage Grotesque, Figtree and Source Serif 4 are locked, locally served Fontsource dependencies (SIL OFL); Lucide is a locked React dependency (ISC and its included Feather MIT notices). License texts accompany the built assets under `public/licenses/`. The reference ZIP hash/member paths/sizes/types were verified before extracting selected members to task-private scratch. Archives and original references are unchanged. Production design/brand distribution approval remains outside this local implementation.

## Verification and limits

`npm run check` includes workspace types, browser-free React interaction/adapter tests (`npm run test:web`), the web build, the existing Worker dry-run bundle, HTTP smoke and development secret/file-serving regressions. CI consumes the same command. `npm run format:check --workspace @resumora/web` checks formatting. No test tool launches Chrome or Playwright.

Tests exercise blank entry, validation/focus and preserved input, confirmation resets, summary approval, optional contacts/entries, independent languages, dates/overlaps, ordering/visibility, answer review/skip/append/replace/stale targets, Undo, save/reopen/immutable restore, retries/conflicts/no-op/replay, and honest unavailable actions. Adapter tests do not establish hosted ownership or real server persistence.

**Observed local result (25 October 2026):** `npm run check` passed: workspace type checks, 14 behavior tests in two files, Vite web build, Worker dry-run bundle, HTTP smoke and the development secret/file-serving regression (1 test). Formatting and `git diff --check` passed. The exact `npm run dev:web` command was also started and its page, React entry/editor/adapter modules, logo and license served HTTP 200 on `127.0.0.1:5173`, with API port 8787 free; the task-owned server was stopped afterward. These are local results; pipeline review, PR and remote CI are separate.

No visual, mobile/zoom, screen-reader, native dialog focus-trap/Escape, or real-browser keyboard end-to-end result is claimed. The default AXI target was unavailable; Firstmate's existing Windows transport evidence did not conclusively bind CDP to the mandated profile. No website navigation or new browser was launched. jsdom polyfills modal opening only, not native modal behavior. Lavish was not run because no permitted real screenshot review was possible. An owner can manually review the actual app at the address above; these accessibility/visual checks remain a follow-up.
