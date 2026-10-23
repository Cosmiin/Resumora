# Decision-review blueprint — seven questions inside one UX journey

2026-10-23. For Firstmate relay to UX. **New proposal; deferred v1 is not being resubmitted for blanket approval.** [Shared journey/critique](journey-map.md), [full cards for embedding](decision-interview.v2.json), [release options](release-options.md), [snapshot-only operating implications](cost-implications.md).

## Review contract

One UX-owned entry. Start with Mara trying to prepare a job-specific CV; show what to click, what changes and what comes next. Use one persistent decision tray that follows the current journey step. Show a relevant question after its tradeoff has been experienced, not fourteen cards upfront. The demo continues without an answer. Recommendations are visible but **never preselected**; trying alternatives changes local state, then an explicit Queue/Submit commits one advisory answer with stable question/D-ID. Firstmate records exact words; no answer automatically releases implementation.

Owner-directed behavior is not re-asked: canonical structure/two skill groups/titles, manual/AI skills with Append/Replace/Undo, contribution/results before rewrite, month/year/duration with uncertainty, immediate section guidance, added application/LinkedIn/capture aims, latest CV/tailored status/search/sent count and ATS1.1 semantics. Explain unresolved depth/timing rather than whether those features exist in discovery.

## First round — seven consequential questions


**1. I2-Q01 / D-06 / J1 — Which candidate group should validate the first journey?**

Options: A Experienced RO/EN applicants with a target job; B Juniors and career changers first; C Mixed general audience from the start. **Recommend A as a provisional validation slice**: reuse the existing coherent Mara story, while keeping junior/career-change edge cases. No demand evidence establishes this segment.

Implication: Job-specific focus and Base-only guidance are already directed, not re-opened. The choice changes the first examples and acceptance corpus. Cost: no numeric delta established; a broader scenario set increases evaluation/support scope. Status: unresolved; prototype alternatives without treating Mara as a validated market segment.


**2. I2-Q02 / D-09 / J3–J4 — How much improvement must happen before the user can continue?**

Options: A Review first; questions progressively beside sections; B Complete a required interview first; C Only ask on demand. **Recommend A**: Give the immediate diagnostic requested by the owner, then one concrete improvement at a time.

Implication: Prototype all section routes and skip/unknown; draft-save, confirmation and export gates remain distinct. Cost: More interview turns can increase inference; the v2 onboarding scenario models 12 turns, not measured demand. Avoid full rewrites on every answer. Status: unresolved, alternatives can be prototyped now.


**3. I2-Q03 / D-03 / J5 — What should the matching result emphasize first?**

Options: A Action plan first, numbers and method expandable; B Candidate Fit and CV Match comparison first; C Full assessment dashboard first. **Recommend A**: Preserve all directed meanings while helping the user act. This is an untested comprehension recommendation.

Implication: Five-category document readiness stays available; no job-dependent score without a job, no profile Candidate Fit when missing, no guessed readiness number. Cost: Accepted mappings can be reused for CV projections per architecture; UI disclosure does not justify new AI calls. Readiness arithmetic is not yet supplied. Status: unresolved, alternatives can be prototyped now.


**4. I2-Q04 / D-13 / J7 — When should an application workspace exist?**

Options: A Create a lean record when a job is added; B Create only after the user chooses Track; C Full board/reminders/reporting at first release. **Recommend A**: Preserves the owner's application-management aim without requiring contact administration before a CV is useful.

Implication: Lean workspace includes latest CV/tailored label, search/sent count, optional contact and manual next action; sent snapshot history stays separate. No automatic messages/applications. Cost: Plain records do not inherently require model calls; incremental storage/reminder/notification costs are not quantified in the relayed model. Status: unresolved, alternatives can be prototyped now.


**5. I2-Q05 / D-01 / J5 — What job-capture boundary should the first release support?**

Options: A Focused consented capture plus paste/manual recovery; B Broad multi-site URL/extension automation; C Phase capture after a stated pilot milestone. **Recommend A**: Keeps the requested capture capability in a bounded candidate; UX/architecture must validate authentication/permissions and recovery.

Implication: Capture only requested job content; no history/cookies/background scraping or bypass. Stage option needs explicit owner disposition. Cost: Extension maintenance/fetching and job-extraction changes are not isolated as a measured cost in v2. Do not infer them from token rates. Status: unresolved, alternatives can be prototyped now.


**6. I2-Q07 / D-05 / J6 — Where can a future access/usage prompt appear after useful work?**

Options: A After Base advice and one job-CV comparison/preview; B After Base advice, before job matching; C Before meaningful review. **Recommend A**: Matches UX's recommendation to demonstrate the job-specific result before commercial friction; this is not a selected free entitlement or price.

Implication: Meter operations, show clear limits/retry behavior; no real checkout in discovery and no automatic paid upgrade. Cost: OpenAI inference is paid; fully-free runtime unproven. Known managed subtotals are scenario estimates, not a price/complete business cost. Status: unresolved, alternatives can be prototyped now.


**7. I2-Q14 / D-12 / J6 / pilot recovery — If a pilot AI/export action reaches a limit, what recovery policy is acceptable?**

Options: A Bounded queue/pause with manual recovery; B Explicit owner-approved paid tier within a spending cap. **Recommend A**: Matches the free-first objective and no-upgrade-without-approval constraint; measurement and an explicit ceiling can later permit B.

Implication: Demo queued/failed/retry/manual paths; before a real pilot agree comprehension and ATS/PDF/provenance acceptance evidence. Technical pass counts alone did not resolve owner confusion. Cost: Worker Free modeled 50ms exceeds 10ms allowance; burst rendering can exceed daily quotas. Relayed managed costs are incomplete scenarios, not permission or a selected cap. Status: unresolved, alternatives can be prototyped now.


## Progressive decisions — only when relevant

The full JSON has 2–3 options, consequences, recommendation, fixed direction and scope/cost for every D-ID. Show these under “More decisions for this step,” not as another mandatory interview.

| Decision / card | Step | Concrete question and recommendation |
|---|---|---|
| D-02 / I2-Q08 | Import | Text PDF/DOCX/manual recovery versus OCR now; recommend bounded input with immediate recovery, OCR explicit launch choice. |
| D-04 / I2-Q09 | Preview/export | One polished PDF/style presets, two layouts or DOCX also; recommend one fully tested output candidate, exact scope open. |
| D-07 / I2-Q10 | Return/cancellation | Manual edits/basic access versus read-only+export; recommend continuity, commercial/retention details open. |
| D-08 / I2-Q11 | Import/privacy | Short disclosed original-file recovery window versus opt-in longer storage; recommend minimization, actual period/processing terms unresolved. |
| D-10 / I2-Q12 | Editing | When a second truthful title is unknown, allow continuation with visible question versus require completion before export; two fields/dates are already directed. |
| D-11 / I2-Q13 | Matching | Action “Add from Base” + evidence badge versus expert keyword table; recommend action-first, all evidence/inclusion dimensions preserved. |
| D-14 / I2-Q06 | LinkedIn side route | Supplied own-profile text versus extension import; recommend text review first candidate with explicit scope, capture option open. |

## UX wiring and acceptance

Entry: explain job-specific outcome and Base-only alternative; immediate useful diagnostic after upload/manual. Section: before/after skills and bullet, Append/Replace, Undo visibly working; contribution/result prompt first. Job: capture-preview-correct fallback; action-first matching and persistent hard-gap warning. Finish: full-size CV/realistic page behavior, honest export/readability states and optional LinkedIn return. Application: exact CV, optional contact and editable next step; returning user resumes here.

Use the same Mara/HR Automation Specialist at Northstar People case proposed by architecture, with fixture IDs confirmed by UX before using architecture scores. Costs/technical methodology are supporting views, not candidate-facing jargon. UX owns the 50 queued layout repairs; actual full-size desktop/mobile screenshots and meaningful end-to-end interactions must support comprehension. Check counts are insufficient by themselves.

Firstmate routes scoped answers into D-01–14, keeps approved-direction/added/deferred/unresolved distinct and owns any later implementation approval. Await UX entry/fixture pointer; this does not block independent prototype alternatives.

Terminal SRT2-01: latest CV with tailored status, search and sent count are directed, not optional interview items. Old strategy review was acknowledged terminal/retired; do not reopen. Use UX integrated entry for iteration 2.
