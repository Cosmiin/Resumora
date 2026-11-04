# Experience enrichment UX audit

31 October 2026 · Resumora local application · Screenshot-led inspection

## Verdict

The flow has sound decision boundaries: answering a question does not rewrite the CV, and a proposal takes effect only after explicit acceptance. Its presentation makes that sequence harder to understand. A full experience remains expanded above a second workspace, and the workspace mixes questions, explanations, generation options, proposal review and evidence. A focused workspace for one role would make the next action much clearer.

## Evidence and scope

Inspected fresh screenshots at 1487×1058 and 390×844 using the current application components and isolated synthetic adapters. Covered upload, import review, confirmed profile, question entry, proposal review, expanded evidence, acceptance and return to the profile. A second synthetic fixture used a longer role description to test placement. Every image linked below was opened and inspected. Playwright was used because the Browser plugin is unavailable; this fallback was previously authorized.

No owner CV, live AI request or account write was used. This establishes the behavior and layout of these states, not the quality of real model output, all error paths, screen-reader behavior or full WCAG conformance.

## Journey

1. **Improve this experience — needs work:** the role stays expanded and a panel is appended after its entire description.
2. **Answer — crowded:** one question is presented, with an answer field, action buttons and several secondary disclosures.
3. **Suggest wording — needs work:** the question is replaced by a proposal, while the original role remains above it.
4. **Review evidence — repetitive:** the proposal has its own card, edit control, acceptance controls, AI options, evidence disclosure and answer history.
5. **Accept or keep current — working in the tested fixture:** the assistant closes and returns to the role. The synthetic acceptance check retained original facts and stored accepted wording separately.

## Prioritized findings

### 1. High — the active question can open outside the viewport

In the longer-role fixture, clicking Improve left the original description taking up the screen. The answer field began at y=1177 in a 1058px viewport; focus was on BODY. The action changed the page without bringing the new task into view. Longer source text amplifies the problem.

**Recommendation:** turn the active role into a focused workspace with its title/company retained at the top. Put the question immediately under that header, and place the original description behind **View current wording**. Move focus to the question heading when it becomes ready and announce preparation through a status region.

[Long role immediately after Improve](/mnt/c/Users/mcosm/.codex/visualizations/2026/10/31/01a192cc-d1b1-7ea2-818e-8c8c6f6de34b/resumora-enrichment-audit-long/04-question-initial-position.png)

### 2. High — evidence repeats the same content without explaining its purpose

**Current wording and evidence** is collapsed initially, which helps. Expanding it shows the current wording and then repeats its sentences as individual evidence rows. With the original role still above, the same content can appear three times. Confirmed answers are placed beside original-source facts without clear grouping in this disclosure.

**Recommendation:** offer one **Compare with current CV** disclosure. Show the current version once, then only additional confirmed answers under a clear label. Keep detailed source references available on demand, adjacent to the claim they support.

[Expanded evidence with repeated sentences](/mnt/c/Users/mcosm/.codex/visualizations/2026/10/31/01a192cc-d1b1-7ea2-818e-8c8c6f6de34b/resumora-enrichment-audit-evidence/08-evidence-expanded.png)

### 3. Medium — guidance competes with the question

The mobile question screen contains a reason, an uppercase AI disclaimer/progress line, the question, selection instructions, save guidance, a second explanation about answers and facts, other options, generation options and answer history. The fixture has no selectable options, yet it still says to click an option again to deselect it. The result is more reading before a simple free-text answer.

**Recommendation:** retain **Question 1 of N**, the question, one relevant hint, the answer field and the primary continuation action. Show selection instructions only when options exist. Consolidate the save explanation to **Your answer is saved; you review changes before they enter your CV.** Keep Skip nearby; group history and alternate generation under one secondary Details disclosure.

[Mobile question](/mnt/c/Users/mcosm/.codex/visualizations/2026/10/31/01a192cc-d1b1-7ea2-818e-8c8c6f6de34b/resumora-enrichment-audit-before/05-mobile-question.png)

### 4. Medium — the proposal changes position and loses role context

The role body is narrowed by a right-hand margin column; the assistant below spans both columns. Its proposal is inset again inside a rounded card and uses different text styling from the CV. After scrolling to the proposal, its heading does not identify the role. The mobile capture shows the next role starting immediately after the panel, further weakening the boundary.

**Recommendation:** retain a compact role header throughout questions and review. Use the same reading width and document typography for the proposed description as for its final CV placement. Show one proposal and a short statement of what changed. Keep **Use this description** and **Keep current wording** together; keep AI adjustments secondary.

[Desktop proposal](/mnt/c/Users/mcosm/.codex/visualizations/2026/10/31/01a192cc-d1b1-7ea2-818e-8c8c6f6de34b/resumora-enrichment-audit-evidence/07-desktop-proposal.png) · [Mobile proposal](/mnt/c/Users/mcosm/.codex/visualizations/2026/10/31/01a192cc-d1b1-7ea2-818e-8c8c6f6de34b/resumora-enrichment-audit-before/06-mobile-proposal.png)

### 5. Medium — stage changes need explicit keyboard focus

DOM inspection found focus on BODY after both initial question preparation and question → proposal transition. The proposal was visible in the tested mobile position, but focus did not identify the new task. Screenshot inspection alone cannot establish screen-reader announcements.

**Recommendation:** give each stage a focusable heading, focus it when the stage changes, and announce loading/result status. On close, return focus to that role’s Improve control. Verify keyboard order, accessible status announcements and focus return in a dedicated accessibility pass.

## Proposed interaction

**Role header → one question at a time → one CV-shaped proposal → explicit acceptance.**

The current wording is available through one collapsed comparison control. Confirmed answers and source references are available through a single evidence area. Keep the existing fact lineage, save coordination, stale-proposal checks, explicit paid-request intent and separate acceptance decision.

## Implementation boundary

The accompanying change implements the requested CV structure correction: visible empty sections with inline completion, removal of the duplicate lower editor, and photo/export settings in their own disclosure. The enrichment recommendations above are an audit and proposed next design; this task does not claim that redesign has been implemented.

## Captured flow

### 1 — Improve opens below the long role

![1 — Improve opens below the long role](/mnt/c/Users/mcosm/.codex/visualizations/2026/10/31/01a192cc-d1b1-7ea2-818e-8c8c6f6de34b/resumora-enrichment-audit-long/04-question-initial-position.png)

### 2 — Answer a question

![2 — Answer a question](/mnt/c/Users/mcosm/.codex/visualizations/2026/10/31/01a192cc-d1b1-7ea2-818e-8c8c6f6de34b/resumora-enrichment-audit-before/05-mobile-question.png)

### 3 — Review the proposed description

![3 — Review the proposed description](/mnt/c/Users/mcosm/.codex/visualizations/2026/10/31/01a192cc-d1b1-7ea2-818e-8c8c6f6de34b/resumora-enrichment-audit-before/06-mobile-proposal.png)

### 4 — Inspect current wording and evidence

![4 — Inspect current wording and evidence](/mnt/c/Users/mcosm/.codex/visualizations/2026/10/31/01a192cc-d1b1-7ea2-818e-8c8c6f6de34b/resumora-enrichment-audit-evidence/08-evidence-expanded.png)

### 5 — Accepted description in the CV

![5 — Accepted description in the CV](/mnt/c/Users/mcosm/.codex/visualizations/2026/10/31/01a192cc-d1b1-7ea2-818e-8c8c6f6de34b/resumora-enrichment-audit-before/07-mobile-accepted.png)


## Implementation follow-up — 1 November 2026

The selected focused-modal variant is now implemented in the local application. It replaces the inline assistant for the document workspace with Add details → Review description → explicit Use this description. The source wording is collapsed and no longer repeated as evidence rows. Keyboard focus, native modal isolation, draft/proposal resumption, long mobile content and in-modal save recovery were checked. The findings above describe the pre-redesign baseline; current implementation details are in `frontend/profile-document.md`, and the final comparison is recorded in project-root `design-qa.md`.
