# A new line for a gap the person ticked, when no line of the role can carry it

Date: 27 Nov 2026. Owner's word: on 27 Nov he allowed a new line "but rewording comes first"; the same day, after the three screens went live, he said yes to building it.

## Why
In a run on the local stack (Lifecycle Operations Lead, real AI) the person ticked a role for "prompt engineering" and for "standard operating procedures". Both reached the writer as confirmed facts, and the role stayed exactly as written: the writer may only reword, and no line of the role was about that work. The gap ended as an added skill only. The person's tick is the one thing they tell us; it has to show in the role.

## Rules
- Only a role of Experience, and only for a gap the person ticked for that role on the questions screen (an all-roles question answered "used" with the role among its roles).
- Rewording comes first: no new line for a gap that a line of the role, or a rewording made in the same step, already names.
- One new line per ticked gap. It goes after the role's own lines.
- Truth: the line names the gap, and every word of it stands in the role's own text (description, lines, notes, facts) or in the question the person said yes to. A line that fails is sent back once with the words that are not allowed; one that fails again is left out and the role stays as written. The usual checks (numbers, tools, tense, outcome claims, no unconfirmed guess) apply as to any line.
- It is written into the tailored CV like any change and can be removed on the final page.

## Task 1: The writer may add a line, and the checks hold it to the answer
```
files: apps/api/src/tailor/section-prompts.ts, apps/api/src/tailor/section-pass.ts, apps/api/src/tailor/accept.ts, apps/api/src/tailor/review-item.ts, apps/api/test/tailor-write-step.test.ts
new_files: none
deps: none
size: ~130 lines
```
**Goal.** The Experience rules tell the writer when it may return `itemId: "new-bullet"`, and the user message names the gaps confirmed for the role (`confirmed`). `passProposals` keeps a new line only under the rules above (flagging unsupported words for the one retry). `mergeStep` gives each kept new line the id `new-bullet:<roleId>:<n>`, appends it to the role (a role written again starts from its Base lines, so it is added once), and records it in the review state under that id. `PATCH /v1/tailored/:id/review` with `remove` on such an id takes the line out of the role.

**Acceptance tests.** A ticked gap gets its line (CV, review state, id). Words neither the role nor the question has: sent back once with those words named, kept when the retry is clean, left out when it is not. No line for a role the gap was not ticked for. No line when a rewording in the same reply names the gap. Writing the role twice adds the line once. Remove takes it out. The prompt names the rule and the message carries `confirmed`.

## Task 2: The final page shows the new line
```
files: apps/web/src/tailor/ChangesList.tsx, apps/web/src/tailor/changes-list.test.tsx, apps/web/src/i18n/en-tailor.ts, apps/web/src/i18n/ro-tailor.ts
new_files: none
deps: Task 1
size: ~40 lines
```
**Goal.** A new line appears under its role as "New line, from your answer" with its text and "Remove"; removed, the row reads "Removed: …" and has no button. A role with only a new line is not listed among the parts left as written.

**Acceptance tests.** The row, its Remove (the review route with `remove`), the removed state, the unchanged list.

## Task 3: A skill is never replaced by another one
```
files: apps/api/src/tailor/section-pass.ts, apps/api/test/tailor-section.test.ts
new_files: none
deps: none
size: ~15 lines
```
**Goal.** Seen in the runs for this plan, now that skills changes are applied without a screen: "Anthropic Claude" came back as "Prompt Engineering" and "Business Intelligence" as "Decision Support". The prompt already says a tool's own name stays; the code now holds it: a rename of a skill is kept only when the new name has a word of the skill's own name (in any form). Anything else is dropped and the skill keeps its name (logged by id).

**Acceptance tests.** A rename to an unrelated name is dropped and logged; a rename that keeps a word stays. The earlier tests on doubled names use skills whose renames keep a word.

**Rulings made while building (all three tasks).**
- Task 1, added after the runs with the real AI: with the same two ticks, one run of three left the ticked role as written (the writer simply returned nothing for it). So a ticked gap that neither the role's lines nor the step's changes name is asked for once more, alone (`stillMissing` in the message). What comes back is checked like any change, may not touch a line the first answer changed, and a failure of this second ask leaves the first answer as it stands. A role nobody ticked costs no extra request.
- Task 1: the words check uses the role's own text and the question's words, plus a short list of words that say nothing of their own ("and", "for", "used", "with"; a few Romanian ones). English word forms are folded; Romanian ones are not, so in a Romanian CV a new line will more often fail the check and be left out. That is the safe side.
- Task 1: no upper limit on new lines per role beyond one per ticked gap and the CV's own limit of 20 lines per role.
- Task 1: the unsupported-words flag reuses the existing `guess` rule (no change to the shared schema).

- After the first reviews (both found the first point): the second ask may add a line only for a gap that is still missing, so a gap the first answer covered never gets a second line. A gap named in two letters only ("AI") is matched by those letters (it could never be matched before, and was asked for again on every write). A role that already has 20 lines takes no new line and records none. On the final page, an added line the person has reworded on the CV since is left out of the list, like any other change that no longer stands as it was made.

**Runs on the local stack with the real AI** (the owner's test job, the ticks of the earlier run: one role for "prompt engineering" and for "standard operating procedures"):
- Before this plan: the role stayed as written; both gaps ended as added skills only.
- With it, four runs: the procedures gap went into the line about change management each time it was written ("…to ensure consistent standard operating procedures…"); "prompt engineering" came once as a new line ("Used prompt engineering."), once inside the line about the voice-assisted workflow ("…using prompt engineering to automatically extract details…"), once squeezed into a list (before the rule against that was added), and once not at all (before the second ask was added).
- A new line is short because all that is known is the yes: "Used prompt engineering." The person can reword it on the CV.

## Order and checks
Task 1 → Task 2 → Task 3 → runs on the local stack with the real AI on the owner's test job (the two ticks of the earlier run) → one PR, live.

## Withdrawn the same day: no line is added to a role
27 Nov, an hour after it went live, the owner tailored another CV and got five lines on one role: "Used client services.", "Used account management.", "Used budgets.", "Used forecasts.", "Used revenue projections." What caused it, from his run's data and the code:
- The gap questions are not only about tools ("Have you built and read budgets?"), but an answer was saved as the note "Used + the question's short label" ("Used budgets"), the wording of a tool question.
- The new line had to name that label and could use only words of the role and of the question. The one sentence that passes is "Used budgets."
- One new line was allowed per ticked gap with no limit per role, and a ticked gap nothing named was asked for again. Five ticks gave five lines; no existing line was reworded.
- The same stub ("Used prompt engineering.") was seen in the local runs above and shipped anyway.

**The fix (approved by the owner).** No line is ever added: the `new-bullet` item, the words check and the second ask are removed. The ticked gaps are still named to the writer (`confirmed`), to reword a line that is already about the same work; otherwise the role stays as written. A ticked answer is saved as the question itself with "Yes" ("Have you built and read budgets?" "Yes"). A line added that day can be removed on the final page, and goes when its role is written again. "No, but I used something similar" is gone from the questions screen: it asked nothing more and did the same as "No" (the owner, on "Have you led team leads for 2+ years?": "How is 'No, but I used something similar' here?"); an earlier such answer opens as "No".

**Acceptance tests.** The note is the question with "Yes". `confirmed` reaches the writer of the ticked role only, and the prompt says never to add a bullet. A `new-bullet` the writer sends is dropped. A rewording that names the gap is applied. A line added on 27 Nov can be removed and goes when its role is written again. The questions screen has one "No"; an earlier "similar" opens as "No".

Not part of it: the duplicated "Page speed, navigation, and UX improved." in the same screenshot is in the owner's Base CV as it stands (the tailoring did not touch that line).
