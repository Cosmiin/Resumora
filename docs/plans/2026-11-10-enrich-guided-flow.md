# Enrichment as a guided, colour-coded flow per role ("On the page", option C)

Owner's picks (2026-11-10), from the mockups at https://claude.ai/artifact/HYoUv3rXBfyQeVxD4r5C4D (direction **C Â· On the page**):
- Each role opens with a short intro that says the first questions are general questions about the role.
- Inside a role the flow moves through four sections, each with its own colour: **About the role** (pine), **Bullet points** (marigold), **Tools** (sky), **Description** (new plum colour).
- Bullets are gone through one by one in CV order. Only the bullet being discussed is highlighted.
- Every role ends with the description, then "Congrats, you just finished updating your first role. Let's go to the next one."
- The left side of focus mode becomes the role shown as a CV page (Source Serif, like the document). The right side is a "note" card whose top border and eyebrow use the section colour.
- Web only. No change to the API, prompts, scoring (`SCORE_POLICY`, weights) or the database.

Known consequence (accepted by following the owner's spec): the AI's `tools` role question moves from before the bullets to after them, so bullet rewrites no longer see that answer. It is still saved in the role's notes and feeds the role description.

Feature id for cost tags: `enrich-guided-flow`. One branch, tasks in order (Tasks 2 and 3 both touch `FocusMode.tsx`; Task 2 reads Task 1's `section`).

## Task 1: Session order: role questions, bullets in CV order, tools, description

---
files: [apps/web/src/cv/enrich/useFocusSession.ts, apps/web/src/cv/enrich/focus-session.test.tsx]
new_files: []
deps: false
size: 140
tests: normal
---

**Goal:** `useFocusSession` walks one role in four sections and tells the screen which section it is in.
- **Role questions first, without tools.** The opening role-question steps (`kind: "role"`) skip any role question whose `topic` is `"tools"`. Thin roles keep their current opening (brainDump â†’ role questions â†’ picks), also without the tools question.
- **Bullets in CV order.** In `improve` mode, `buildQueue` keeps the same filter (bullets below 75, plus the âœ¨-picked bullet) but orders them by their position in `role.bullets`, not by score. The âœ¨-picked bullet still goes first. `standOut` is unchanged (already CV order).
- **Tools after the bullets.** When the bullet queue is finished and the role has a `topic: "tools"` question that wasn't asked yet, the next step is that question (a `kind: "role"` step with its index). Answering it saves the note exactly like other role answers (same `notes` path) and moves on to the description; Skip moves on to the description too. A role with no tools question goes straight from bullets to the description, as today.
- **Description and done** are unchanged (`describing` â†’ `description` â†’ `roleDone`).
- **Section:** the hook's return value gets `section: "role" | "bullets" | "tools" | "description" | "done"`, worked out from the current step: `role` steps that aren't the tools question, `brainDump`, `dumpWorking`, `dumpPick`, `dumpEmpty`, and `scoring` with source `opening`, `box` or `dump` â†’ `"role"`; the tools role question â†’ `"tools"`; `question`, `needsDetail`, `working`, `proposal`, `scoring` with source `bullet`, and `failed` with a `bulletId` â†’ `"bullets"`; `describing` and `description` â†’ `"description"`; `roleDone` â†’ `"done"`. `celebrate` and `failed` without a `bulletId` keep the section of the step before them.
- Back (`session.back`) keeps working across the new order, including from the tools question back to the last bullet step.
- The step dots (`session.dots`) count the tools question once, in its new place.

**Acceptance tests:**
- Role with role questions [company, purpose, tools] and three bullets below 75 with scores 60, 20, 40 (CV order a, b, c): steps go company â†’ purpose â†’ bullet a â†’ bullet b â†’ bullet c â†’ tools â†’ describing; `section` is `"role"`, `"role"`, `"bullets"` Ã—3, `"tools"`, `"description"`.
- Same role, âœ¨-picked bullet c: the queue is c, a, b.
- Answering the tools question adds a note with that question's text and the answer (same shape as other role answers), then the next step is `describing`.
- Skipping the tools question goes to `describing` and adds no note.
- No tools question: last bullet â†’ `describing`.
- Thin role (one bullet) with a tools question: brainDump first, then the non-tools role questions; the tools question comes after the bullets.
- Back from the tools question returns to the last bullet text step.
- `section` is `"done"` on `roleDone`; during `celebrate` after a bullet rewrite it stays `"bullets"`.
- Existing tests that asserted lowest-score-first order are updated to CV order; all other existing session tests keep passing.

**Out of scope:** any screen or CSS change (Task 2), the API, prompts, scoring and the role-question choice made by the model.

## Task 2: Focus mode "On the page": role as a CV page, note card, section colours, one highlighted bullet

---
files: [apps/web/src/cv/enrich/FocusMode.tsx, apps/web/src/styles/focus.css, apps/web/src/styles/tokens.css, apps/web/src/i18n/en.ts, apps/web/src/cv/enrich/focus-mode.test.tsx]
new_files: []
deps: false
size: 260
tests: light
---

**Goal:** Focus mode looks like option C of the mockups. Behaviour and step logic stay the same; this is the screen.
- **Tokens** (`tokens.css`): add a plum ramp (`--plum-50: #f5f0f8; --plum-100: #ece3f2; --plum-200: #dccdea; --plum-400: #9a7bb5; --plum-600: #6d4a86; --plum-800: #4a2f5e`) and section tokens, each with a strong colour, a tint and an ink: role = pine (`--pine-600`, `--pine-100`, `--pine-800`), bullets = marigold (`--marigold-600`, `--marigold-100`, `--marigold-800`, plus `--sec-bullets-mark: var(--marigold-300)` for the highlighter), tools = sky (`--sky-600`, `--sky-50`, a dark sky ink `#203d60`), description = plum (`--plum-600`, `--plum-100`, `--plum-800`). Names: `--sec-role`, `--sec-role-tint`, `--sec-role-ink`, and the same for `bullets`, `tools`, `description`.
- **Section on the root:** the `.focus-mode` root gets `data-section={session.section}` (Task 1). CSS picks the section colour from it; no colour logic in TSX beyond that attribute.
- **Left side = the page.** `fm-left` becomes a sheet of paper (white, small radius, the document shadow `--shadow-paper`, `--font-document`) on a light patterned background (a faint dot grid on `--surface-sunken`). Above the paper, four tabs: About the role Â· Bullet points Â· Tools Â· Description. The current section's tab is filled with its colour, earlier ones show a âœ“, later ones are grey. On the paper: the role line "Title â€” Company" with the dates on the right, the description (when the role has one) in italics, then the bullets as a document list. Keep the per-bullet score tags (`fm-tag`) and the role score line under the paper, smaller.
- **Highlight by section** (only one thing highlighted at a time):
  - role section: a 6 px rounded bar in the role colour beside the role block (left of the paper text);
  - bullets section: only the current bullet (`aria-current="true"`, as today) gets a highlighter-marker background in `--sec-bullets-mark`; bullets already improved in this session get a pine list marker; the others are shown plain, slightly muted. During `proposal`, the current bullet shows the old text struck through and the proposed text after it with a soft marigold underline, on the page;
  - tools section: the bar beside the role block in the tools colour;
  - description section: during `description`, the proposed text is shown in the description spot on the page in a plum-tint box; the bar is plum;
  - done: no highlight.
- **Right side = the note card.** The step content (`fm-right`) sits in a white card with a 4 px top border in the section colour and a short dashed connector line in the same colour pointing left toward the page (hidden under 760 px). A small eyebrow at the top of the card names the section in its colour: "About the role Â· Question 2 of 3", "Bullet points Â· Bullet 2 of 5", "Tools", "Description Â· Last step for this role". "Bullet n of m" counts position in the queue (`position + 1` of `queue.length`). Question text uses `--font-display`. Existing step components (QuestionStep, ProposalStep, DescriptionStep, BrainDumpStep, Working) render inside the card unchanged.
- **Phone (â‰¤ 760 px):** paper on top (capped height, scrolls), note card below; tabs stay visible and wrap if needed.
- **Copy** (en.ts): the four section names and the eyebrow strings above, as new `enrich.focus.section.*` keys.

**Acceptance tests:**
- On a bullet question step for the 2nd bullet in the queue: the dialog root has `data-section="bullets"`, exactly one `li` has `aria-current="true"` (that bullet), and the eyebrow reads "Bullet points Â· Bullet 2 of 3".
- On the opening role question: `data-section="role"`, no bullet has `aria-current`, the eyebrow reads "About the role Â· Question 1 of 2".
- On the description step: `data-section="description"` and the proposed text is shown in the page's description spot.
- The section tabs show four names, and the current one is marked (`aria-current="step"`).
- Existing focus-mode tests keep passing (update only selectors that the new markup moved).

## Shared "On the page" classes (for reuse by the tailoring redesign)
The page, note and highlight styles get these generic class names, defined in focus.css (loaded app-wide from main.tsx) and NOT nested under `.focus-mode` or `.fm-*`, so another screen can use them:
- `.page-sheet` the paper; `.page-tabs` the section tabs above it (current tab `aria-current="step"`);
- `.page-note` the note card (4 px top border + dashed connector in the section colour), `.page-note-eyebrow` its eyebrow;
- `.page-mark` the highlighted line (highlighter background), `.page-bar` the 6 px bar beside a block;
- `.page-del` struck old text, `.page-ins` inserted new text.
Their colour comes from the nearest ancestor's `data-section` attribute (`role` | `bullets` | `tools` | `description`), through the `--sec-*` tokens. FocusMode applies these classes (fm-* classes can stay for layout).
Acceptance test (add): the current bullet has class `page-mark`, the note card has class `page-note`.
- Resolved colour variables: every `[data-section="role|bullets|tools|description"]` element sets `--sec`, `--sec-tint` and `--sec-ink` to its section's tokens (plus `--sec-mark`, which is `--sec-bullets-mark` for bullets and the section tint otherwise). The `.page-*` rules use only these variables, so any screen that sets `data-section` gets the colours.
- tailor/RolePanel.tsx uses `fm-bullets`, `fm-bullet`, `is-current` (with `aria-current="true"`) and `fm-tag`. Outside `.focus-mode`, those four must look exactly as they do today.

**Do not:** change step logic or session code, add new step components, change the path bar's segments, change CelebrateMoment.

**Out of scope:** the intro and the congrats screen (Task 3), EnrichPath, the API.

## Task 3: Intro at the start of each role, congrats at the end, "next one"

---
files: [apps/web/src/cv/enrich/FocusMode.tsx, apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/i18n/en.ts, apps/web/src/cv/enrich/focus-mode.test.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx]
new_files: []
deps: false
size: 130
tests: light
---

**Goal:** the start and end of each role read like a guided conversation.
- **Intro.** When focus mode opens on a role from the path (`EnrichPath` passes a new optional prop `pathRole: { n: number; total: number }`, n = position among the path's scored stops), the note card first shows an intro, in the role colour, before any question. Copy for n = 1: eyebrow "Role 1 of 3 Â· About the role", title "Hey {firstName}, we're going to ask you a few questions to gather some ideas about this role.", line "First some general questions about the role. Then we'll go through your bullet points one by one, then your tools, and finish with a short description." For n > 1: title "Hey again! Same rhythm for this role: a few general questions first, to gather some ideas." `{firstName}` is the first word of `cv.basics.fullName`; when empty, "Hey, we're going to askâ€¦". For projects and volunteering, "this role" reads "this project" / "this volunteering role". Buttons: "Let's start" (shows the session's current step) and "Not now" (closes like âœ•). The session keeps loading behind the intro; if it's still scoring when "Let's start" is pressed, the usual working screen shows. The page shows the role bar in the role colour during the intro. Focus mode opened outside the path (no `pathRole`, e.g. âœ¨ on one bullet) has no intro.
- **Congrats** replaces the `roleDone` screen content when `pathRole` is set: eyebrow "Role {n} of {total} Â· Finished", title "Congrats, you just finished updating your {ordinal} role." (ordinal: first, second, third, fourth, fifth, sixth, seventh, eighth, ninth, tenth; above ten "role {n}"; "project"/"volunteering role" for those kinds), the role score as today, then "Let's go to the next one." and the existing next button (its label already comes from `next.label`). When it's the last stop: title "Congrats, you just finished updating your last role." and no "next one" line. On the page: a small stamp "Role {n} done" in pine in the paper's top right. Without `pathRole`, the `roleDone` screen stays as today.
- Copy in en.ts.

**Acceptance tests:**
- Path with 3 roles, CV fullName "Andrei Munteanu": opening role 1 shows "Hey Andrei, we're going to ask you a few questions to gather some ideas about this role." and no question; pressing "Let's start" shows the first role question.
- Role 2 of the path opens with the "Hey again!" intro.
- Focus mode without `pathRole` opens straight on the first step (no intro).
- Finishing role 1 of 3 shows "Congrats, you just finished updating your first role." and "Let's go to the next one."; the button moves to role 2 (existing `enrich-path` flow).
- Finishing the last role shows "â€¦your last role." without "Let's go to the next one.".
- "Not now" on the intro closes focus mode like âœ•.

**Do not:** change the path's stop order, PathStart, CelebrateMoment or EndStop; add props other than `pathRole`.

**Out of scope:** the API, scoring, the light stops, achievements and skills stops.


