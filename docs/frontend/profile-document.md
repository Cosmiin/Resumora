# My Profile document workspace

Implemented locally on 31 October 2026 from the approved Option 1 mockup. This is an interface change over the existing editor projection, not a replacement CV schema or a production deployment.

## Reading and editing

Skills use compact sage tags grouped under aligned professional and technical labels. Every skill remains visible, including long names that wrap; clicking a tag edits it inline. Remove controls appear on hover or keyboard focus and stay visible on touch devices. Each group ends with a short Add action, and Improve skills follows the inventory. There is no overflow list or side panel.

`ProfileDocument` presents the reusable career record as one continuous document. Name, contacts, summary, experience, education, skills and all configured optional sections can be read without opening accordions. Clicking a value reveals a labelled native input or growing textarea. Changes use the existing `patchFact`, `writeSummary` and `acceptWording` helpers and the existing autosave coordinator. Enter finishes a short field; Ctrl/Cmd+Enter finishes a paragraph; Escape restores that field through an ordinary edit.

A full-name correction clears obsolete split-name values. Year-only dates retain their precision. Editing approved prose changes its presentation wording and marks that wording user-authored; the original role facts and source references remain. Existing rich contribution structure and optional-entry wording are retained. The profile shows the career record, including information omitted from a particular exported CV; existing presentation visibility and template settings are not deleted.

Profile options provide history, reviewed CV updates and existing removal controls. The duplicate accordion editor has been removed. Empty experience, education, skill categories, languages, certifications and configured optional sections remain visible with completion prompts. Add actions create and focus fields in their own section. Language and certification placeholders create no saved facts until the user adds an entry. Name details sit beside identity for explicit first/last name confirmation; editing the full name never guesses that split. **Appearance, language & export** contains photo controls, exported section order/visibility, additional section creation, templates, language and export capabilities. Existing metadata loading remains intact; the closed disclosure removes them from the main reading surface.

## Import review

The connected starting screen offers Upload your CV and secondary manual entry. `instantUpload` starts an upload after a valid, explicitly selected or dropped file. It is opt-in at `StartChooser`; standalone import callers keep their existing explicit-submit behavior. Unknown outcomes retain their original operation identity and are not automatically resubmitted.

First-import review uses the same document renderer with a compact review ribbon, in-place corrections and contextual issue markers. Original-source viewing reuses the existing verified source dialog and selected fact mapping. Year-only dates do not create an extra issue merely because a month is absent. No numerical confidence score is invented.

The detail count and individual issue links focus the exact field and open its warning. A check action confirms a valid field through the staged draft save, leaving original extraction evidence intact. Grouped year-only warnings confirm their dates together. Invalid or reversed dates still require correction; per-field confirmation does not publish the Profile or bypass unresolved skill categories at final review.

The staged workspace draft remains separate from the active Profile. **Finish review** explicitly approves the displayed information using the existing confirmation helper, after the staged save acknowledges it. Unfinished review corrections survive acknowledged draft saving and reopening. Saving a review does not itself publish the profile. Existing-profile uploads retain reviewed, selective updates and the existing identity safeguard. A consumed import cannot navigate back into update review after publication.

## Contextual enrichment

**Improve this experience** opens the focused workspace for a role, project or volunteering entry. The user chooses **Add useful details** or **Improve with what I have**; generation starts only after the staged request is saved. Merely restoring a URL or reopening pending work reads the existing receipt rather than dispatching new inference. A saved request with a missing receipt has an explicit same-ID resume action. React Strict Mode does not double-dispatch.

The native modal has a fixed header and independently scrolling body. It opens with current wording on the left and score/feedback on the right; selecting a suggestion focuses the corresponding point. Mobile stacks these sections. One contextual question appears at a time with an answer hint and optional voice typing; **Continue** confirms it and advances without another Save action. The last question leads to a whole-entry proposal, with a short introduction and distinct contributions. Live streamed text remains provisional until validation. In proposal review the original is collapsed, the proposal is editable, and **Use this version** explicitly accepts it. Exact-text score previews remain separate from saving. Success and measured progress appear only after Profile save acknowledgement. Existing point sessions and unsupported optional section types retain their previous flow.

The skills section offers **Improve skills**, which extracts candidates and improves the full inventory. Skill source icons and evidence tooltips have been removed. All profile editing and Undo are locked until improvement and saving finish. See [Improve skills](improve-skills.md).

**Generate role summary with AI** now proposes a scope-and-context introduction: the supported business area, teams, stakeholders, customers, geographical coverage or ownership. New generation uses one or two sentences in a single paragraph, normally 25–45 words and at most 400 characters. It selects distinctive context rather than restating contribution bullets. Sparse evidence produces a shorter neutral statement with missing context flagged in warnings; scale and seniority are never inferred. Contributions and explicit review remain unchanged. Older saved summaries retain their existing validation limits so pending and accepted reviews remain readable and editable. Whole-experience rewrites keep their separate behavior.

## Saving and mobile behavior

The header shows Saving, Saved, Not saved, or session-only state. Failed document saves retain one actionable recovery control per failed resource. The secondary status no longer claims an unsuccessful write was saved online. Controllers continue to own writes across in-app navigation; existing browser-close and account/sign-out protections remain.

Mobile displays the same flowing document and opens contextual enrichment in a focused, scrollable dialog. Edit/preview visibility selectors target named top-level panes, so nested answer history is not hidden.

## Verification boundary

Verification uses synthetic identities, source documents, proposals and transport adapters. It includes import staging and refresh, original-source navigation, field lineage, partial-date precision, accepted wording versus original facts, one explicit question request, mobile answer history, failed-save retry and pending edits across navigation. Existing account/session isolation, photo and template tests are retained with updated public UI entry steps.

No real CV, hosted database write, live model request, migration, service restart, push or deployment is part of this UI verification. The live connected application remains on the existing local origin, `http://127.0.0.1:15173/`.

## Section completion verification — 31 October 2026

The empty-section regression verifies that viewing the CV does not create facts, adding a language/proficiency and certification changes the existing model, and remounting retains both the entries and empty configured sections. Browser verification follows upload → review → confirmation → inline completion → refresh, checks skill/language/certification persistence and export visibility, and confirms no duplicate editor or horizontal overflow at 390px. Photo and authentication regression checks use the local name and presentation disclosures. The enrichment audit is recorded in `../ux-experience-enrichment-audit.md`; its recommended redesign is separate from this section-completion implementation.

Validation result: 543 frontend tests across 49 files passed. The final targeted document regression also passed (6 tests). Web typecheck, changed TypeScript formatting, diff whitespace checks and the production web build passed. The build retains the existing large-chunk warning.

## Experience modal — 1 November 2026

`ExperienceModal` uses the native dialog top layer, a portal, inert background, body scroll locking and explicit Tab/Shift+Tab wrap. Stage changes focus the active heading; closing restores the experience’s Improve control. Escape and close retain draft answers and pending proposals. While question/proposal generation is in flight, closing is guarded so the active response is not detached. Opening an already saved proposal or refreshing its route does not start a new AI request. The footer stays visible and long content scrolls inside the dialog, including at 390×844.

Document-save failures appear inside the modal with the existing same-save retry operation. Applying wording is blocked while that save is failed; returning to the profile remains available. The background recovery controls remain unchanged for other views.

The source visual is the selected option 1 (`exec-23e0509a-0fbc-4cfc-ab0a-304a6a8a96a2.png`). Existing schema, provenance, paid-request intent, revision checks, save receipts and proposal acceptance logic are reused. Legacy non-document enrichment callers keep their prior rendering. Browser checks use the current App with synthetic adapters and block all real `/v1/` traffic. They verify explicit AI-call counts, draft preservation, proposal refresh, focus, mobile overflow, long-content scrolling, save retry and unchanged original role facts.

Modal validation result: 549 frontend tests in 50 files passed, including six new modal regressions; 27 browser assertions passed on desktop and mobile. Typecheck, formatting, whitespace checks and the production web build passed. Final comparison evidence and coverage limits are recorded in project-root `design-qa.md`.
