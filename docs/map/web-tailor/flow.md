---
id: web-tailor/flow
area: web-tailor
files: ["apps/web/src/tailor/TailorFlow.tsx","apps/web/src/tailor/tailor-flow.test.tsx","apps/web/src/tailor/projects-step.test.tsx","apps/web/src/tailor/final-touches.test.tsx"]
depends_on: ["web-tailor/flow-state","web-tailor/client-run","web-tailor/client-section","web-tailor/flow-redo","web-tailor/question","web-tailor/section-review","web-tailor/role-review","web-tailor/done","shared/tailoring","web-editor/cv-api","api-tailor/accept","api-tailor/section-pass"]
contract: false
checked_hash: 6d94b265
decisions: []
open: []
---
Drive steering, questions, generation, acceptance and completion from the server run.

- Run tracking updates a ref and React state together; role API arguments come from the ref only for role sections. `apps/web/src/tailor/TailorFlow.tsx:48` -> `track`
- On resume, done or absent currentSection finishes; waiting_user and layout call the run endpoint again; other states ask questions. `apps/web/src/tailor/TailorFlow.tsx:60` -> `enter`
- No returned questions goes straight to generation; otherwise a fresh indexed draft array starts. `apps/web/src/tailor/TailorFlow.tsx:70` -> `askQuestions`
- Answers are sent before generation, with retry preserving the submitted answers. `apps/web/src/tailor/TailorFlow.tsx:78` -> `sendAnswers`
- An empty final-section proposal list automatically accepts empty decisions, inferred and flags; its tick appears only after acceptance succeeds. `apps/web/src/tailor/TailorFlow.tsx:85` -> `runSection`; `apps/web/src/tailor/TailorFlow.tsx:94` -> `acceptSection`
- Acceptance updates the score; role acceptance pauses on roleDone with the returned next run before entering it. `apps/web/src/tailor/TailorFlow.tsx:105` -> `acceptSection`; `apps/web/src/tailor/TailorFlow.tsx:113` -> `roleDone`
- job_not_found clears the stored run and shows deleted; ai_failed gets section-specific text only when a section is supplied, while other failures show generic retry. `apps/web/src/tailor/TailorFlow.tsx:52` -> `job_not_found`
- No remembered id opens steering; a remembered id is fetched and entered, with failure exposing retry. `apps/web/src/tailor/TailorFlow.tsx:181` -> `load`
- Scores, Base CV and job load independently; their failures are swallowed, so the flow can fall back to plain review lists. `apps/web/src/tailor/TailorFlow.tsx:191` -> `getScores`; `apps/web/src/tailor/TailorFlow.tsx:198` -> `getCv`
- TailorFlow loads the Base CV itself and falls back to English while its locale is unavailable; QuestionCard also defaults to English when passed an undefined locale. `apps/web/src/tailor/TailorFlow.tsx:198` -> `getCv`; `apps/web/src/tailor/TailorFlow.tsx:219` -> `locale`; `apps/web/src/tailor/TailorFlow.tsx:286` -> `locale`; `apps/web/src/tailor/QuestionCard.tsx:33` -> `locale`
- Next and Skip update indexed drafts; only the last question sends the whole question set, filling missing answers as skips. `apps/web/src/tailor/TailorFlow.tsx:270` -> `answerWith`
- Role/project/volunteering questions use kind-filtered step order for progress; available role data selects RoleReview over SectionReview. `apps/web/src/tailor/TailorFlow.tsx:277` -> `kindOrder`; `apps/web/src/tailor/TailorFlow.tsx:287` -> `isRoleSection`
- tested by `apps/web/src/tailor/tailor-flow.test.tsx:59` -> `describe`
- tested by `apps/web/src/tailor/projects-step.test.tsx:42` -> `describe`
- tested by `apps/web/src/tailor/final-touches.test.tsx:50` -> `it`

## Connections

- Advanced sections/roles are rejected by the server with 409, but fail shows generic retry without refreshing the run; acceptance retry restores the saved review phase and its old proposals instead of fetching current proposals. `apps/api/src/tailor/accept.ts:95` -> `section_not_current`; `apps/api/src/tailor/section-pass.ts:32` -> `role_not_current`; `apps/web/src/tailor/TailorFlow.tsx:51` -> `fail`; `apps/web/src/tailor/TailorFlow.tsx:122` -> `setPhase`

- Used by /jobs/:id/tailor. `apps/web/src/router.tsx:21` -> `TailorFlow`; `apps/web/src/tailor/TailorFlow.tsx:25` -> `TailorFlow`
- Uses the server's ordered sections, with shared order experience, projects, skills, summary, achievements, courses, publications, interests, languages, layout; shared filtering omits empty projects and light sections. `apps/web/src/tailor/TailorFlow.tsx:302` -> `run.sections`; `packages/shared/src/tailor.ts:25` -> `experience`; `packages/shared/src/tailor.ts:55` -> `TAILOR_SECTIONS.filter`
- Uses global tailor-mode fixed positioning and is-wide sizing for contextual questions. `apps/web/src/tailor/TailorFlow.tsx:297` -> `tailor-mode`; `apps/web/src/styles/tailor.css:3` -> `.tailor-mode`; `apps/web/src/styles/tailor.css:66` -> `.tailor-mode.is-wide`

## Assumptions

- Displayed comparison wording comes from getCv (the current Base CV), while server run state controls progress; the browser does not persist unfinished question drafts. `apps/web/src/tailor/TailorFlow.tsx:198` -> `getCv`; `apps/web/src/tailor/TailorFlow.tsx:72` -> `answers`
