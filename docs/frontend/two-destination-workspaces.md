# Two-destination workspaces

Implementation in source13, 31 October 2026. This supersedes the original proposal’s normal profile-replacement upload and automatic Profile publication of job clarification answers.

## Experience and resource identity

The primary navigation contains **My Profile** and **My Jobs**. The account menu contains account/session actions, interface language and extension links. Romanian labels follow the existing default interface language. CV language remains independent.

Profile uses one main accordion, initially collapsed, with previews and non-blocking missing-information/check indicators. Experience contains readable role cards with Edit, Improve this role and Questions and answers; the same content is no longer repeated below a separate editor disclosure. A resource URL opens one inline enrichment panel. Existing question planning, draft/confirmed answer states, unknown/skip actions, evidence and whole-role rewrite review are reused. Questions remain optional. Desktop retains the shared CV preview; mobile switches Edit/Preview while the same role/question remains mounted. Imports, explicit additive comparison, removal and history stay within Profile.

Jobs lists saved jobs and unfinished intake drafts. Each workspace keeps advert details, explicit factual review, proposals/current CV, job-scoped Q&A and appearance/language/export together. Create my CV uses the existing combined prepare operation; separate matching is secondary. An accepted document editor is mounted only after the owned job/locale current-document lookup returns an existing document. Viewing a proposal cannot create an accepted CV. Existing current documents remain independent by job and language.

Hash routes require no routing dependency:

- `#/profile`, `#/profile/enrich/:targetId`, `#/profile/import/:importId`, `#/profile/history`, `#/profile/cv/:locale`
- `#/jobs`, `#/jobs/new/:draftId`, `#/jobs/:jobId`, `#/jobs/:jobId/cv/:locale`
- Workspace sections use `?panel=details|cv|answers|appearance`.

Legacy `#base` opens the canonical Profile. Explicit URLs take precedence over the account-scoped last-workspace record. Owned lookups protect resource URLs; missing jobs, imports and roles explain the failure and return to their destination. Metadata resume records contain route identifiers, never CV text.

## Saving and recovery

`workspace/controller.ts` owns intermediate draft revisions, a 650 ms debounce and one immutable request/body at a time. Newer edits remain dirty until separately acknowledged. Unknown writes replay the same ID/body before sending newer edits. Conflicts require explicit resolution. A failed initial load cannot publish an empty default. `workspace/document-controller.ts` extracts the existing document save lifecycle; the account registry keeps unresolved resources alive across navigation and CSRF refresh. A persistent recovery indicator exposes hidden resource failures. Browser closure and sign-out warn about unsent edits; account retirement discards controllers and ignores late replies.

Mutable drafts are separate from confirmed job answers and validated career-operation results. Intake autosaves never fetch a URL, extract a document or invoke a model. Intake submission freezes one capture and replays to the same job even with a lost response. Import selection, vacancy review, proposal edits, clarification text and translation review have separate draft resources. Draft writes do not establish factual confirmation or proposal acceptance.

Translation/export flush the document and create a validated checkpoint as part of the explicit action. Missing fields lead back to their editor controls. Translation review saves intermediate wording and confirmation progress independently. A translation checkpoint refresh must not abort the operation it prepares. Session storage retains only source/request identifiers for an interrupted translation or career request; no CV, answer, provider output or credentials are persisted there. Recovery reads the owned existing operation and does not dispatch a replacement generation. A provider outcome that remains unknown is shown as unknown; saved results cannot reconstruct an unavailable provider response.

## Job-first answers and Profile integration

`POST /jobs/:id/workflow/clarify` now writes job-scoped answers, never Base. The dedicated answers API supports explicit confirmation/editing with revision checks. Confirmation receipts and workflow requests retain immutable replay bodies. Confirmed answers are copied into a virtual, pinned evidence context for that job’s generation; My Profile remains unchanged.

Profile integration selects confirmed answers and an existing stable role ID. The configured whole-role rewrite uses original eligible evidence, existing approved wording as style context, and the selected answer facts. Exact question wording is context, not evidence that an activity happened. Original questions, exact answers and job/answer/revision provenance accompany the proposed Profile draft. Before/after review is mandatory. Accepting the owned stored result checks the current Profile snapshot and job-answer revision and writes the Q&A plus approved wording in one database transaction. Rejection leaves Profile unchanged. Accepted independent job CVs are never silently rewritten.

Matching, claim, provider attempts, result publication and tailoring acceptance include confirmed-answer revision pins. Changing answers or source documents stales older work. Profile removal clears profile-linked drafts, job Q&A and career results; existing retention rules preserve accepted independent job CVs. A separate lifecycle-generation fence rejects even a delayed first draft write after removal and Profile recreation. Old request caches cannot restore removed content.

## Backend and database

Authenticated Worker routes use the existing Origin/CSRF and user-scoped gateway boundary:

- `GET/POST /v1/workspace-drafts/:kind/:id`, plus owned draft listing
- `POST /v1/jobs/intakes/:id/submit`
- `GET/POST /v1/jobs/:jobId/answers`
- `POST /v1/jobs/:jobId/profile-integrations`
- `GET /v1/intelligence/operations/:operationId`
- `POST /v1/jobs/:jobId/profile-integrations/:operationId/accept`
- Explicit integration rejection uses the owned operation reject action.

Draft kinds and payload keys are closed and validated. Storage tables are private with RLS enabled, no anonymous/authenticated direct table privileges, explicit RPC grants and tenant checks. Worker-only result publication additionally requires the existing worker secret. Previous implementation helpers are revoked. The draft GET includes lifecycle-generation metadata; profile-linked POSTs must echo it.

Locally tested migrations applied to the existing development project:

1. `20261030222355_p8_two_destination_workspaces.sql`
2. `20261030223639_p8_workspace_generation_fence.sql`

Migration filenames match hosted registered versions. Do not edit applied migrations; use an additive migration for later changes. Existing app services are preserved. No new provider, export infrastructure or model configuration was activated. Existing photo preservation and different-person upload safeguards remain in place.

## Verification and practical limits

The native PostgreSQL workspace suite covers ownership/grants, CAS conflicts, exact replay, pure drafts, once-only intake, job-only confirmation, stale in-flight results, atomic integration, idempotent acceptance and deletion/recreation fencing. The earlier Base-removal suite also passes. API checks use synthetic provider transports, including integration grounding and explicit acceptance. The full API suite passes 270 tests.

Frontend baseline failures were triaged: malformed optional language-context mocks, obsolete API/token-cap fixtures, changed copy and navigation expectations were distinguished from product defects. Field/save regression tests exercise the retained editor separately through a test harness; resource-shell journey tests exercise the actual App. Final frontend/API results are recorded below after the last verification run.

Fresh-profile Chrome previews use synthetic data and a separate temporary server/browser profile. They cover Profile, inline enrichment, Jobs and intake at desktop/mobile widths. They do not establish a walkthrough of the owner’s signed-in session or paid provider quality. Existing export availability remains governed by the configured renderer/validation infrastructure; this change does not activate unavailable export infrastructure. Unknown upstream outcomes remain explicit recovery states.

The broader SQL `--suite all` runner also invokes obsolete job-CV-history publication checks after that API was retired. It reports the same 12 `CURRENT_JOB_DOCUMENT_REQUIRED` failures in the working implementation and in an isolated, unchanged HEAD export (`315d8f6b657aa4341b92133662d03bcdcdc61d5e`). They are pre-existing runner/contract incompatibilities, not twelve established regressions from this change. This broad runner is therefore not reported as green. Current-schema focused checks pass: workspaces (5), Base removal (9), job workflow (9), current job documents (11), and photo metadata (2). Focused workflow/document checks now apply through P8 so they exercise the new wrappers. Local PostgreSQL uses private sockets with synthetic identities; no owner CV records are mutated by those checks.

Final verification: the full frontend run passed 471/471 checks; the subsequently added connected Profile-integration journey passed with the complete 11-case journey file. The API run passed 270/270. Frontend/API TypeScript checks, the web production build, the Worker dry-run build and `git diff --check` passed. Vite serves the new resource shell at the existing URL. Both existing services remain active with their original PIDs (web 2484200, API 2355042); health returns OK. No service was restarted. No commit or push was made for this implementation.

Hosted permission verification confirms RLS on all three new tables, no direct anonymous/authenticated reads, and zero exposed previous-implementation helpers. Security-advisor categories remain the same as before the migrations; no unrelated authentication configuration was changed.


## Live mobile browser checks — 2026-10-31

An isolated signed-in Chrome test at 390 × 844 verified Profile role-panel navigation, Edit/Preview preservation, server-acknowledged intake restoration after refresh, and one synthetic QA job submission. Profile remained at revision 168 with an unchanged content fingerprint; no job CV was accepted.

The live extraction initially failed despite a successful provider HTTP response: exact quotations had incorrect model-supplied character offsets. Job extraction now deterministically anchors only exact, uniquely occurring quotations before applying the existing strict validator. Missing/ambiguous quotations and unsupported claims still fail. Replaying the corrected extraction succeeded with six requirements. Known invalid output is classified separately from provider unavailability; diagnostics contain closed reason codes and token/status metadata, never document or provider-output text.

Mobile Edit/Preview controls now remain sticky below navigation, and document titles follow the active resource and CV language. A text-only intake now uses its extracted/reviewed job title in the workspace heading and browser title.

The combined matching/tailoring live check is **not passed**: its first match attempt was reserved but no final attempt/result was recorded, and the owned operation subsequently became unknown. No duplicate generation was dispatched. The UI explains an unknown result and the cost implications of a new request. Investigate background execution lifetime and durable dispatch before claiming a completed live tailoring journey. HTTP background work currently starts through `waitUntil`; Cloudflare documents a 30-second post-response lifetime at https://developers.cloudflare.com/workers/platform/limits/#duration. This is a plausible cause requiring a focused runtime reproduction, not a confirmed diagnosis.

The local preview wrapper also renders its development banner with the wrong character encoding and takes substantial mobile space. Its service configuration was left unchanged to preserve the running services.


## Playwright UX simplification pass — 2026-10-31

Installed the official Playwright MCP package (`@playwright/mcp` 0.0.83) and Playwright 1.64.1 outside the repository under `~/.local/lib/resumora-browser-audit`. Connected its MCP server to isolated Windows Chrome and verified a signed-in account. Browser session recording and code generation are disabled; credentials and browser auth state are not exported into test artifacts. Browser checks used 390 × 844 and 1440 × 1000 viewports, not physical-device testing.

Changes driven by the signed-in browser check:

- The Jobs screen could hide two valid saved jobs because `/v1/workspace-drafts` returned 503. The database gateway incorrectly applied its object-response fallback to the draft array. It now validates bounded typed draft lists and nullable owned-resource responses. Independent list loading keeps saved jobs usable when draft discovery fails or stalls; an explicit retry reloads lists without submitting an intake or generating content. No database schema or grant changes were necessary.
- Profile role actions appear immediately beneath their headings. Long wording has a four-line preview and an accessible expand/collapse control. The first live role card at phone width decreased from 1,213 px to 391 px; its first action moved from approximately 1,090 px to 95 px below the card top. Expanding restored the full wording. Edit/Preview switching preserved the active role panel.
- Job entry starts with one advert text area and a shorter explanation. Link entry remains available under a keyboard-accessible disclosure and automatically reopens for a restored link draft. Blank, untouched intake no longer claims to have been saved. No capture or inference is triggered by disclosure/navigation.
- Factual review initially shows essential and populated overview fields. The QA advert showed five fields instead of eighteen; Other job details revealed all eighteen. Existing values, requirements, evidence and explicit factual confirmation are retained.

Verification: 475 frontend and 274 API checks passed, including gateway array/null rejection boundaries and independent Jobs loading under failed or pending draft discovery. TypeScript passed. The saved Profile remained at revision 168 with its original fingerprint; no job CV was accepted or generated during this UX pass. Both existing app-service PIDs stayed unchanged.

The earlier live matching operation still has an unknown result. This UX pass does not certify complete live tailoring. The local preview wrapper's development banner/encoding remains an environment issue; its service configuration was not modified.


## CV import overview implementation — 2026-10-31

New first imports remain in the existing authenticated `import-review` workspace draft until the user explicitly chooses **Confirm and create My Profile**. Upload/extraction records and review edits can be durable without publishing Profile facts. The extracted draft is mapped once per review resource, restored from acknowledged storage, and checked against import ID/source hash. Confirmation flushes that same resource before opening the Profile document coordinator; failed saves, account retirement, navigation away and late responses cannot publish a Profile through the old component. Repeated clicks cannot create repeated start callbacks. No new database tables, grants, providers or migrations were introduced.

`ImportReview` now shows a complete readable overview, including confidently extracted fields. Role, identity, summary, skills and other source categories remain available together. A contextual attention list highlights specific warnings, unclear fields, personal website ownership and year-only periods without requiring invented months. One card can be edited at a time; original candidate quotations, lineage, manual corrections and uncertainty remain intact. Final confirmation explicitly covers all mapped information shown. Previously saved all-automatic imports keep their compatibility behavior and are not retroactively given false confirmation receipts. Removed entries stay absent; existing confirmation receipts remain valid for idempotent replay.

`ImportComparison` keeps first-import review and existing-Profile updates in one full-width reading surface. On every screen size, original-source rendering is deferred until the user selects View original CV or a contextual source link. A native modal opens above the review; Escape or Back to review restores focus without replacing the editor. After its first explicit opening, the verified source stays mounted in the closed modal so position and source selection survive reopening. Resizing never automatically opens or fetches the original. PDF bytes still pass the original source-hash check; geometry still comes from native PDF text or the existing local OCR fallback. No model-generated source rectangles are introduced.

Existing-Profile imports retain before/after selection, stable destination role identity, the different-person comparison/ownership requirement and additive updates. They now use the shared source pane and a counted Apply selected updates action. Leaving a ready review returns to uploads without silently deleting its saved source or publishing it.

Verification: 494 frontend checks passed, including separate initial staging, acknowledged edit restoration, save failure/replay, late-response cancellation, source selection, compound-name editing, removed facts and stale import responses. TypeScript, production web build and Worker dry run passed. Playwright checked the actual new component with a synthetic PDF at 390 × 844 and 1440 × 1000: zero Profile publications during review, one deferred source load, source-hash-verified PDF rendering/highlighting, retained edits across phone view switches, and no horizontal overflow. Existing app service PIDs stayed unchanged. Browser test fixtures did not create an account Profile or submit a paid AI request.

### Profile accordion and import categories

The Profile accordion is the main editing surface. All sections initially collapse; an explicit enrichment deep link opens its target section. Headers show a short value preview and a non-blocking filled-in, missing, needs-check or optional label. Experience contains approved role wording, derived duration, editing and one active enrichment panel. Additional experience enrichment stays inside its own section. Mobile Edit/Preview switching keeps the mounted editor and active role/question; filling missing details or answering optional questions is not required to tailor a CV.

Future import review shows item-level technical/professional proposals and proposed exclusions for unclear skills. Category changes are stored in the existing import-review draft separately from immutable extraction and explicit factual confirmation. Additive imports preserve saved Profile skills. Accepted independent job CVs discard the import-only choices together with import review metadata, while retaining the accepted skill content.

Browser verification used the served components with synthetic, in-memory data at 1440 × 1000 and 390 × 844. It checked initially collapsed sections, keyboard Enter/Space, inline question state, category correction and no horizontal overflow; the viewport was restored to desktop. The fixture did not write a Profile or request paid inference. Automated recovery tests also verify acknowledged classifications after refresh, unchanged source evidence and explicit publication.

### Role-by-role improvement and short introductions

My Profile now explains that the Base CV is reusable career information and confirmed context, while job CVs are independent adapted copies. Experience offers an optional review pass: open one role, request questions or wording explicitly, accept/reject proposals, and move to another role. Progress distinguishes current supported accepted wording from roles left for later in this pass. Skips are session UI state, not a claim that missing facts were supplied; accepted wording and Q&A keep their existing durable storage. Reopening a role never itself starts inference.

A role summary is distinct from the overall professional summary. It uses `POST /v1/intelligence/rewrite` with the closed optional `purpose: "summary"`, a role-only target and the existing owned snapshot/revision pins. The prompt requests one or two sentences, a single paragraph and at most 240 characters (an approximate two or three lines; wrapping depends on template and screen width). The response validator rejects longer/multiline/list-shaped proposals instead of truncating them. `RoleRewriteReview.purpose` separates pending summary and full-role proposals; immutable operation input and client recovery identifiers distinguish their outcomes. Acceptance changes presentation wording only. It keeps source facts, exact Q&A and contributions; when full-role wording already exists, it replaces its introduction while retaining later blocks. Questions remain context rather than factual proof.

The overall professional summary remains a separate final suggested step after reviewing the other Profile categories. This delivery does not automatically generate it or require users to finish enrichment before tailoring.

`editor/content.ts` parses plain career text into paragraph, unordered-list and ordered-list blocks without executing HTML. `RoleText` renders the same structure in proposal review, Profile, all templates and print, including self-contained accepted job CVs. Generated rewrites use real list lines only where useful; prose remains valid. The manual contribution editor starts with the same list structure as its default CV projection, while saved intentional paragraphs/ordered lists remain intact. In the editable preview, `RichContributions` preserves saved layout and independent fact IDs instead of converting every block into an unordered list or a single editable field. Original answer-to-CV associations and unrelated rich formatting remain independent of text edits.

Browser checks with synthetic in-memory data exercised separate summary/full-rewrite proposals, no publication before acceptance, retained contribution counts, role progression without extra inference, and desktop/390-pixel layouts without horizontal overflow. No account Profile writes or paid requests were made by the browser fixture.


### Simplified review, tags and guided role enrichment

Import review no longer reserves a right-hand pane for the uploaded CV. The extracted information and attention list are the main content. Confirmation still publishes only explicit selected facts/updates, and the source remains independently available in the on-demand overlay.

Skill classification uses compact technical/professional tag groups. Clicking a tag exposes its move action; the cross excludes it, with Undo. A measured three-row limit has a keyboard-accessible Show all control; overflow tags are actually hidden from focus until expanded. No empty removal category is displayed. Nonempty exclusions remain available through a small Review disclosure with restore actions. Choices retain their candidate/source association and durable review drafts. Rendered and exported CV skills use plain vertical-bar-separated text in every template.

The connected inline role panel is one guided surface: optional questions, one reviewed proposal, then Next role. The primary answer action explicitly confirms the answer; typing/autosaving alone does not. A proposal appears formatted once, with an optional wording editor replacing that view. Original wording, sources, regeneration, a short-introduction-only option, and saved Q&A are disclosed on demand. The existing legacy editor remains supported. The compact progress strip and role actions are disabled during active question/wording requests so a role switch cannot casually discard an in-flight result. The original request identity, source checks and explicit acceptance behavior are reused; no new provider, operation endpoint or database migration is introduced.

Default contribution edit targets remain independently editable inside the saved ordered/unordered/prose structure. Top alignment on multiline preview edit buttons keeps markers attached to the first text line rather than midway through a paragraph.
