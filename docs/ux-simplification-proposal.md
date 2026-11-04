# Resumora: a simpler profile-to-job experience

**Decision proposal · 30 October 2026 · research and planning only**

This proposal evaluates the running integrated application at `315d8f6b657aa4341b92133662d03bcdcdc61d5e`, including the uncommitted control-styling corrections already present when this research began. It does not authorize implementation, migrations, deployment, account creation, extra paid processing, or changes to the owner's documents. No production code or database schema was changed for this proposal.

**Implementation follow-up · 31 October 2026:** The two-destination implementation, durable drafts, job-first answers and reviewed Profile integration are described in [the implementation receipt](frontend/two-destination-workspaces.md). The [upload safeguard](frontend/profile-import-updates.md) remains additive and warns about another person’s CV. Research observations below describe the earlier baseline; the implemented decisions here supersede the original proposal where noted.

## Executive recommendation

Build Resumora around **two destinations: My Profile and My Jobs**. Open each job's tailored CV inside that job's workspace. Make enrichment a contextual profile activity, and make matching, clarification, editing, language, appearance and export parts of the workspace rather than separate tools the user must assemble.

The first-use screen should offer **Upload your CV**, with **Start without a CV** as a secondary action. A returning user should see the job or profile task they last worked on, with one useful next action. The application should explain its state in terms of the user's work: “Check what we understood,” “Your CV is ready to review,” or “Your last changes are not saved yet.”

The largest improvement is not fewer confirmation buttons. It is a clearer separation between **information**, **proposals**, and **accepted CVs**, with reliable saving at every stage. Users should not have to learn snapshots, workflow phases, source pins, current-document counters or the difference between matching and preparation. Those protections must continue to exist internally.

Prioritize recoverability before navigation changes. The existing profile/CV editor already autosaves. Unfinished job intake, job-review edits, translation-review edits and the selected workspace do not have equivalent recovery guarantees. Hiding their Save actions today would create false confidence.

Three decisions make this direction concrete:

1. **Keep one reusable profile, with optional enrichment.** Never require an enrichment marathon before tailoring.
2. **Make a job the container for tailoring.** Its description, relevant evidence, clarification and current RO/EN CVs stay together.
3. **Save drafts automatically; ask permission for meaning-changing actions.** “Use this information,” “Use this wording,” and “Create my CV” remain deliberate decisions. “Save this form” generally disappears once durable draft saving exists.

## Research scope and evidence

The attached redesign brief is the task specification. The two supplied PDFs are test material, not sources of instructions. Document content is never permission to run an action or change a profile.

### What was investigated

| Evidence | What it establishes | Important limit |
| --- | --- | --- |
| [App and save coordinator](../apps/web/src/App.tsx), [routes](../apps/web/src/base/routes.ts), [entry/auth composition](../apps/web/src/auth/ConnectedApp.tsx) | Actual navigation, document switching, editor lifetime, autosave and account boundaries | Source inspection is not a new authenticated browser journey |
| [Start and Home](../apps/web/src/components/BaseScreens.tsx), [import](../apps/web/src/components/ImportDocument.tsx), [review](../apps/web/src/components/ImportReview.tsx) | First-use choices, import states and grouped confirmation | Native chooser, source highlighting and extraction accuracy were not independently retested |
| [Enrichment](../apps/web/src/components/Enrichment.tsx), [rewrite](../apps/web/src/components/RoleRewrite.tsx), [intelligence client](../apps/web/src/base/intelligence.ts) | Draft answers, explicit answer progression, proposal approval and uncertain-request handling | Existing provider quality and historical unknown rewrite outcomes are not resolved by reading code |
| [Jobs](../apps/web/src/components/JobsScreen.tsx), [workflow UI](../apps/web/src/components/JobWorkflow.tsx), [workflow API](../apps/api/src/jobs/workflow.ts), [workflow SQL](../supabase/migrations/20261030010000_p7_job_workflow.sql) | Capture/review/match/prepare/accept responsibilities and local versus durable state | Installed extension and arbitrary live job sites were not exercised |
| [Base transport](../apps/web/src/base/http-adapter.ts), [job adapter](../apps/web/src/base/job-adapter.ts), [language adapter](../apps/web/src/languages/adapter.ts) | Revision checking, request replay and independent current job documents | Backend availability is distinct from transport contracts |
| [Language versions](../apps/web/src/languages/LanguageVersions.tsx), [translation review](../apps/web/src/languages/TranslationReview.tsx), [language client](../apps/web/src/languages/client.ts) | Language selection, manual review drafts and explicit section confirmation | Broad linguistic quality remains unmeasured |
| [Appearance/export](../apps/web/src/export/AppearanceExport.tsx), [template registry](../apps/web/src/templates/registry.ts), [photo guide](frontend/profile-photo.md) | Shared rendering, selected-source export and photo lifecycle | Hosted PDF rendering remains unavailable in the current runtime |
| [Product requirements](product/prd.md), [journeys](product/customer-journeys.md), [current job contract](setup/job-workflow.md), [action budgets](frontend/action-budgets.md) | Product intent, prior decisions and existing measured component paths | Discovery-era tailored history is superseded by the current-only job contract |
| Existing frontend verification from the preceding control audit | 95 focused checks passed; full run: 393 passed, 38 failed. The same 38 failures reproduced in the untouched baseline's six affected files | These are reused results, not a fresh redesign regression campaign or 38 independently established product bugs |
| New local checks of the supplied PDFs | The actual `preflightPdf` accepts a 67,711-byte, two-page CV and a 25,014-byte, one-page non-CV PDF structurally | Structural acceptance does not establish semantic CV admission or extraction quality; zero provider calls in these checks |
| Read-only metadata for the user's subsequently uploaded PDF | Latest import reached `ready`, admission `cv`, 84 candidates, no recorded import error. Its review was autosaved with zero confirmed candidates | Recorded size differs from the supplied CV attachment. Do not equate this upload with that exact test file or infer extraction correctness |

The user authorized live AI tests of both supplied PDFs. The desktop-control bridge failed before attachment to the WSL session (`sandboxCwd is not a local file URI`). No agent-initiated live import was submitted. The owner subsequently uploaded a CV; its saved metadata was checked read-only. The negative PDF's live classification remains **unverified**. No medical values, extracted personal content, credentials, original bytes or private request identifiers are included here.

The same browser-access limitation prevents claiming a new visual inspection of the owner's current review screen. Earlier desktop/narrow-layout checks used synthetic data. Live import testing in the existing account must account for the active-profile transition described in issue B08 below; lack of confirmation does not mean that the imported draft has not been autosaved.

## A. Current UX assessment

### A1. The application is organized around implementation slices

There are eight hash-route values: `home`, `start`, `base`, `review`, `enrich`, `history`, `jobs`, and `account`. Five destinations appear in the main navigation: Home, Base CV, Improve, Jobs and Account. Import/review, history and appearance/export add further modes. Selecting a job or language changes the active adapter, remounts the editor and still uses the Base route. The user therefore sees a similar editor while its saving destination changes materially.

This creates conceptual work before useful work. A newcomer must understand “Base CV,” improvement, saved versions, job workflow, job CVs and independent language copies. A returning user reaches a general Home screen rather than a specific unfinished application task. Account currently includes a preparation placeholder; its prominence exceeds the work available there.

The concepts themselves are useful internally. Their placement is the problem. Profile evidence and accepted job wording must remain independent, but that does not require two disconnected editing systems in the user's mental model.

### A2. Actual journeys and friction

| Journey | Current implementation | Friction or opportunity |
| --- | --- | --- |
| First CV | Home → Start chooser → existing-document action → import → grouped source review → editor | A user who already has a CV repeatedly declares that intention. The manual-first chooser gives equal prominence to a less likely path without evidence that this is the best default |
| Understand extraction | Grouped review, editable candidates, selected source evidence, then confirmation | Valuable provenance is available, but the review can feel like reconstructing the entire CV. The observed live import has 84 candidates; these are grouped, **not 84 mandatory clicks** |
| Add missing experience | Separate Improve route → target selection → questions/answers → proposal → accept | Users must distinguish a saved answer, confirmed information and approved CV wording. The label “Save and next” obscures that typing already autosaves the draft answer |
| Tailor to a job | Jobs → save intake or import URL → review vacancy → save corrections → prepare → select proposals → save job CV → open job CV | Source capture, review, preparation and acceptance are explicit, but the UI exposes their orchestration. A separate Match action is available; it is **not mandatory**, because `prepare` already chains matching into tailoring |
| Refine a tailored CV | Reuse the editor in job mode; return to Base is guarded while writes are unresolved | Safety is appropriate, but the workspace identity lives in React state, while the URL still resembles the Base editor |
| Translate | Choose language → generate → edit section → confirm/next → final acceptance → independent representation | Draft translation edits are component-local until confirmation. Language control is distributed across the header and document-language area |
| Export | Appearance/export → template/zoom/preview → prepare PDF when configured | Preview, presentation settings and download are grouped reasonably, but real PDF rendering is currently unavailable. A redesigned button cannot close that capability gap |
| Return after interruption | Durable profile/current CV can reload; selected job context and several intermediate forms cannot reliably resume | A saved document is not the same as a restored working context. “Saved” is too broad when only some visible work is durable |

### A3. Preserve existing strengths

Retain provenance and grouped confirmation, optional enrichment, independent current CVs per job/language, selective proposal acceptance, stale-input checks, revision conflicts, exact request replay, old-photo preservation and private original-source access. Reuse the existing shared renderer, five template candidates, partial-date precision, visibility controls, undo and accepted translation lineage.

The current action-budget guide already documents substantial editor simplification. Its measured full manual-CV path is 14 clicks, 15 Tabs and one paste after choosing manual entry; it does not meet a strict fewer-than-25-all-inputs target. Those are historical synthetic component measurements, not timings for this proposal. More cosmetic compression will not remove the remaining cross-screen orchestration.

### A4. Exposed technical complexity

Prominent version counters, separate “Match” and “Prepare” actions, independent representation warnings, raw operation-state labels and error keys make the user interpret the backend. Keep technical diagnostics available under “What happened?” or support details. Lead with whether the user's work is saved, what changed, and the one useful recovery action.

Do not hide a genuine unknown outcome. Replace unexplained codes with plain-language status; retain the request reference in a disclosure. “We are checking whether this finished” is different from “It failed—generate again.”

## B. Proposed product experience

### B1. First use: one useful starting point

The empty Profile screen asks “Do you already have a CV?” through one prominent **Upload your CV** action and a secondary **Start without a CV** link. Explain formats, content processing and the next step briefly before submission. Do not ask for a template, complete contact details, subscription decisions or a career goal before there is material to work with.

Upload creates a resumable import task. Show a small sequence: **Reading → Check information → Profile ready**. The progress reflects actual server states, not a timer. If the file is not a CV, show a generic explanation and a way to choose another file or continue manually. Do not describe or display unrelated medical information.

The review opens as a **draft import**, visually separate from the accepted profile. Start with identity and the experience outline. Display extracted facts as readable cards, with editable exceptions and source access on demand. Preserve clear confirmation boundaries: a shorter review is not permission to silently attest every extracted field. “Review later” keeps that material pending; unconfirmed facts cannot become verified tailoring evidence.

For an existing profile, show an ownership warning and an explicit additive comparison. A CV belonging to another person must not be merged into the user’s profile. Require confirmation that it is their CV and explicit selection of updates and destination roles. Do not offer a normal **Replace my profile** upload. Import completion alone never publishes changes to an existing profile.

### B2. A reusable profile that improves progressively

The Profile is a readable professional record, not an enormous onboarding form. Show experience, skills, education and optional sections with direct inline editing. Keep source details, historical checkpoints, visibility and structural controls behind relevant actions.

Recommend one useful improvement at a time: “Your most recent role describes responsibilities but little impact. Two short questions could help.” Explain why the answer matters. Offer **Answer**, **Not now**, and **I don't know** without penalties or misleading completion scores.

Typing saves an answer draft. **Use this information** marks the intended factual contribution; it does not silently replace CV prose. If rewriting would help, show the proposed wording and require approval. Returning later resumes the same target/question with existing answers, rather than regenerating a questionnaire.

Do not promote numerical achievements, tools or seniority from implications. An honest qualitative result is preferable to an invented metric. Questions should help the person remember their work, not pressure them into an impressive-looking claim.

### B3. A job becomes the working context

The primary action for someone with a usable profile is **Tailor my CV for a job**. A single intake surface accepts a URL or pasted description, with a reliable paste fallback when the URL cannot be retrieved. The editable draft is autosaved before the user proceeds.

Show a compact job review: role, employer, location/eligibility and the most consequential requirements. Offer “See all requirements” for exact categories, priority and evidence. Missing values remain “Not stated.” Keep the required review before matching/tailoring; simplify its presentation rather than removing its truth boundary.

Confirmed clarification answers belong to the job first and can support its tailoring without changing My Profile. Optional **Improve this role in My Profile** selects confirmed answers and an existing role, requests a whole-role rewrite, then shows before/after review. Acceptance saves the original questions, answers, provenance and approved wording atomically. Later edits never silently synchronize between these resources.

After **Create my CV**, reuse the existing `prepare` orchestration for matching and tailoring. Keep the job workspace open while it runs. Persist the operation identity and show the current phase in ordinary language. If clarification would help, ask at most a small contextual set with a clear “Continue without this” option when valid generation remains possible.

### B4. Preview immediately; accept deliberately

Display the generated CV as a **proposal**, with a concise explanation of what was emphasized and any material limitations. The current accepted CV remains intact until approval. Users can accept the whole reviewed proposal or inspect section-level differences; the existing selective acceptance remains available.

Once accepted, manual edits autosave to that job/language's current document. A visible document label always identifies the job and language. Profile edits are a separate destination; a job-specific wording change never silently modifies the profile.

Within the same workspace: select a section to edit, ask for a bounded improvement, open the job's requirements, change appearance, choose a language, and export. “Explain why this fits” opens supporting evidence and gaps, not a second analysis dashboard with unexplained percentages.

### B5. Returning is a first-class journey

Opening a job link restores that job and language, with its accepted CV, pending proposal and durable draft edits. A last-worked-on shortcut can suggest a location after sign-in, but the URL identifies the resource. If it is unavailable, return to Jobs with an explanation rather than silently opening another CV.

Present one current CV per job and language, as the implementation already does. “Previous applications” means other saved job workspaces; it does not promise old revisions of a tailored CV. Profile history remains available separately.

## C. Simplified information architecture and alternatives

### C1. Concepts considered

| Concept | How it works | Advantages | Drawbacks | Assessment |
| --- | --- | --- | --- | --- |
| Guided wizard | A single sequence: upload, review, enrich, add job, generate, export | Strong first-use direction; little navigation to learn | Returning users must jump around a first-use model; enrichment can feel compulsory; multiple simultaneous jobs fit poorly; a failed late step can appear to invalidate earlier progress | Use its clear short steps inside first import, not as the entire product |
| Conversation-first assistant | A central conversation gathers documents, asks questions and generates CVs | Natural clarification; low initial form density; supports vague requests | Hard to compare structured facts, know what was saved, target a particular job/language, correct source errors or recover an operation; long chats bury decisions and can repeat questions | Use conversation-like questioning contextually, not as the authoritative record or global navigation |
| Two destinations with job workspaces | Profile holds reusable information; Jobs holds each job and its CV workspace | Clear ownership, strong returning/multiple-job flows, direct URLs, progressive disclosure, compatibility with existing persistence | Requires state/routing work and disciplined workspace identity; the profile/proposal distinction must be taught briefly | **Recommended** |

The proposed three-destination model is close, but a globally navigable “CV Workspace” is ambiguous without a selected job. Make the workspace a child of a job. The Base/profile preview remains an action within Profile.

### C2. Navigation and ownership

```text
Profile                          Jobs
  Professional information        Saved jobs and resume cards
  Optional contextual questions    Add a job
  Profile CV preview               Job workspace
  Source review and history          Job review / relevant evidence
                                     Current CV: RO | EN
Avatar menu                          Pending proposal / section review
  Account and sign out               Appearance and export
  Data/privacy actions
```

Use structured hash routes initially, such as `#/profile`, `#/jobs` and `#/jobs/:jobId/cv/:locale`, so the local serving architecture does not need a new router dependency. Preserve old hash links with explicit redirects to the corresponding destination or contextual panel. Validate ownership and locale on every load; a URL is not authorization.

Do not call the Jobs destination “Applications” yet. The current implementation does not deliver a complete sent/interview/application tracker, despite older schema and discovery material. That name can be introduced when those journeys are implemented and verified.

## D. Screen-by-screen recommendations

| Surface | Purpose and visible content | Primary action | Remove, merge or relocate | Transition and automatic saving |
| --- | --- | --- | --- | --- |
| Empty Profile | Upload invitation, manual alternative, short privacy/processing explanation | Upload your CV | Remove the separate generic Home and Start choice loop; keep a synthetic example behind a secondary link | Upload opens resumable import; manual entry creates an owned profile draft |
| Import review | Readable extracted outline, uncertainty markers, inline corrections, source on demand, document-language choice | Confirm this information | Collapse technical source diagnostics; consolidate navigation, not factual approval | Each review draft edit persists independently of the accepted profile; confirmed groups commit through existing provenance checks |
| Profile | Career overview, direct edit, one optional improvement suggestion, saved status | Tailor my CV for a job | Merge Improve into contextual cards; move history and advanced structure into secondary actions | Profile changes and answer drafts autosave; “Use this information” is a semantic decision |
| Jobs | Recently worked jobs, title/employer/language, honest next step and saved status | Tailor my CV for a job | Remove competition between intake and an unrelated empty preview; hide raw workflow states and duplicate metadata | Open an existing workspace or autosave a new intake draft |
| Job intake/review | One URL-or-text input, retrieved source, essential facts and material requirements | Create my CV after review | Collapse requirement taxonomy, keep it editable; do not ask the user to choose a pipeline stage | Raw intake and review draft save separately; approval pins the reviewed revision before `prepare` |
| Job CV workspace | Job/language identity, CV preview, pending differences, brief relevant evidence, optional clarification | Review proposal, then Export when usable | Merge matching, refinement and export; place controls next to the selected section | Accepted manual edits autosave; generated proposals save as proposals and never overwrite accepted content before approval |
| Appearance/language panel | Existing template thumbnails, photo visibility, document language and translated-copy state | Return to CV; export when configured | Move zoom to preview controls; keep interface language in account/preferences | Appearance changes use the existing CV autosave; translation draft edits need durable draft saving before confirmation buttons are removed |
| Recovery panel | Which changes are saved, which are still local, last acknowledgment, specific next action | Retry the same save or resolve conflict | Put request references and technical codes in details; avoid multiple competing retry buttons | Preserve local edits, reconcile unknown writes and never start a fresh paid request implicitly |
| Account menu | Sign out and implemented account controls | Context-dependent | Remove the prominent preparation-placeholder destination; keep privacy/data actions discoverable when available | Sign-out must disclose unresolved private drafts and clear any account-scoped recovery material |

Desktop should keep preview and editing in one context, with only one persistent primary action area. Mobile should prioritize the active task, with explicit Edit/Preview switching and a compact sticky save-state indicator. Do not compress full-page CV text until it becomes unreadable. Preserve labels, keyboard focus, touch targets and reduced-motion behavior.

## E. Seven user scenarios and journey comparisons

These are source-derived task comparisons and proposed targets, **not measured usability-study results**. A gate means an explicit decision/action excluding typing, file-chooser interactions, corrections, sign-in, wait time and operating-system steps. The current “Match” button is excluded from the shortest path because `prepare` can already do both match and tailoring.

| Scenario | Current shortest coherent journey and avoidable work | Proposed journey | Target reduction or benefit |
| --- | --- | --- | --- |
| 1. Existing CV, first use | Home → Start → choose existing document → import/review → editor → Jobs → intake/review → prepare/accept → job editor/export. Review and correction amounts vary with the source | Empty Profile upload → resumable review → Add job → reviewed workspace → proposal → accepted CV/export | Remove the separate Home/Start decision loop and the handoff from workflow output to a different editor context; retain review gates |
| 2. Incomplete CV | Import/review → editor → Improve → choose target → questions → proposal; user may believe this is required before Jobs | Review sufficient profile information → choose Tailor now or improve one suggested area → job workspace | **Zero mandatory enrichment questions** before tailoring when a truthful CV is possible; no claim that every incomplete input can generate usable output |
| 3. Returning user, new job | In the existing Jobs screen: save intake, save reviewed corrections, prepare, accept/save proposed CV, open job CV: **five intent gates** before normal editing, plus optional Match and navigation | Open intake, review job, create CV, accept proposal in the already-open workspace: **three intent gates** (Review job, Create CV, Use this version), with raw draft autosave | Target 5 → 3 intent gates, a 40% reduction in this defined subset. It combines intake persistence with the review transition and removes Open CV; it does not remove truthful approval or guarantee export availability |
| 4. Multiple positions | Reopen Jobs, select another capture, repeat workflow, reopen editor; question/target context is separate | Jobs cards reopen the specific workspace; reuse confirmed profile answers and existing evidence; ask only for genuinely missing context | One card opens the right current job/language; no repeated profile import or questionnaire reset |
| 5. Improve an existing tailored CV | Find job → open current CV → edit; matching, optional clarification and language actions may require returning to other modes | Open its workspace → select section → edit or request a bounded change → review difference | Manual edits require **zero save clicks**; a new AI proposal still requires generation intent and acceptance. Template change is one contextual panel action, not a restart |
| 6. Add a new achievement | Navigate Improve or editor, select the correct role, distinguish answer context from visible prose, later revisit Jobs | Profile role card → add/answer → confirm intended factual information → optional wording suggestion | Save once as reusable information. Existing accepted job CVs remain unchanged; offer an explicit “Review improvements for this job” later |
| 7. Interrupted editing | Durable editor changes can resume after acknowledgment. Unsubmitted intake, pending local review edits and selected job identity do not have the same guarantee | Reopen resource URL → restore acknowledged draft/proposal → show exact unsaved/recovery state | **Zero manual save clicks for normal drafts** and a recoverable workspace. Offline edits must not be promised recoverable after browser closure until the storage/privacy design is approved |

New-user research should measure time to first usable profile, time to first reviewed job CV, wrong-document edits, uncertainty about saving, abandonment during review and unnecessary repeated questions. Do not optimize a click counter by hiding vital evidence or automatically accepting claims.

## F. AI interaction strategy

### F1. One assistant, bounded responsibilities

| Situation | Appropriate behavior | User control and persistence |
| --- | --- | --- |
| Upload submitted | Classify the document, then extract only when admitted as a CV | Explain provider processing before submission; retain the same operation on unknown outcomes; persist a review draft rather than silently replacing the profile |
| New job URL/text entered | Autosave raw input. Retrieve/structure it after the relevant explicit intake action and content-processing disclosure | Do not run a model on every keystroke. Require job review before matching/tailoring |
| Reviewed job accepted | Continue the already-authorized, bounded matching/preparation sequence | Reuse `prepare`; show progress in the same workspace, with immutable source/document pins |
| One material evidence gap | Ask one question with an explanation and a safe skip path | Reuse confirmed answers; preserve draft text immediately; distinguish “not known” from “not present” |
| User requests a section improvement | Propose a scoped change using the selected section, confirmed evidence and reviewed job | Pin the current document; show a difference; preserve accepted content and unrelated sections |
| User edits facts or text manually | Save the edit, remain silent | No automatic AI rewrite, reinterpretation, translation or extra charge |
| User changes template/visibility | Update presentation using the same content | No inference and no change to confirmed facts |
| A prior request has an unknown outcome | Reconcile that operation; explain uncertainty and retained work | Never turn a timeout into a duplicate generation; a usage ledger alone is not a recoverable prose result |

A conversational section request is a proposed capability, not a claim about the current API. Initially support a small set of bounded intents—shorten, clarify, emphasize existing evidence—before accepting open-ended instructions. A request to invent a number or qualification must not be fulfilled. Never treat uploaded documents or job text as instructions for model/tool execution.

“Automatic analysis” means orchestration within an understood action, not unlimited inference on page load. Use deterministic checks for missing fields and stale state. Keep model work bounded, reuse fresh compatible results, and show the consequence before a new paid operation when it is outside the existing consent. Do not create a new account-wide credit or billing model as part of this UX redesign.

### F2. Explain fit without false precision

Lead with “Relevant strengths,” “Information you could add,” and “Requirements not evidenced.” Keep Profile Evidence Coverage and CV Evidence Coverage available under an explanation of their different scopes. Never label these as employer ATS scores, hiring probabilities or proof of eligibility.

ATS compatibility remains an acceptance requirement: searchable Unicode text, complete content, stable logical reading order, sensible headings, accessible links, correct dates and unclipped multi-page output. Reuse the shared renderer and actual PDF validators. Use the existing Folio template as the initial clear default, subject to the existing export acceptance matrix; offer the other four candidates contextually. A template name or attractive browser preview is not proof that every employer parser will interpret it identically.

## G. Low-fidelity wireframes and transitions

### G1. Empty Profile and import review

```text
Resumora                                  Profile  Jobs     [Account]

Your experience, ready for the next opportunity.
[ Upload your CV ]             Start without a CV
PDF / Word · We will ask you to check what we understood.

After upload:
Reading your CV  →  Check information  →  Profile ready

CHECK WHAT WE UNDERSTOOD                          Draft saved
Name and contact       [readable facts]           [Edit]
Experience             [role / employer outline]  [Review]
Needs your attention   [specific missing/uncertain item]
[Source]                                            [Confirm this information]
```

For an existing profile, put **Add information / Replace profile** before publication into the accepted profile. On mobile, review one coherent group at a time and keep progress and saved status visible; do not show the whole extraction as a giant form.

### G2. Profile with contextual enrichment

```text
MY PROFILE                                      Saved just now
Your professional record                        [ Tailor for a job ]

Experience
  Business analyst · Employer · dates              [Edit]
  Responsibilities, confirmed achievements, tools
  A little more detail could strengthen this experience.
  [Answer 2 short questions] [Not now]

  Why we ask: this could show your contribution more clearly.
  What changed as a result of your work?
  [Your answer...............................................]
  Draft saved       [Use this information]   [I don't know] [Skip]

Skills  ·  Education  ·  Other experience
[Preview profile CV]                    [Sources and history]
```

Use a small contextual exchange rather than a global chat transcript. Show the relationship between the answer, confirmed information and any proposed CV wording. Do not imply that two questions are always enough or precompute paid questions just to populate a card.

### G3. Jobs and focused workspace

```text
MY JOBS
[ Tailor my CV for a job ]
Job / employer             Current CV         Next step
Analyst / Example Co.      English            Continue editing
Coordinator / Example Co.  Romanian           Review proposal

JOB WORKSPACE: Analyst · Example Co. · English
[Back to Jobs]                          Saved just now   [Export]

Job and evidence           CV preview / selected section
  Relevant strengths         Name / professional title
  1 optional question        Experience...
  [Review job]               [Edit] [Improve this section]

Pending change: shorter wording for this role
  Before | Proposed | Why it changed
  [Use this wording] [Keep current wording]

[Appearance] [Language]                [Details / source / diagnostics]
```

Mobile uses a persistent job/language heading and explicit **CV / Job details** switching. Section editing opens a focused sheet or in-place editor with a clear return to preview. Preserve drafts when the sheet closes; a sheet's lifecycle must not become a data-storage boundary.

### G4. Saving and recovery

```text
Normal:       Saved just now
Typing:       Saving…
Disconnected: Your last saved version is safe. 3 changes are still on this device.
              Keep this page open. [Try saving again] [Recovery details]
Conflict:     This CV changed elsewhere. Your edits are still here.
              [Compare changes] [Keep editing]
Unknown AI:   We are checking whether your earlier request finished.
              Your current CV is unchanged. [Check request] [Details]
```

“On this device” must be replaced with “in this open page” until persistent local recovery is implemented. Avoid claiming a browser refresh will recover work that only exists in React memory.

## H. Implementation roadmap

Relative complexity is an architectural estimate, not a committed schedule. Each phase requires its own implementation scope and acceptance. No phase is executed by this document.

| Phase | Deliverable | UX gain | Complexity / dependencies / risk | Exit criteria |
| --- | --- | --- | --- | --- |
| 0. Establish a trustworthy baseline | Triage the 38 baseline test failures; define confirmed versus suspected defects; specify draft/accepted boundaries and safe real-document test isolation | Avoid redesigning around misleading success/failure evidence | Medium; input validation and test mocks; high risk if import/profile publication semantics remain ambiguous | Valid-response tests green; malformed optional-language data cannot erase the editor; reimport publication contract agreed |
| 1. Recovery before simplification | Durable intake/review drafts, stable resource URLs, acknowledged-save state, same-operation recovery and resume context | Makes autosave-first promises defensible | Medium–high; a small number of draft commands/contracts and possibly additive fields; privacy decision for any persistent local outbox | Refresh/reopen restores each acknowledged draft; failures preserve text; account/deletion fences tested |
| 2. Consolidate the shell | Two navigation destinations; contextual enrichment; job workspace with existing editor, matching explanation, language and appearance | Largest reduction in concept switching | Medium; routing/view composition, existing adapters; regression risk around remounts and focus | Seven scenarios traverse the correct resources; old links redirect; no wrong-document saves; desktop/mobile keyboard paths pass |
| 3. Progressive assistant | Prioritized optional questions, reusable confirmed answers, scoped improvement requests, unified proposal review | Better profile depth without exhausting onboarding | Medium–high; context contracts, result recovery, bounded provider evaluation | No repeated answered questions without changed context; no fabricated claims; no implicit paid retry; original/accepted text preserved |
| 4. Finish export and acceptance | Approved hosted renderer configuration, real export bytes, template/language/photo matrix and bounded owner acceptance | Closes the actual apply-ready journey | High operational dependency; resource/privacy/budget approval; no implied activation | Searchable complete PDFs, measured resource limits and truthful failure UX; no claim of universal ATS success |

Quick wins after implementation approval: revise labels, establish one primary action per state, move history/diagnostics into secondary disclosures, use the existing direct `prepare` path, make job/language identity unmistakable and show accurate save scope. These can precede new draft APIs, but **removing explicit save/confirm actions must wait for the relevant durable draft support**.

Defer broader application tracking, billing, new document formats, a universal chatbot, global job scraping, and a new career graph. They do not solve the immediate profile-to-reviewed-CV journey.

## I. Technical implications

### I1. Reuse the existing foundations

Keep React, the shared contracts, Worker authentication/Origin/CSRF boundary, user-token database gateway, Supabase RLS, current job workflow leases and the shared screen/PDF renderer. Continue using stable source/claim/section identities. Do not introduce a second career-facts database or copy a CV into a chat transcript as the new source of truth.

Initially present “My Profile” as a projection of the existing working profile/editor aggregate and its sources/answers. A new label is not sufficient reason to migrate all canonical tables or split the existing payload into a speculative platform architecture.

Separate screen composition from the save coordinator. One shell identifies the active resource; profile and job workspaces use the appropriate existing adapter. A persistent heading and structured route carry the job and locale. Do not use a remembered React boolean as the authority for where a save will go.

### I2. Required contract changes

| Area | Existing capability to reuse | Proposed change or gap |
| --- | --- | --- |
| Profile/current CV editing | Revisioned save, replay keys, Base history, current job+locale writes | Extract a reusable coordinator/view-state interface; retain semantic approval separately from draft saving |
| Import draft review | Durable import session and source/extraction, grouped confirmation, atomic confirmed review save | Add a revisioned review-draft command scoped to the import. Store mutable corrections separately from immutable extraction in the existing session aggregate. Do not autosave the import into the accepted profile before the chosen add/replace decision |
| Job intake | Captured source receipts and saved jobs | Add an editable owner-scoped intake-draft command with draft revision. Prefer the existing job/draft aggregate; freeze an immutable capture on submission. Do not mutate accepted source receipts to simulate autosave |
| Vacancy review/tailoring review | Durable reviewed vacancy, operations and explicit accepted-current command | Add draft persistence for unconfirmed manual review and proposal edits; keep reviewed input and accepted current content distinct |
| Translation review | Existing proposal `review` command and review revision | Save manual draft values independently of section confirmation; persist last section and recover proposal identity. Editing must clear confirmation as today |
| Resume | Existing document/job identities | Structured routes first; an optional owner-scoped last-workspace preference contains resource IDs/locale, not raw documents or credentials |
| Unknown career request | Existing operation/attempt identity and cost ledger | Add authenticated read/status/result recovery with retention and source pins; persist validated results if not already retained. Usage rows are not a substitute for recoverable output |
| Conversational section changes | Existing scoped tailor and rewrite boundaries | Add a constrained instruction contract only after the current scoped operations and their authorization are mapped; arbitrary text cannot be silently added to an existing endpoint |

Exact additive columns/RPCs require a focused schema review during implementation. The UX requirement is definite: each editable draft needs a durable owner, resource identity, revision and recoverable value. An existing immutable receipt or accepted document must not be repurposed as a mutable draft merely to avoid a migration.

### I3. Invariants across the redesign

Continue account and session-generation fences, exact Origin/CSRF checks, tenant ownership, confirmed-source rules, immutable upload/checksum/finalize, optimistic concurrency and deletion-generation protection. Hidden fields remain stored presentation content. Removed Base context must not survive as a reusable hidden archive inside retained current job documents. Retained current job CVs remain independently editable after Base removal.

Keep one current tailored CV per job and RO/EN locale. Adding a general workspace history panel would contradict the current contract and require a separate product/data-retention decision. Profile history and independent jobs already satisfy much of the need to return to previous work.

## J. Autosave-first architecture

### J1. What already works, and what does not

`CvEditor` debounces draft saves by 650 ms. It snapshots the submitted draft with an expected revision and stable request ID, serializes writes, preserves newer in-page edits and stops on conflicts/errors. Autosave can retain incomplete profile drafts; explicit checkpoints run stronger validation. The HTTP job adapter uses the same coordinator but stores a self-contained current document per job/language. Enrichment text/choices update the profile draft and therefore participate in that autosave.

Important limits: the pending operation and newer unsent text live in page memory; `beforeunload` is a warning, not a durable outbox. The generic memory adapter explicitly loses everything on reload. Job intake and several review edits use component state. Translation values reach the server on section confirmation, not every edit. The selected job/language workspace is not encoded in the current hash route.

### J2. A resource-scoped saving model

Every editable surface should declare a resource key such as `(account, profile)`, `(account, job, locale)`, `(account, import, review-draft)`, or `(account, translation-proposal, review-draft)`. Its coordinator owns:

1. The last server-acknowledged value/revision and the latest local edit generation.
2. One in-flight write with an immutable request ID/body and expected revision.
3. Coalescing of newer edits into the next write, without changing the in-flight body.
4. A save state: loading, saved, dirty, saving, offline-unsaved, conflict, session-blocked or outcome-unknown.
5. A route-independent lifetime and an explicit account/document disposal policy.

Reuse the existing 650 ms editor debounce initially, rather than creating inconsistent delays. Prefer an immediate scheduled flush at a meaningful transition, but do not rely on unload requests to guarantee completion. Draft saving never invokes inference.

Only show **Saved** for the acknowledged generation of the resource currently being edited. A successful save of an older generation while the user keeps typing must not announce that the newer text is safe. Display a low-noise live status; avoid announcing every keystroke to assistive technology.

### J3. Failure and concurrency behavior

| Condition | Required behavior |
| --- | --- |
| Ordinary transient read failure | Bounded backoff with a visible useful state; preserve the current draft |
| Save response lost | Reconcile or replay the **same request and body**; retain new edits for a subsequent write |
| Revision conflict | Keep the user's text, retrieve the relevant current state and offer a focused comparison; never choose timestamp-wins |
| Session/account changes | Pause the old account's writes and discard late cross-account responses; verify the session before resuming |
| Deleted/replaced source | Respect deletion generation and ownership; never revive content through a late autosave or AI response |
| Unknown model outcome | Preserve operation identity and current accepted CV; use a status/result route when available, not a new generation |
| Navigation within the app | Preserve the active draft coordinator or restore its durable draft; a view unmount must not discard unsent input invisibly |
| Browser closure while offline | Be honest about what is only in the open page; do not claim recoverability the application cannot provide |

Retries of writes and retries of paid model work are different policies. A draft-save retry may repeat an identical idempotent request. A new provider attempt must remain explicitly authorized and accounted for. Background continuation of an already authorized durable task is not permission to create an unrelated replacement operation.

### J4. Local recovery is a deliberate privacy decision

For the first implementation, guarantee restoration of **server-acknowledged** drafts and show unresolved changes clearly. Do not add plaintext personal documents or medical files to browser storage as an incidental UX fix.

If recovery after closing an offline browser is a release requirement, design an account-scoped recoverable outbox with an explicit threat model, retention, encryption/key handling, sign-out behavior, shared-device behavior and deletion rules. Do not assume that saying “encrypted IndexedDB” solves key recovery or account separation. That work is a product/privacy dependency, not a small front-end trick.

Until then, the truthful promise is: **“Your saved work is safe. We will tell you when changes have not reached your account.”** It is impossible to guarantee delivery of a keystroke that never leaves a terminated, disconnected device.

### J5. Save versus approval

Remove the sticky **Save now** action from the normal path only after equivalent recovery and checkpoint needs are satisfied. Keep deliberate actions for factual confirmation, proposal acceptance, destructive replacement, restoration and generation. Rename them for their consequences. An optional “Create a checkpoint” can remain under Profile history; do not make it a prerequisite for every edit.

Autosave draft answers without declaring them confirmed. Save unreviewed generated proposals without replacing current content. Save edits to an accepted job CV without modifying the reusable profile. These distinctions are the foundation of a simpler interface, not exceptions to autosave.

## K. Bug and technical issues register

The register distinguishes confirmed behavior, synthetic robustness failures, capability gaps and hypotheses. No issue below was fixed as part of this research task. Earlier implemented corrections are explicitly marked as such.

### B01 — Unsubmitted job intake is not a durable draft

**Location:** `JobsScreen.tsx`; conditional Jobs rendering in `App.tsx`. **Severity:** High against the proposed interruption requirement. **Description:** Text/URL values and the pending request body live in component state/refs; leaving the route unmounts that state. A submitted job is durable, but unsent input is not. **Reproduction:** Type an advert without submitting, leave Jobs and return, or reload. **Evidence:** `useState("")` inputs, conditional route mounting and absence of an intake-draft write. **Recommendation:** Add an owned revisioned intake draft and preserve its coordinator through navigation. **Confidence:** Source-confirmed lifetime/persistence gap; no new owner-account destructive reproduction was attempted.

### B02 — Manual job-review and proposal edits are local until explicit actions

**Location:** `JobWorkflow.tsx` (`review`, `reviewDirty`, `decisions`). **Severity:** High. **Description:** Corrections/proposal text can disappear when the panel is recreated before Save corrections/acceptance. This must not be presented as already autosaved. **Reproduction:** Edit a reviewed requirement or proposed section, leave/reload before the explicit command, then reopen. **Evidence:** Component-local values and writes only through `post('review', …)` or `saveTailor()`. **Recommendation:** Save review drafts separately from reviewed-source and accepted-current state. **Confidence:** Confirmed source behavior; exact owner browser interruption remains untested.

### B03 — Translation edit saving is tied to confirmation

**Location:** `TranslationReview.tsx`. **Severity:** High for interruption recovery. **Description:** Textarea changes update local `values` and clear section confirmation; `client.review` runs on Confirm. Unconfirmed work is not yet a durable review draft. **Reproduction:** Edit translation text, reload before confirming the section. **Evidence:** `setValues` in `onChange`, server write in `confirm()`, existing targeted translation tests. **Recommendation:** Introduce draft-review autosave while preserving explicit confirmation and expected review revision. **Confidence:** Confirmed code/contract boundary; not proof that confirmed reviews are lost.

### B04 — The URL does not identify the selected tailored workspace

**Location:** `App.tsx`, `base/routes.ts`, `base/job-adapter.ts`. **Severity:** High potential wrong-context confusion; actual mis-save not observed. **Description:** Job/language selection is in React state; the editor hash is still `base`. Reload cannot reconstruct that selection from the URL. **Reproduction:** Open a current job CV, reload and inspect which document is selected. **Evidence:** `useState(null)` for job/language, adapter switching and `window.location.hash = 'base'`. **Recommendation:** Encode owned job and locale in structured routes and restore by resource identity. **Confidence:** Confirmed route/state gap; no claim of cross-document data corruption.

### B05 — Unknown career rewrites have no result-recovery route

**Location:** `RoleRewrite.tsx`, `base/intelligence.ts`, intelligence routes. **Severity:** High. **Description:** The client safely fences duplicate requests, but an older unknown result cannot be recovered through a career status/result endpoint. The user can be left uncertain about output and cost. **Reproduction:** Lose the response after a rewrite may have been submitted; return to the same context. **Evidence:** Existing uncertainty handling and documented historical unresolved owner request; current dispatcher lacks a recovery endpoint. **Recommendation:** Persist/retrieve validated operation results under owner authorization and source pins. **Confidence:** Confirmed capability gap; historical request outcome remains unknown and was not retried.

### B06 — Malformed language-context success responses can crash the editor

**Location:** `LanguageVersions.tsx:74`, `languages/client.ts`. **Severity:** High robustness issue. **Description:** A successful response is cast to a contract without runtime validation; `context?.versions.find` throws if a non-null context lacks `versions`. **Reproduction:** Supply HTTP 200 with an invalid language-context shape in the existing connected-account harness. **Evidence:** `TypeError: Cannot read properties of undefined (reading 'find')` in the preceding full run and the same baseline reproduction. **Recommendation:** Validate transport shape and render optional language features as unavailable while preserving the editor. **Confidence:** Confirmed synthetic failure; no evidence that the current hosted endpoint is returning this malformed shape to the owner.

### B07 — Pending-save recovery does not survive every page loss

**Location:** `App.tsx` (`pendingWrite`, `latest`, `beforeunload`), memory adapter. **Severity:** High under the requested “leave at any moment” vision. **Description:** Unknown write identity/newer unsent edits are page-memory state; browser closure is not a guaranteed recovery mechanism. **Reproduction:** Disconnect, edit, then terminate/reload the page before acknowledgment. **Evidence:** Ref-based pending coordinator; memory adapter explicitly excludes persistent browser storage. **Recommendation:** Resource-scoped durable drafts first; decide a private recoverable outbox separately. **Confidence:** Confirmed design limit; no experiment discarded the owner's unsaved work. Successfully acknowledged durable saves are not alleged to be lost.

### B08 — Import review can become the active autosaved profile before confirmation

**Location:** `ImportDocument.tsx` → `start(importedDraft(...))`, `App.tsx` → `openDraft`/autosave, CV save route. **Severity:** High product-boundary concern for reimport. **Description:** Ready extraction automatically opens an editable imported draft. Confirmation is separate from draft persistence; a clean existing editor is not protected by the dirty-draft replacement dialog. **Reproduction:** In an isolated account with a clean saved profile, complete another import without confirming candidates; inspect the current draft and history. **Evidence:** In the owner's new import, read-only metadata showed `ready`, 84 candidates and a matching autosaved draft with zero confirmed candidates. **Recommendation:** Persist import review separately and require explicit additive selection with ownership confirmation. **Confidence:** The pre-confirmation autosave transition is observed. Whether it violates the intended reimport policy requires a product decision; prior checkpoints remain, and no deletion/corruption is claimed.

### B09 — Interface language and imported document language are easy to confuse

**Location:** `importedDraft()`/`blankDraft()`, header locale controls, career context. **Severity:** Medium. **Description:** Imports start from the default RO draft; changing interface labels does not change the saved CV language used for questions/rewrite. **Reproduction:** Import an English CV into the default draft while the UI is English and inspect the saved document language. **Evidence:** Current source policy and earlier receipts; the new autosaved import is recorded as `ro`, without establishing its source language. **Recommendation:** Show a document-language choice during review; propose a confirmed detected-language default, with one explicit choice if uncertain. **Confidence:** Confirmed policy/UX mismatch risk, not proof that a particular English source was mistranslated.

### B10 — Export is unavailable in the current runtime

**Location:** Appearance/export and Worker Browser Run binding. **Severity:** High to the complete apply-ready journey. **Description:** Shared rendering/validation exists, but hosted PDF capability is not activated. **Reproduction:** Open export in the current development runtime; capability is unavailable. **Evidence:** Existing runtime banner/configuration and handover; reused synthetic PDF matrix is not hosted activation. **Recommendation:** Keep an honest unavailable state and separately approve resource/privacy/budget configuration plus a bounded synthetic hosted canary. **Confidence:** Confirmed capability gap; not an export-layout diagnosis.

### B11 — Full frontend baseline is not green

**Location:** Six existing connected-account/import test files. **Severity:** High release-confidence issue. **Description:** The preceding full run had 393 passes, 38 failures and 14 reported runtime errors. The same 38 failed tests reproduced on the untouched baseline (41 passed in those six files). Some mocks lack the language-context contract; a ConnectedApp assertion also expects one transport call where the UI now loads another resource. **Reproduction:** Run the existing suite against either source snapshot; inspect individual failures. **Evidence:** Retained test results from the immediately preceding control audit; representative `.find` crash. **Recommendation:** Triage contract drift separately from real behavior defects, repair mocks only when they contradict valid contracts, then establish a trustworthy regression baseline. **Confidence:** Confirmed test failures; they must not be reported as 38 proven production bugs or as a redesign regression.

### B12 — Capture and historical incident limits

**Location:** Extension integration, photo storage, long-text controls. **Severity:** Medium–High depending on the chosen release scope. **Description:** The extension package exists but current capture activation/installed auth/live-site acceptance remain unverified. The earlier photo read failure was traced to missing metadata-preflight permission and corrected by approved migration `20261030200803`; end-to-end owner success/reopen was not independently tested by this research. Earlier raw-control styling defects were corrected before the proposal, with synthetic desktop/narrow-layout checks. **Reproduction/evidence:** Existing capture/configuration handover; photo guide and migration; preceding control audit. **Recommendation:** Keep extension optional with paste fallback; validate the bounded photo journey separately; do not reopen resolved styling issues as new defects. **Confidence:** Confirmed setup/evidence limits, with the photo policy incident resolved at its demonstrated boundary.

## L. Critical trade-offs and acceptance decisions

| Simplification | What could be lost | How to preserve it |
| --- | --- | --- |
| Two destinations | Discoverability of advanced tools | Contextual source/history/appearance actions with consistent placement; test users finding them without instruction |
| Shorter import review | Factual accuracy, name/date precision, informed confirmation | Group facts, prioritize uncertainty and expose originals; leave skipped facts unconfirmed; retain reviewed provenance |
| Contextual enrichment | Broad career discovery beyond one job | A profile-level improvement backlog and optional open-ended “Add something else”; never make one vacancy the only definition of someone's experience |
| One primary create-CV action | Cost predictability and visibility of matching | Disclose bounded processing, preserve explicit review, reuse `prepare`, show progress and explain evidence/gaps |
| Autosave | User confidence about accepted versus draft content; private local data | Separate draft saving from approval, expose acknowledgment accurately and decide local recovery privacy before implementation |
| Immediate preview | Confusion between a proposal and the accepted CV | Persistent “Proposal” status, an explicit acceptance action and protection of the existing current document |
| No tailored-history UI | Expectation of restoring every old job revision | Explain one current CV per job/language; keep other jobs and profile history; a new archival/history promise is a separate decision |
| Cleaner template selection | Overstated ATS compatibility | Reuse actual reading-order/text validators and preserve a simple default; do not promise employer-specific parsing or hiring outcomes |

### Decisions requested before implementation

Approve the two-destination direction; confirm that enrichment remains optional; decide how reimport adds versus replaces information; approve separate durable drafts before removing Save actions; decide whether offline-close recovery is required and what local storage is permitted; and prioritize export activation separately from interface consolidation.

The first implementation should prove seven things with focused synthetic journeys and a bounded owner acceptance session: a newcomer knows the next action; a confirmed fact is never fabricated; draft answers and review edits survive acknowledgment and refresh; job/CV identity survives refresh; uncertain writes and model outcomes never become silent duplicates; profile and job/language content remain independent; and a real exported PDF passes the shared content/reading-order checks when rendering is configured.

The next work should be an approved implementation slice with these acceptance boundaries, starting with recoverable drafts and import/profile separation. This document is the blueprint for that decision, not permission to begin the redesign.
