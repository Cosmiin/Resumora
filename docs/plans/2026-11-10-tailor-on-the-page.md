# Tailoring "On the page" (variant A · Margin notes)

Owner's pick (2026-11-10), from the mockups at https://claude.ai/artifact/AW1MPF6CNpDjSS98B1vVYg, variant **A · Margin notes**: tailoring gets the same look as the new enrichment focus mode ("On the page", plan `2026-11-10-enrich-guided-flow.md`).
- The CV is shown as a page (Source Serif document) on the left; one **note card** on the right holds the question or the proposal, with a 4 px top border and an eyebrow in the current section's colour, and a dashed connector toward the page.
- The line being discussed is highlighted on the page. Rewrites show **in place**: old words struck, new words inserted with a soft underline; AI guesses stay marked (marigold / yellow) with their reason.
- Steps sit on top as **bookmark tabs** in their section colour (current filled, finished ✓, later grey). The match score sits above the note card.
- Section colours reuse enrichment's section tokens, nothing new: **Steer = role (pine)**, **Experience / Projects / Volunteering = bullets (marigold)**, **Skills = tools (sky)**, **Summary = description (plum)**, final touches (achievements, languages, layout, …) = neutral pine-800.
- A finished role gets a **stamp** on its page ("Role 1 tailored · 41 → 58") beside the note with the newly met requirements.

Rules:
- Web only. No change to the API, prompts, database, or scoring (`SCORE_POLICY` and the weights stay as they are).
- Behaviour stays as it is today: same steps, same buttons and what they do, same `AcceptBody` shapes. This plan changes layout, styling and copy only, plus showing data the web already has (question gap → requirement text).
- **Depends on enrichment Task 2**: use the tokens `--sec-role|bullets|tools|description` (+ `-tint`, `-ink`, `--sec-bullets-mark`) and the plum ramp that Task 2 adds to `tokens.css`. Never define a second copy of those tokens. This branch is stacked on `feat/enrich-guided-flow` at its Task 2 commit.
- **Shared page classes from enrichment Task 2** (generic, in `focus.css`, loaded app-wide by `main.tsx`; colour comes from the nearest ancestor's `data-section="role|bullets|tools|description"`): `.page-sheet` (paper), `.page-tabs` (section tabs, current one `aria-current="step"`), `.page-note` + `.page-note-eyebrow` (note card with top border and dashed connector), `.page-mark` (highlighted line), `.page-bar` (6 px bar beside a block), `.page-del` (struck old text), `.page-ins` (inserted new text). Use these; don't restyle them in `tailor.css` (tailoring-only layout rules are fine). **Check the names against the committed `focus.css` / `tokens.css` before writing each brief**; the plan's names below follow enrichment's brief.
- Section mapping for `data-section`: Steer → `role`, Experience / Projects / Volunteering → `bullets`, Skills → `tools`, Summary → `description`, final touches, done screen and guided review → `role` (pine). No new section value.

Feature id for cost tags: `tailor-on-the-page`. One lane, tasks in order (Tasks 1–5 all touch `tailor.css` and `en-tailor.ts`; Tasks 1, 2 and 4 touch `TailorFlow.tsx`).

## Task 1: Section colours, bookmark tabs, page layout

---
files: [apps/web/src/tailor/StepBar.tsx, apps/web/src/tailor/TailorFlow.tsx, apps/web/src/styles/tailor.css, apps/web/src/i18n/en-tailor.ts, apps/web/src/tailor/tailor-flow.test.tsx]
new_files: []
deps: false
size: 110
tests: light
---

**Goal:** the tailoring screen knows its section colour and shows the steps as coloured bookmark tabs.
- `TailorFlow` puts `data-section` on the `.tailor-mode` root, using enrichment's values (see the mapping above): `role` on the tone and steering screens, `bullets` in any role section (`isRoleSection`), `tools` in Skills, `description` in Summary, `role` everywhere else (final touches, done screen, guided review). Every `[data-section]` element gets `--sec`, `--sec-tint`, `--sec-ink` and `--sec-mark` from `focus.css` (enrichment Task 2); "the section colour" below means `var(--sec)`. Don't redefine them in `tailor.css`.
- `StepBar` keeps its props and links (finished steps stay clickable as today) and takes the `.page-tabs` look: current tab filled with the section colour (`aria-current="step"` as today), finished tabs show a "✓ " before the label, later tabs grey. The score moves to the right end of the bar as "match with the job **58**" with the earlier score struck after it when it changed (`base` → `latest`), same capped line as today.
- Every `.tailor-card` inside `.tailor-mode` takes the `.page-note` look (add the class), with its `.tailor-eyebrow` also `.page-note-eyebrow`.
- The page background becomes a light desk: `--surface-sunken` with a faint dot grid (same as enrichment's page background in `focus.css`, reuse its rule if there is one).
- The `is-wide` layout (role sections with a role on the left) keeps its two columns; the left column will hold the page (Task 2).

**Acceptance tests:**
- On an Experience question the root has `data-section="bullets"`; on the Skills step `data-section="tools"`; on the Summary step `data-section="description"`; on the tone screen `data-section="role"`.
- The step bar still marks the current step with `aria-current="step"` and finished steps still open on click (existing tests stay green).

**Out of scope:** the page itself (Task 2), any change to which steps open, new tokens.

## Task 2: Experience question on the page, note card with "the job asks for"

---
files: [apps/web/src/tailor/RolePanel.tsx, apps/web/src/tailor/QuestionCard.tsx, apps/web/src/tailor/TailorFlow.tsx, apps/web/src/styles/tailor.css, apps/web/src/i18n/en-tailor.ts, apps/web/src/tailor/role-context.test.tsx]
new_files: []
deps: false
size: 140
tests: normal
---

**Goal:** a role-section question looks like enrichment's "On the page": the role as a CV page on the left, the question as a note card on the right.
- `RolePanel` renders the role inside `.page-sheet`: the role line "Title — Company" with the dates on the right, the description in italics when there is one, the bullets as a document list.
- The bullet the question points at (`bulletId`) gets `.page-mark` (keeps `aria-current="true"`); the other bullets are plain and slightly muted. When the question is about the whole role (no bullet), `.page-bar` runs beside the role block, and the existing "About the whole role" tag stays.
- RolePanel stops using `fm-bullets` / `fm-bullet` / `is-current` (enrichment's Task 2 promised to keep those looking the same until then; tell the enrichment session when this task lands). It keeps `fm-tag`.
- The eyebrow above the page keeps its text.
- `QuestionCard`'s card is the `.page-note` (Task 1), whose dashed connector points left toward the page (hidden under 760 px, where the page sits above the note).
- **"The job asks for"**: when `question.gap` resolves to a requirement or keyword of the job, the note shows a small dashed box under the question title: label "The job asks for" and the requirement text in `--font-document`. Resolve it in `TailorFlow` from the run's current `MatchScore` (requirement refs `rN` → the requirement text, keyword refs `k:<term>` → the term) and pass it to `QuestionCard` as an optional `asks?: string` prop. No gap, or a gap that doesn't resolve → no box.
- Non-role questions (Skills) keep their current one-column layout; they get the note card styling from Task 1 and the "The job asks for" box the same way.

**Acceptance tests:**
- A role question with `bulletId` = bullet 2: bullet 2 has `aria-current="true"` and the marker class; bullets 1 and 3 don't.
- A role question with `gap: "r1"` and a score whose requirement r1 reads "REST APIs and webhooks": the note shows "The job asks for" and that text.
- `gap: "k:SQL"` shows "SQL". A gap not in the score, or no gap: no "The job asks for" box.
- Back, Skip, Next and the "used in" role buttons behave as before (existing tests stay green).

**Out of scope:** changing which bullet a question points at, the API's question shape, the Skills page view.

## Task 3: Experience review in place on the page

---
files: [apps/web/src/tailor/RoleReview.tsx, apps/web/src/styles/tailor.css, apps/web/src/i18n/en-tailor.ts, apps/web/src/tailor/role-review.test.tsx]
new_files: []
deps: false
size: 130
tests: light
---

**Goal:** the role review shows the rewrite on the page, with the decisions in a note card beside it.
- Layout: two columns like Task 2 (page left, note right; page above note under 760 px). The page uses `RolePanel`'s paper styling with the role's title line, description and bullets.
- In the **New** view, each changed line shows the old wording in `.page-del` followed by the new wording in `.page-ins`. Unchanged lines are plain. The existing green word highlights inside the new text may stay. Guesses keep `.tailor-guess` (marigold/yellow) and the "AI guess" tag.
- In the **Original** view, the page shows the original wording only, no strike.
- The **note card** on the right holds: eyebrow "Experience · {role title}", title "Here's this role, rewritten for the job." (role) or the project / volunteering variant, the Original / New switch, then — when there are guesses — a short list "AI guesses to check later" with each guess's text and its reason as visible text (not only the tooltip), then the removed-count line and the existing buttons (← answers, Keep the original, Use the new version / Continue) in the same order.
- Decisions and `onAccept` bodies are exactly as today.

**Acceptance tests:**
- A role with one changed bullet: in New view the page shows the old text inside a struck element and the new text after it; switching to Original shows only the old text.
- A guess proposal: its reason is visible as text in the note card.
- "Use the new version" and "Keep the original" send the same `AcceptBody` as before (existing tests stay green).

**Out of scope:** per-guess Keep / Edit / Remove in this step (guesses still go to the guided review), changing proposals or decisions.

## Task 4: Role done and tailoring done, with a stamp

---
files: [apps/web/src/tailor/TailorFlow.tsx, apps/web/src/tailor/TailorMoment.tsx, apps/web/src/tailor/DoneScreen.tsx, apps/web/src/styles/tailor.css, apps/web/src/i18n/en-tailor.ts, apps/web/src/tailor/role-done.test.tsx, apps/web/src/tailor/done-screen.test.tsx]
new_files: []
deps: false
size: 120
tests: light
---

**Goal:** finishing a role and finishing tailoring feel like enrichment's congrats: the page gets a stamp, the note card says what changed.
- **Role done:** after a role is accepted, the moment shows the role's page (Task 2's paper, with the role as it is now, kept changes in place and no strike) on the left and the existing moment content (score count-up, title, line, Next button, confetti) in a note card on the right whose top border is marigold (`--marigold-500`). On the page, a stamp in the top right, rotated about −7°, 3 px pine border, uppercase: "Role {n} tailored" with "{from} → {to}" under it in `--font-display` (omit the numbers when either score is missing). For projects / volunteering: "Project {n} tailored" / "Volunteering {n} tailored". `{n}` is the role's position among the run's visited items of that kind (as the existing "Role 1 of 3" counter).
- The moment's line keeps listing the newly met requirements (`newlyMet`, up to two names, as today).
- Moments that aren't a role (skills, summary, final sections) keep today's look, inside the note card style.
- **Tailoring done:** `DoneScreen` keeps its content and links, inside a note card with the marigold top border; its first line under the title reads the score as "{base} → {final}" as today. No page beside it.

**Acceptance tests:**
- After accepting role 1 of 2, the stamp reads "Role 1 tailored" and "41 → 58" for scores 41 and 58, and the Next button still enters the next role.
- A project item's stamp reads "Project 1 tailored".
- Done screen: existing tests stay green.

**Out of scope:** new counts or requirement lists on the done screen, any change to `newlyMet`.

## Task 5: Skills and Summary on the page

---
files: [apps/web/src/tailor/SkillsReview.tsx, apps/web/src/tailor/SummaryReview.tsx, apps/web/src/styles/tailor.css, apps/web/src/i18n/en-tailor.ts, apps/web/src/tailor/skills-review.test.tsx, apps/web/src/tailor/summary-review.test.tsx]
new_files: []
deps: false
size: 120
tests: light
---

**Goal:** the Skills and Summary reviews use the page-plus-note layout in their section colours.
- **Summary:** the page (left) shows an "About me" heading and the summary paragraph in place: in the new view the old summary in `.page-del`, then the new summary in `.page-ins` (plum through `data-section="description"`), guesses marked as today (`.tailor-guess`). The note card (right, plum) holds the eyebrow "Summary", the title, the guess list with Keep / Edit / Remove exactly as today, the removed line and the buttons (Use my original / Use the new summary) as today.
- **Skills:** the note card (sky) keeps today's batch list, buttons and counters. The page (left) shows a "Skills" heading and the CV's current skills as one comma-separated line, with this batch's renamed skills shown as `.page-del` old / `.page-ins` new and new skills appended in `.page-ins`. Skills reverted with Undo or removed guesses show as plain original / not shown.
- Phone: page above note.

**Acceptance tests:**
- Summary with one changed sentence: the page shows the old summary in a struck element and the new text after it; Keep / Edit / Remove on a guess behave as before (existing tests stay green).
- Skills batch with one rename and one new skill: the page line shows the old name struck, the new name inserted, and the new skill appended; pressing Undo on the rename shows the old name plain.

**Out of scope:** changing batch size, skill questions, the summary's decision rules.
