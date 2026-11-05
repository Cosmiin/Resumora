# Focus mode: improve one bullet at a time, and see the score go up

Status: approved in brainstorming, waiting for spec review · 2026-11-05 · builds on `2026-11-05-base-cv-enrichment-design.md` (the "enrichment spec" below)
Source: the review of the local site on 2026-11-05 (`../../../../review-notes.md`, points #1–#6), turned into a design with the user.
Mockups (the source of truth for look and motion): `reference/focus-mode/` next to this file. They are HTML fragments made for the brainstorming viewer, so open them in a browser to see the layout and motion; the page frame around them is not part of the design.
- `focus-layout.html`, option **B** (full-screen focus mode)
- `braindump-voice.html`, the brain dump screen + cue **A** (3-2-1 countdown)
- `celebration.html`, option **B** (a short full-panel moment with confetti)

## Why

The enrichment project made the score, the questions and the rewrites real. Using it showed four problems:

1. **The side panel is cramped** for answering questions, and you lose sight of the bullet the question is about.
2. **Answers feel disconnected.** You answer three questions, then rewrite the whole role, and you can't tell which answer did what.
3. **A rewrite can leave the score flat**, because it isn't checked against the score before you see it. And a good score (80) leaves nowhere to go, because the only way past 80 is a result (a number, scale, frequency or reason), and nothing asks for one.
4. **Thin roles** (one line, "Managed the office.") have no way in: the questions need bullets to ask about.

Goal: improving a CV feels guided and rewarding. Each answer turns into a visibly better bullet right away, every accepted change raises the score and is celebrated, a good score still has a path to 100, and a thin role can be filled by just talking.

## Decisions (made with the user)

| # | Decision |
|---|---|
| 1 | Questions open in a **full-screen focus mode**: the role on the left (current bullet highlighted, role score), the question on the right. |
| 2 | **Each answer immediately improves that one bullet.** No batch rewrite. |
| 3 | A proposal is **graded before it is shown** and only offered if its grade beats the current bullet ("43 → 80"). |
| 4 | Thin roles (0–2 bullets) open on a **brain dump** step. It must be obvious that rambling is fine. |
| 5 | Voice starts with a **3-2-1 countdown**, then "Start talking". |
| 6 | Every score increase gets a **short moment with confetti** (mockup option B), every time. |
| 7 | A hover **✨ Improve** button on any bullet opens focus mode on that bullet. |
| 8 | At 80+, the role offers **Make it stand out**: questions that ask for results. |
| 9 | Grading uses the **existing scorer** (approach A), never the rewrite grading itself. The number celebrated must be the number that stays. |
| 10 | When a role is finished, its answers are condensed into **hidden role facts** for tailoring later. Raw notes are kept. |
| 11 | The old whole-role streamed rewrite (`RewriteReview`, `QuestionFlow`, the `rewrite-role` route) is **removed**. The summary rewrite stays. |

## Scope

**In:** focus mode and its steps; `improve-bullet`, `brain-dump` and `role-facts` routes; the predicted-score cache (`cv_insights.pending`); one question per bullet with a `kind`; policy `score/2`; `MAX_NOTES` 25; `facts` on roles; the ✨ button; the ScoreCard change; the countdown in `useVoice`; the celebration; removing the role rewrite.

**Out (other review notes, later projects):** years of experience (#7), yellow skill suggestions (#8), the score next to each role on the page (#9), languages on one line (#10), tailoring itself, scores for projects/volunteering, an overall CV score.

## The flow

### Ways in
- **ScoreCard → Improve this role.** Starts at the weakest bullet.
- **✨ Improve** on a hovered or keyboard-focused bullet (editor only). Starts at that bullet.
- **A role with 0–2 bullets** opens on the **brain dump** step first, whichever way in was used.
- **A role at 80+:** the ScoreCard says *"Clear! Add results to stand out."* and its button is **Make it stand out** (`mode: "standOut"`). The queue holds only bullets whose impact is below `specific`, and each gets its `result` question.

### Layout (mockup `focus-layout.html` B)
- Full screen over the editor, page scroll locked, focus kept inside, ✕ and Esc close it.
- **Left column:** eyebrow "Your role", title, company · dates, the bullets with a score tag each (green ≥ 75, marigold below), the current bullet lifted (white card, marigold left border), and the role score.
- **Right column:** a progress bar (one segment per bullet in the queue), an eyebrow ("Question 2 of 4"), the question in the display font, the step's content, and the primary button bottom-right. **Skip** sits bottom-left.

### One bullet
1. **Question step:** question + `AnswerBox` (chips with ranges only for numbers, text, mic). Primary button **Improve this bullet →**. It saves the answer as a note (`setNote`), waits for autosave, then calls `improve-bullet`.
   - A bullet with no stored question goes straight to step 2 (the rewrite uses what is already known).
   - **Skip** moves to the next bullet without a call.
2. **While the call runs** (about 2–3 s): the current bullet on the left shimmers, and the right side shows "Improving your bullet…".
3. **Proposal step** (when it beats the current bullet): old text struck through, new text below it, both grades ("43 → 80"), **Use this** / **Keep mine**.
   - **Needs more detail** (the grade isn't higher, or the proposal failed a check): *"We need a bit more detail to improve this one."*
     - If the bullet's stored question hasn't been answered in this session, it is shown.
     - Otherwise a free text box: "Anything else about this? Numbers, who it was for, what changed."
     - Each bullet gets at most **two** improve attempts per session. After that, the session moves to the next bullet.
4. **Use this:** `replaceBullet` (one undo step), then the **celebration moment**:
   - mockup `celebration.html` B: the panel fades to white, the role score counts up from the old to the new value (about 1.4 s, ease-out), a confetti burst in brand colours, one line of praise ("Up from 52. Nice work! 🎉"), one line of context ("Your Dispatcher role is almost in the Clear band." / "…is now Clear." / "…scores 100."), and **Keep going →**.
   - If the role had no score before (it had no bullets), the count starts at 0 and the line says "Your role has its first score."
   - With `prefers-reduced-motion`: no confetti, and the number is shown at its final value.
5. **Keep going** moves to the next bullet in the queue. **Keep mine** moves on with no celebration.
6. **Role done step**, after the queue: "That's all for this role", the final role score, and **Back to my CV**. If notes changed during the session, closing it (or ✕/Esc at any point) fires `role-facts` in the background.

### Brain dump (mockup `braindump-voice.html`)
- Eyebrow "Tell us more · no wrong answers". Question: "What did a normal week here look like?" (role-aware wording is not needed).
- Hint: "Just talk, or type, like you're explaining it to a friend. Messy is fine: half sentences, lists, whatever comes to mind. We'll turn it into clear bullets and you pick the ones you like."
- Starter chips that **only show** as prompts (they don't fill the box): "What did you handle every day?", "Who relied on you?", "Anything you fixed or set up?", "Tools you used?".
- A big text area with an example ramble as placeholder, and a big mic button: "Tap to talk · up to 2 minutes".
- On the left, dashed empty slots: "+ new bullets will appear here".
- **Turn this into bullets →** (disabled while empty) saves the ramble as a note (question = the brain dump question, `via` as used), waits for autosave, then calls `brain-dump`.
- Result: up to 4 proposals as checkable cards, each with its grade, all checked by default. **Add selected** → `addBullets` (one undo step) → celebration if the role score went up (or got its first score). Then the normal queue continues for the role's bullets.

### Voice cue (cue A)
- Tap the mic → the countdown **3, 2, 1** (one per second, display font, pine) runs **while** the voice session connects.
- "**● Start talking**" (green pill, blinking dot) appears only when the countdown has finished **and** the audio stream is open. If connecting takes longer than the countdown, "1" stays with "Getting the mic ready…" until it is open.
- Recording: a dark pine bar with a moving waveform, a timer and a stop button. Live words below it: provisional words grey, final words dark (as today).
- Limits: 60 s for answers, 120 s for the brain dump.

## API (`apps/api/src/enrich/`)

All routes need sign-in, read the **saved** CV (never CV text from the browser), go through the AI gateway, and log one `ai_calls` row per model call. Errors keep the existing shape: `AiUnavailableError` → 503 `ai_unavailable`, bad answers after retries → 502 `ai_bad_answer`, role missing or fingerprint ≠ saved → 409 `not_saved`.

### `POST /v1/enrich/improve-bullet { roleId, bulletId, fingerprint }`
1. 409 if the role isn't saved with that fingerprint; 404 `bullet_not_found` if the bullet isn't in it.
2. Get the role's current result (cache hit or score it now, as `scoreRole` does).
3. Model call `enrich_improve_bullet`: rewrite **this one bullet** from its text, the role's title/description/other bullets (context only) and the role's notes. Same rules as the enrichment spec's rewrite rules (only given facts, CV language, verb first, tense, ≤ 2 lines, no first person, names kept, picked ranges stay ranges). Plain-text answer, one line, or `NONE` if it can't improve without new facts.
4. Checks, any failure → `needsDetail`:
   - the existing `checkProposal` rules: numbers must appear in the role's text or notes; ≤ 220 characters; not unchanged;
   - **not a repeat** of another bullet in the role (`repeatKey` equal) (counterpoint 1).
5. Grade the new bullet: model call `enrich_score` with the role, the proposal swapped in, asking for grades of **that bullet only** (the prompt gets a `gradeOnly: bulletId` line; the schema accepts exactly one bullet). Apply the same zero rules (placeholder, repeat).
6. If `after.score <= before.score` → `{ needsDetail: true }`.
7. Else build the **predicted role result**: the stored result with this bullet's grades replaced, role score recomputed with `scoreFromGrades`, `nextStep` and questions recomputed, `fingerprint = fingerprint(role with the proposal swapped in, locale)`.
   - **Skip caching** (but still return the proposal) if any other bullet in the stored result has `issue: "duplicate"`, because changing this bullet may change those (counterpoint 1).
   - Else store it with `insights.putPending(roleId, predicted)`.
8. Return `{ proposal: { bulletId, text }, bulletBefore, bulletAfter, roleBefore, roleAfter }`.

### `POST /v1/enrich/brain-dump { roleId, fingerprint }`
- 409 as above. The ramble is the role's newest note whose `question` is the brain dump question; 400 `no_brain_dump` if there is none.
- Model call `enrich_brain_dump`: up to 4 **new** bullets from the ramble, using only what it says, not repeating existing bullets. Same writing rules. Line format: one bullet per line.
- Each passes `checkProposal` + the repeat check, or is dropped.
- Grade all kept bullets in one `enrich_score` call (`gradeOnly` with their temporary ids), keep those scoring ≥ 40.
- Return `{ proposals: [{ id, text, score }], roleBefore, roleAfterAll }`. `roleAfterAll` is the score if all of them are added. No pending cache, since the user may add only some: the next background score after saving runs as normal.

### `POST /v1/enrich/role-facts { roleId }`
- Reads the role's notes. No notes → `{ facts: [] }` with no call.
- Model call `enrich_role_facts`: up to 8 short facts (each ≤ 160 characters) from the notes, in the CV's language, only what the person said. Plain lines.
- Each fact passes the number check against the notes, or is dropped.
- Returns `{ facts: string[], fromNotes: string }`, where `fromNotes` is a hash of the note ids and answers used. The **web** applies it with `setFacts`, so it is saved by autosave and lands in History like any edit. The API never writes CV content.

### Changes to existing routes and code
- **Scoring (policy `score/2`):** `MAX_QUESTIONS` 3 → 20, i.e. the result keeps every bullet's question. `Question` gets `kind: "detail" | "result"`: `result` when contribution, clarity and specificity are `specific` and impact isn't, else `detail`. The prompt adds: for a bullet whose only gap is impact, ask for a result (how many, how often, for whom, what changed), with range chips. Bumping the policy makes old `cv_insights` rows stale, so they are re-graded once.
- **`scoreRole`:** a cached main row with the right fingerprint and policy wins, as today. Else, if `pending` has an entry for the fingerprint and policy, **promote** it to the main row and return it with no model call. Else score as today.
- **Removed:** the `rewrite-role` route, `keepAsIsIds` if only it uses it, and role-only prompts in `rewrite-prompts.ts`. **Kept** (the summary uses them, counterpoint 3): `BlockParser` (`blocks.ts`), `rewriteEvents`, `sendEvents`, `checkProposal`, `checkSummary`, the summary route and prompts. The eval keeps its summary cases and drops role-rewrite cases.

## Data

### `cv_insights.pending` (one migration)
- `alter table public.cv_insights add column pending jsonb not null default '[]'::jsonb;`
- Shape: `[{ fingerprint, result: RoleResult, at: ISO }]`, at most 5 entries. Adding one with the same fingerprint replaces it; adding a sixth removes the oldest by `at`.
- `put` (the main row) never touches `pending`: the upsert sends only the main columns, so a concurrent score from another tab or the background scorer doesn't wipe predictions (counterpoint 2). `putPending` reads the row, merges and writes `pending` only.
- Existing RLS (owner only) already covers the new column. **The migration and its RLS check stay with Claude and the user** (CODEX-DELEGATION: database).

### CV content (`packages/shared/src/cv.ts`, jsonb, no migration)
- `MAX_NOTES` 10 → 25 (oldest dropped beyond that, as today).
- `ExperienceSchema` gains `facts: { items: z.array(text(160)).max(8), fromNotes: z.string(), updatedAt: ISO }` or `null`, defaulting to `null`. Old CVs parse with `facts: null`.
- `facts` is never rendered on the page, in `CvDocument`, the PDF or exports. It is kept in History, comes back on restore, and is carried over on re-import with the notes (same company + title match as notes).
- `fingerprint(role)` does **not** include notes or facts (unchanged), so saving them never invalidates a score.

## Web (`apps/web/src/cv/enrich/`)

**New:**
- `FocusMode.tsx`: the shell (portal, scroll lock, focus trap, Esc/✕, left role column, right step area). Props `{ roleId, bulletId?, mode: "improve" | "standOut", onClose }`.
- `useFocusSession.ts`: the queue and steps. Queue: `improve` = bullets by score ascending (the chosen bullet first if `bulletId`); `standOut` = bullets with impact < specific. Steps: `brainDump → question → working → proposal | needsDetail → celebrate → … → roleDone`. Tracks whether notes changed, so it can fire `role-facts` on close.
- `QuestionStep.tsx` (reuses `AnswerBox`), `ProposalStep.tsx`, `BrainDumpStep.tsx`, `CelebrateMoment.tsx` (count-up with `requestAnimationFrame`, CSS confetti, reduced-motion aware), `RoleDoneStep.tsx`.
- `ImproveButton.tsx`: the ✨ on bullet hover/focus in `EditablePage`, editor only.
- `enrich-api.ts`: `improveBullet`, `brainDump`, `roleFacts`.
- `stream-events.ts`: `onEvent` and the `Proposal` type, moved out of `RewriteReview.tsx` so `SummaryTools` keeps working (counterpoint 3).

**Changed:**
- `ScoreCard.tsx`: **Answer questions** and **Rewrite bullets** become one button, **Improve this role**, or **Make it stand out** with the line "Clear! Add results to stand out." when the role score is ≥ 80 and some bullet's impact isn't `specific`. The tips stay.
- `useVoice.ts` / `AnswerBox.tsx`: a `countdown` state between `asking` and `recording` (see "Voice cue"), and a `maxSeconds` prop (60 / 120).
- `useRoleScores.ts`: unchanged logic. Accepting a proposal changes the fingerprint, and the next score request hits the promoted pending result.
- `cvReducer.ts`: `replaceBullet { roleId, bulletId, text }`, `addBullets { roleId, texts }` (new ids), `setFacts { roleId, facts }`. Each is one undo step.
- `SectionTools.tsx`: no longer renders `RewriteReview` / `QuestionFlow`; opens `FocusMode`.
- i18n: all strings in `apps/web/src/i18n/en.ts`.

**Removed:** `QuestionFlow.tsx`, `RewriteReview.tsx` and their tests (`question-flow.test.tsx`, `rewrite-review.test.tsx`); the role-rewrite client in `enrich-api.ts`.

**Look:** "more modern" means following the mockups: generous white space, a soft radial background, 14–20 px radii, the display font for questions and numbers, pill chips, one strong pine primary button per step, marigold for "current" and "below 75", green for "improved". Uses the tokens in `styles/tokens.css` only. A new `styles/focus.css`.

## Errors

| Situation | What the person sees |
|---|---|
| 409 `not_saved` | Focus mode waits for the next "saved" and retries once without a message. If it fails again: "Saving your changes… try again in a moment." |
| 503 / 502 | "Couldn't improve this one right now", with **Try again** and **Skip**. The answer is already a note. |
| A check fails, or the grade isn't higher | The **needs more detail** step (never a broken bullet). |
| `brain-dump` returns 0 proposals | "We couldn't find new bullets in that yet. Try adding what you did, for whom, or how often." Text kept. |
| `role-facts` fails | Nothing shown. The next close with changed notes tries again. |
| Mic denied or unavailable | Mic hidden; typing and chips work. |
| 429 `voice_limit` | The existing message; the countdown never starts. |
| The role is deleted while focus mode is open | Focus mode closes. |

## Cost and speed
- Improve one bullet: 2 cheap calls, about $0.001 and 2–3 s.
- Brain dump: 2 calls, about $0.002.
- Role facts: 1 call, about $0.0005, once per finished session.
- The eval records real numbers.

## Testing

**Shared:** policy `score/2`; questions kept up to 20 with the right `kind`; `MAX_NOTES` 25; the `facts` schema and old CVs parsing with `facts: null`; facts carried over on re-import; predicted-result building (one bullet's grades replaced, score recomputed, fingerprint of the swapped role).

**API** (memory repos, fake model):
- `improve-bullet`: returns a proposal only when the after-grade is higher, else `needsDetail`; drops an invented number; drops a repeat of another bullet; 409 on a stale fingerprint; 404 on an unknown bullet; another user's role is never read.
- **Pending cache:** after `improve-bullet` stores a prediction, `POST /score` with the swapped fingerprint returns it with **no** model call and the same score; a `put` from scoring the original keeps `pending` intact; the sixth prediction drops the oldest; no caching when another bullet is a duplicate.
- `brain-dump`: at most 4, each graded, < 40 dropped, invented numbers dropped, 400 without a ramble.
- `role-facts`: ≤ 8, numbers checked against notes, no call without notes, nothing written to the CV.
- The summary rewrite still streams and passes its existing tests after the role rewrite is removed.
- Every new route logs `ai_calls`.

**Web:**
- Queue order for `improve` and `standOut`; a role with ≤ 2 bullets starts on the brain dump.
- The countdown shows "Start talking" only after the countdown **and** the open stream (fake transport); 60 s / 120 s limits.
- **Use this** is one undo step, then the celebration with the returned before/after; reduced motion shows no confetti.
- **Keep mine** has no celebration; `needsDetail` shows the follow-up.
- The ✨ button appears on hover/focus in the editor and never in `CvDocument`.
- Esc keeps accepted bullets and fires `role-facts` only if notes changed.
- `SummaryTools` still works after the move to `stream-events.ts`.

**Eval** (`apps/api/eval/enrich/`): about 6 single-bullet cases (a vague bullet + an answer; an answer with a range; an 80 bullet + a result answer; a Romanian role; a duplicate trap; an answer that adds a number not given) and 2 brain dumps (EN, RO). **Pass:** 0 invented numbers, every output in the CV's language, the after-grade beats the before-grade in at least 5 of 6, cost and speed recorded in `RESULTS.md`.

## Who builds what

Following `CLAUDE.md` / `CODEX-DELEGATION.md`:
- **Codex (via the `codex-build` skill, in a worktree):** shared schema and scoring changes, the three API routes, the pending cache in the repos, the role-rewrite removal, `useFocusSession`, reducer actions, `enrich-api.ts`, `stream-events.ts`, tests and the eval. Each task is gated by tests and an Astra review before Claude commits.
- **Claude:** the visual front end (the focus-mode components' markup, `focus.css`, the celebration and countdown motion), matched to the mockups; the migration and its RLS check; reading Codex's results; the final review.
- Claude's edits under `apps/**` are blocked by the guard unless the user lifts it for the front-end phase (see CODEX-DELEGATION.md › Guardrails). Otherwise Claude writes the visual parts as precise build briefs and Codex builds them too.

## Decision record

`docs/decisions/NNNN-focus-mode-graded-single-bullet-rewrites.md`:
- improving happens one bullet at a time in a full-screen focus mode, and every answer turns into a proposal right away;
- proposals are graded by the same scorer before they are shown, and only better ones are offered;
- the predicted role result is cached under the future fingerprint in `cv_insights.pending`, so the celebrated number is the stored number;
- the whole-role streamed rewrite is removed, and the summary keeps the streaming path;
- role facts are a derived, rebuildable summary of the notes, stored in the CV for tailoring; raw notes stay the source of truth.
