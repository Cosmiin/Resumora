# Career facts, enrichment and bilingual matching — proposal v1

Date: 2026-10-23. **Everything described as proposed below is a recommendation/hypothesis**, not implemented functionality or an approved release reduction. Authority for two titles, separate skill groups, fact confirmation, five keyword statuses and independent interface/document languages is the approved product baseline. External evidence: [Europass profile](https://europass.europa.eu/en/create-europass-cv), [Teal guided bullets](https://help.tealhq.com/en/articles/14435725-how-to-write-achievement-based-bullet-points), [ESCO concepts](https://esco.ec.europa.eu/en/about-esco/what-esco) and [non-preferred terms](https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/non-preferred-term), all accessed 2026-10-23. They support feasibility of the patterns, not accuracy of our implementation.

## One source of career facts

Proposed workflow: upload or manual input → extracted draft → inspect raw evidence beside structured facts → confirm/correct → versioned Base CV. Unconfirmed extracted facts cannot quietly become trusted assertions because a generation reused them. Separate a user's confirmation from independent verification: we do not authenticate degrees or employers merely because the user confirms text.

Maintain original fact/source IDs through edits and generated variants; store source document/span, extraction confidence/warnings, user answers, confirmation state/time and transformation linkage. Generated wording is a draft linked to confirmed facts, not a new fact. The original document and its retention policy are distinct from the normalized profile. Store only necessary evidence, never ask for confidential employer documents just to substantiate an ordinary bullet.

Two positioning titles describe professional focus; employment titles stay as actually held. Professional Skills and Technical Skills are independent editable groups; tools can be subcategories. A user with no meaningful second title should not be forced to invent one; baseline's display/requiredness interpretation remains D-10. Dates support year-only and unknown month without guessing. Relevant years use union of confirmed intervals and uncertainty, not summed overlapping roles.

Each job has its own parsed requirements and tailored versions. Approval of a job-specific rewrite does not overwrite Base CV. If enrichment discovers a new fact, offer an explicit scoped “save this fact to Base CV” action and preview its effect. Undo/history must restore facts and presentation independently where practical.

## Enrichment that seeks evidence

Offer short structured forms and a guided conversation as two routes to the same fields. Suggested first interview: three to five optional questions ranked by the current gap, with skip/unknown/save-and-return. Avoid an open-ended mandatory interrogation before the user sees useful output. This question count and ordering are hypotheses for UX testing.

| Missing context | Proposed question | Safe output when unanswered |
|---|---|---|
| Individual contribution | What did you personally do, and what did the team do? | Keep supported contribution; do not upgrade participation to leadership. |
| Systems/technology | Which systems/tools did you use, in what task and approximately when? | Do not infer Salesforce from “CRM” or PLC from “automation.” |
| Scope | How many users/sites/projects, what cadence, which stakeholders? | Plain scope wording; omit numbers if unknown. |
| Result | What changed in time/cost/errors/revenue/service quality? What can you substantiate? | Action + context is useful without a fabricated result. |
| Measurement | Is this number measured, a user estimate, a range or unknown? What period/baseline? | Preserve estimate/range label, or omit metric. |
| Team impact | Were you accountable for the outcome or contributing to a shared result? | Attribute team result accurately. |

Synthetic example: user confirms “Built weekly SQL reports for service managers; I don't know hours saved.” A permissible draft is “Built weekly SQL reports for service managers to support service reviews.” “Saved 40% of reporting time” is unsupported and must never be offered as a confirmed achievement. Ask about time only if useful; don't force a numeric outcome for a score. Teal's help explicitly warns AI metrics can be inaccurate; our differentiation hypothesis is structural prevention plus evidence review, not merely a warning.

## Keyword pipeline — minimal, explainable proposal

1. **Structure the job once.** Preserve original text, source URL if supplied, capture time, language and relevant spans. Separate responsibilities, qualifications, benefits/employer boilerplate and application constraints. Requirements can be required, preferred or unspecified; ambiguity remains reviewable. Detect negation and OR/AND alternatives before scoring.
2. **Extract phrases, not just tokens.** Preserve “business process analysis,” “Power BI,” “C++,” “.NET,” level and duration. Keep eight baseline categories: professional skills; technical skills; software/tools; domain knowledge; certifications/qualifications; responsibilities; industry terminology; seniority. Classification may be multi-label, while score contribution is deduplicated by concept/requirement. Professional skill is not synonymous with an unsubstantiated personality adjective.
3. **Normalize conservatively.** Unicode/case/spacing and known punctuation variants; retain original RO diacritics. Accent-insensitive lookup may help search, but must not destroy source text or become unrestricted fuzzy equality. Word boundaries prevent Java→JavaScript and R→every letter r. Preserve product versions/certification levels where material.
4. **Map equivalents with evidence.** Seed limited RO/EN aliases from versioned ESCO preferred/non-preferred concept labels plus a reviewed software/acronym table. Match concept IDs, not translated surface strings alone. ESCO can be downloaded/accessed via [Commission APIs](https://esco.ec.europa.eu/en/use-esco/use-esco-services-api); confirm dataset reuse terms, pin release and inspect coverage before shipping. The local API is marked for replacement; no need to operate its service for a small dictionary.
5. **Escalate uncertain equivalence.** A model may propose aliases with confidence/reason/spans, but must not grant a credential or experience claim. Curated relation strength: exact; accepted equivalent; broader/narrower related; uncertain. Owner-directed OAF-03 now allows demonstrated/accepted-equivalent 1.00, confirmed limited-detail claim 0.75 and supported reviewed transfer 0.40; not-evidenced/unconfirmed 0. Related evidence cannot satisfy an exact mandatory credential unless permitted equivalence is actually supported. Ambiguous/unreviewed relations remain questions, and embeddings are not proof. [Current owner contract](owner-feedback-round1.md).
6. **Rank from the job.** Required phrases and direct responsibility evidence precede preferred/unspecified; repeated mentions provide bounded supporting evidence after deduplication. Do not treat frequency in duplicated boilerplate as importance. No invented employer weights. Architecture supplies provisional weighting/calibration; users may correct job interpretation with version history.
7. **Match confirmed facts and chosen content separately.** A genuine skill omitted from this document is a presentation opportunity, not a career deficit. Preserve source support for every matched concept. “Familiar with” versus “led in production for five years” is not automatically equal proficiency.

### Five display statuses, with independent internal dimensions

Baseline requires five statuses. Proposed disambiguation for architecture/UX cross-review (D-11): store factual state, inclusion state and relation type separately; display an equivalent badge even when primary status is “included.” This avoids information loss where an equivalent can also be omitted.

| Baseline status | Operational meaning proposed | Action |
|---|---|---|
| Included in tailored CV | Selected wording has supported exact/accepted-equivalent evidence | Show source + location; no repeated-use bonus. |
| Verified Base fact omitted | Confirmed supporting fact exists, not selected in tailored version | Offer include/rephrase with change review. |
| Verified equivalent expressed differently | Accepted equivalence with confirmed support; show literal wording and relation | Explain why equivalent; optionally use employer term naturally. |
| Potentially relevant, awaiting confirmation | Extracted/unconfirmed/ambiguous related evidence | Ask a specific question; no confirmed-match credit yet. |
| Missing/unsupported | No confirmed supporting fact after review | Show gap; do not insert skill/credential. Absence of evidence is not proof the person lacks it. |

Synthetic RO/EN examples: “analiză de procese de afaceri” ↔ “business process analysis” may be a reviewed concept alias; “SQL” ↔ “SQL” is literal; “Power BI” omitted from selected skills stays supported in Base; generic “automatizare” does not prove PLC programming or Power Automate. A Romanian diploma label is not automatically a foreign professional license. “Python OR R preferred” is one alternative group, not two mandatory gaps. “Java not required” is not a missing required skill. Language detection and translation do not establish equivalence on their own.

## Section and achievement recommendations

Each recommendation should include job requirement/span, relevant confirmed facts, where they currently appear, proposed section/change, remaining questions and qualitative benefit. Use “could make this evidence clearer,” not a promised score/interview uplift. Recalculate only after approved changes using frozen rules.

| Situation | Proposed recommendation | Guard |
|---|---|---|
| Junior has a relevant confirmed academic project | Suggest Projects, show project facts and its relevant tool/method | No invented client/outcome; don't require paid work. |
| Job requires a license mentioned only in an unconfirmed upload | Ask user to verify qualification, issuer/date/expiry if relevant | Don't add an empty Certifications section or declare requirement met. |
| Confirmed achievement buried in old role | Offer to select that bullet or surface it in summary with attribution | Keep employment chronology truthful; role omission/reorder is explicit. |
| Job needs stakeholder communication; Base describes a workshop | Ask audience/action/outcome, then propose supported bullet | No automatic “excellent communicator” evidence from a skills list. |
| No supported fact for a preferred tool | State gap or ask about real experience | No invented section to inflate completeness. |
| User cannot quantify outcome | Use action + scope/method; optional evidence question | No number required; never synthesize percentages. |

## Cost-aware reliability — hypotheses for architecture's model

Persist structured job extraction and fact/alias matches by version; rescore deterministic edits locally/server-side without another model call; send only the selected role, supporting facts and relevant requirements for a bullet rewrite. Do not send contacts to a text-generation call that does not need them. Cache within the user's authorized data boundary, not across private profiles. Deduplicate unchanged imports; debounce edits; bound output and retries; record operation/model/prompt version and usage. These are proposed mechanisms, not measured savings. Architecture owns numerical model/infrastructure/Stripe costs and privacy/provider feasibility.

Proposed semantic regression set: RO/EN aliases and accents, negation, required/preferred ambiguity, OR alternatives, supersets versus exact tools, expired/partial certifications, overlapping years, omitted supported skills, title changes, repeated boilerplate, inserted unsupported metric and provider extraction failure. Evaluate precision/recall and unsupported-claim rate separately; a higher aggregate score cannot hide a newly fabricated fact.

## Owner-directed semantic outputs — inbox 006

The current discovery contract has independent Candidate Fit over all confirmed profile evidence and CV Match over only selected document evidence. Eligibility and readability are separate; readability stays Not tested until actual rendered extraction. Rewriting/reordering alone cannot increase Candidate Fit. Record limited-detail self-report versus demonstration without equating user confirmation with independent verification. The five baseline display statuses remain an inclusion/confirmation/match-type presentation problem (D-11), not replaced by the four numeric evidence strengths. Full formula/acceptance traceability and preserved exact feedback: [owner-feedback-round1.md](owner-feedback-round1.md). Computed v2 examples await architecture.

## Strategy round 1 additions — immediate review and application context

[SRF-01–06](strategy-review-round1.md) supersedes a job-only entry loop: every created/uploaded Base gets immediate canonical structure/content diagnostics and practical questions for each section, without needing a job. User answers become facts only after confirmation; unknown metrics/dates remain unknown. Five-category document readiness is distinct from Candidate Fit/CV Match, eligibility and actual PDF readability. Architecture must define any readiness number/N/A behavior; no proprietary score copied.

Applications link job and selected CV/export versions, user-entered professional contacts and next actions. LinkedIn review is a requested supplied-text/manual-input discovery flow; edits/new facts require explicit promotion, not automatic external changes or scraping. Exact record depth/capture/launch boundaries D-13/14 remain open. See receipt for canonical-section question table and safeguards.
