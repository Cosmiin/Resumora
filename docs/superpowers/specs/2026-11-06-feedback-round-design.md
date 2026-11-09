# Feedback round 1: specific questions, voice polish, CV page layout

Date: 2026-11-06. Source: the user's hands-on test of `main` at `7dde331` (six notes).
Builds on `2026-11-05-focus-mode-design.md` and `2026-11-05-base-cv-enrichment-design.md`.

## The six notes

| # | Where | Note |
|---|---|---|
| 1 | Voice answer box | Remove "Your voice goes to OpenAI…". The user doesn't need to see it. |
| 2 | Voice answer box | Stray Korean characters (어, 비) in transcripts. Text should fade in, not pop in. |
| 3 | Brain dump | "What did a normal week here look like?" is too general. Questions should fit the role or its bullets. |
| 4 | Improve flow | The main path should be specific questions with answer options. Free talk is the fallback, not the start. |
| 5 | Improve flow | "What else can you tell us about this?" is too general. |
| 6 | CV page | Role scores sit half off the page. The right panel is too far away and cramped. |

## Decisions (made with the user)

| # | Decision |
|---|---|
| 1 | The main path is **per bullet with answer options**. A bullet can get **up to 3** questions; the flow moves on early when the bullet reaches 75+ or the person taps Skip. |
| 2 | **1–3 role-wide questions open the flow**, before the bullets. Their answers feed every bullet rewrite. |
| 3 | Free talk sits behind a link on every question screen: *"Questions not specific enough? Describe what you did there in your own words."* |
| 4 | The fixed follow-up "What else can you tell us about this?" is **removed**. A failed attempt returns a new specific question for the gap that is still missing. |
| 5 | The OpenAI line is removed now. A privacy policy that names OpenAI is a **separate task before public launch**. |
| 6 | Transcripts drop characters outside the Latin script. New words fade in. |
| 7 | Role score: **a pill right after the job title**, inside the page (mockup option A). Not in the PDF. |
| 8 | Right panel: **docked next to the CV**, the pair centred, the panel wider and roomier (mockup option A). |

## 1. The improve flow (notes 3, 4, 5)

### Order
1. **Role step** (new): up to 3 role questions, one per screen, same layout as a bullet question. Eyebrow "About this role · 1 of 2". Each answer is saved as a role note (`setNote`, as today). Skip moves on. No rewrite happens on this step.
2. **Bullet steps**: the queue as today (weakest first; `standOut` mode unchanged). For each bullet:
   - Show its stored question with options. On **Improve this bullet →**, save the answer and call `improve-bullet`.
   - Proposal beats the current bullet → proposal step and celebration, as today. Then next bullet.
   - Proposal doesn't beat it → *"We need a bit more detail to improve this one."* with the **`nextQuestion`** from the response (see API). Up to 3 questions per bullet per session, then move on.
   - Bullet already at 75+ after a **Use this** → next bullet.
3. **Roles with 0–1 bullets**: the role step runs, then `brain-dump` is called with the role answers as its input (no typed ramble needed), which creates the first bullets. If every role question was skipped, open the free-talk screen.

The "Thin roles open on the brain dump" rule from focus mode (0–2 bullets) is replaced by step 3.

### What the questions should find out
The goal of every question is to help a recruiter understand the role and what the person actually did there. The score and improve prompts ask about these topics, in this order of priority, picking the ones the role's bullets leave unknown:

| Topic | What it finds out | Example question (adapted to the role) | Example options |
|---|---|---|---|
| **Tools** | Software, platforms and methods used. Shows a recruiter which tools the person already knows. | "Which tools did you use to run payroll at Vecteur?" | the tools named or typical for the role, e.g. "Excel", "SAP", "Workday" |
| **Reporting line** | Who the person reported to. | "Who did you report to?" | "The CEO", "A department head", "The agency owner" |
| **Leading people** | Whether people reported to them, and how many. | "Did anyone report to you?" | "No", "1–5 people", "6–20", "20+" |
| **Who they worked with** | Teams, clients, partners, stakeholders. | "Who did you work with most on the integration platform?" | "Business users", "External vendors", "Finance" |
| **Processes** | What they ran, owned or set up, and how often. | "Which processes did you own end to end?" | from the bullets, e.g. "Payroll prep", "Onboarding", "Vendor contracts" |
| **Scope** | Size and reach: sites, countries, budget, volume (ranges only). | "How many employees did the workflows cover?" | "Under 50", "50–200", "200+" |
| **Results** | What changed because of their work (`result` kind, as today). | "What changed after the new workflow?" | "Faster", "Fewer errors", "Lower cost" |

- **Role questions** (the 1–3 that open the flow) come from the first four topics: tools, reporting line, leading people and who they worked with. Those apply to the whole role.
- **Bullet questions** pick the topic that bullet is missing most: usually processes, tools or scope for `detail`, and results for `result`.
- A topic the CV already answers is never asked again, either in the bullets or in earlier answers in this session.
- Answers about tools are also offered to the Skills section later (out of scope here; noted for tailoring).

### Answer options
Every question (role or bullet) has **3–4 options** plus a fixed **"Something else"** chip that focuses the text box. The rules from the enrichment spec stay:
- options come only from the role's own words and the job's common tasks, and are guesses for the person to confirm;
- several can be picked; picking fills the box, picking again removes it; chips never submit;
- numbers only as ranges (`10–50`, `Under 10`, `50+`); `isAllowedOption` keeps dropping the rest;
- `via: "pick"` is recorded as today.

A question that ends up with fewer than 2 options after filtering still shows, with only "Something else".

### Free talk
- Link under the answer box on every role and bullet question: *"Questions not specific enough? Describe what you did there in your own words."* It opens `BrainDumpStep` for the role; finishing it returns to the queue.
- `BrainDumpStep` heading becomes *"Tell us about your time as {title} at {company}"* (fallback *"Tell us about this role"* when a part is empty). Template text, no AI call.
- Its 4 starter chips become role-aware templates: *"What did you handle as {title}?"*, *"Who relied on you at {company}?"*, *"Anything you fixed or set up?"*, *"Which tools did you use?"*. They stay prompts only (they don't fill the box), as today.

### Data and API
- **Policy `score/3`.** `RoleResult` gains `roleQuestions: { id, text, options, kind: "role" }[]` (max 3). The score prompt asks for role questions about what the bullets leave unknown (scope, who it served, team, tools) and for **3–4 options on every question**, not only result questions. Bumping the policy re-grades each CV once (one AI call per role). Old rows parse with `roleQuestions: []`.
- **`improve-bullet`** response gains `nextQuestion: { text, options } | null`, filled only when the proposal doesn't beat the current bullet. The same model call writes it (prompt: "if the rewrite can't improve without new facts, ask one question for the missing fact, with options"). No extra call.
- **`brain-dump`** accepts the role answers as input when no ramble note exists.
- Role answers are already notes on the role, so `improve-bullet` and `role-facts` see them with no change.
- `enrich.focus.followUpQuestion` and the free-text fallback are removed.

## 2. Voice (notes 1, 2)

- Remove `enrich.voice.notice` and its rendering in `AnswerBox` (the UI copy is English only).
- **Script filter** in `useVoice`, applied to every delta and final transcript: drop characters matching `\p{Script}` other than `Latin`, `Common` and `Inherited` (keeps ă â î ș ț, digits, punctuation, spaces). Collapse the double spaces left behind.
- **Fade-in**: words added by a delta render in a span that fades from 0 to full opacity over 300 ms. Provisional words stay grey, as today. With `prefers-reduced-motion`: no fade. The text area stays editable; the fade lives in the live preview, and the final text lands in the box as plain text.

## 3. CV page (note 6)

- **Score pill**: in `CvDocument`, the role score moves from the left gutter into the heading row, right after the job title: pill shape, green ≥ 75, marigold below, `aria-label` "Role score 84". Editor only; not printed (`@media print` hides it, and the PDF render omits it).
- **Panel**: the editor layout becomes one centred row: CV page, a 24 px gap, panel. The panel is 340 px wide, sticky, with 14 px body text, 10 px row padding, and the "Custom section" select at full width on its own line, with **Add section** below it. Under 1100 px the existing `BottomSheet` behaviour is unchanged.

## Out of scope
- The privacy policy page (separate task before launch).
- Changing the scorer's grading itself, the celebration, the ✨ button, tailoring.

## Errors and edge cases
| Case | Behaviour |
|---|---|
| Score result has no role questions | Role step is skipped. |
| `nextQuestion` is null on a failed attempt | Move to the next bullet (no generic question). |
| Every option filtered out | Only "Something else" shows. |
| Transcript is entirely non-Latin | Box unchanged; no empty words added. |
| Old `cv_insights` rows | Stale under `score/3`, re-graded once on next open. |

## Testing
- Shared: `score/3` schema parses old rows with `roleQuestions: []`; option filter unchanged.
- API: score prompt result with role questions is stored; `improve-bullet` returns `nextQuestion` only on a failed attempt; `brain-dump` from role answers.
- Web: role step before bullets; up to 3 questions per bullet then next; early move at 75+; free-talk link opens and returns; role-aware dump heading; no `followUpQuestion` string anywhere.
- Voice: the filter keeps "Am lucrat cu ăâîșț" and drops "어 Yeah" to "Yeah"; fade spans present, absent under reduced motion; no OpenAI notice.
- Page: score pill in the heading row and absent in print; panel docked and centred at 1440 px; bottom sheet under 1100 px.
- Manual check in the browser at the end, with the user.
