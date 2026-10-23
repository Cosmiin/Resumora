# ATS, parsing and score evidence — v1, 2026-10-23

All cited primary sources accessed 2026-10-23. IDs resolve in [sources.md](sources.md). **Vendor-documented behavior**, **vendor marketing**, and **our recommendations** are different evidence classes. No employer ATS was tested in this scout.

## What original ATS/parser documentation supports

| Evidence | Narrow verified finding | Product implication — our recommendation | Limit |
|---|---|---|---|
| [E-ATS-01 Greenhouse](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse) | Parsing fills candidate fields; failure/partial parsing can require correction. It lists image content, columns, tables, header/footer/text-box contacts and unclear sections as risks. Parser limit is 2.5 MB. | Review extracted contacts/roles/dates, keep a simple template and inspect export text order. | Risk is not inevitable failure; 2.5 MB is not a universal ATS upload limit. A failed parse is not documented automatic rejection. |
| [E-ATS-02 Lever](https://hire.lever.co/developer/documentation#supported-file-formats) | API image uploads may attach yet not parse; parsed fields are not guaranteed. | File acceptance, text extraction and field mapping need different success states. | API documentation is not proof of every hosted applicant form behavior. |
| [E-ATS-03 Greenhouse matching](https://support.greenhouse.io/hc/en-us/articles/41131886674075-Talent-Matching-FAQ) | Matching uses employer-selected/weighted calibration, groups candidates into categories and leaves advancement/rejection to people. Related terms can map to the same calibrated skill. | Preserve deduplicated concepts, evidence and rule versions; explain our job-fit estimate as our own. | We cannot know the customer's calibration from a public job ad; no numeric equivalence. |
| [E-ATS-04 Workable](https://help.workable.com/hc/en-us/articles/115012087467-What-types-of-questions-can-I-add-to-my-application-form) | Employers can configure yes/no application questions to disqualify on a “No.” | Surface truthful required-qualification gaps separately from keyword coverage. | Keyword edits cannot resolve a qualification or application-answer gate. Not all employers enable it. |
| [E-ATS-05 Textkernel output](https://developer.textkernel.com/tx-platform/v9/resume-parser/overview/parser-output/) | Parser output distinguishes sections, position/education data and skill locations; optional outputs/configuration and version information exist. | Keep provenance spans, parse version, warnings and field-level confirmation. | Documented schema is not measured accuracy and is not our data license or parser implementation. |
| [E-ATS-06 Textkernel columns](https://www.textkernel.com/de/improving-extraction-from-column-resumes/) | Vendor describes column handling as a hard layout problem and reports improved handling. | Prefer a simple initial layout, later test each richer export. | This contradicts any blanket “all two-column CVs fail” claim; vendor improvement is not an independent benchmark. |

## What competitor scores measure publicly

| Tool | Disclosed signal / scale | Unknown or not transferable |
|---|---|---|
| Jobscan [E-COMP-01](https://www.jobscan.co/jobscan-tutorial) | Match priorities emphasize hard skills; degree/title/soft skills/keywords follow. Measurable results/word count are advice outside match rate. | Full weights/normalization, validated employer thresholds and hiring outcomes. Its tutorial's employer-simulation claim is marketing. |
| Teal [E-COMP-11](https://help.tealhq.com/en/articles/9524748-using-the-resume-analyzer) | Resume Analyzer and Job Matcher are distinct; analyzer issues cover metrics, active bullet counts and keywords in entries. | Full job-match formula, calibration and bilingual matching accuracy. |
| Rezi [E-COMP-03](https://www.rezi.ai/rezi-docs/the-rezi-score-explained) | 1–100 readiness feedback across content, format, optimization, best practices and application readiness; explicitly distinguishes its score from what employers see. | Numeric formula and predictive validity. Older real-time guide's category count differs; don't invent one stable method. |
| Resume Worded [E-COMP-04](https://www.resumeworded.com/targeted-resume) | Job keyword comparison and Relevancy Score, with its own suggested threshold. | Employer rejection equivalence; automatic keyword rejection statements are not accepted as general ATS facts. |
| Kickresume [E-PRICE-05](https://www.kickresume.com/en/pricing/) | Checker marketed as comparing with successful resumes. | Training/reference selection, ground truth, weighting and performance by language/occupation. |
| Enhancv [E-COMP-06](https://enhancv.com/pricing/) | ATS checks, content suggestions and job-match features advertised. | Complete formula/thresholds and all-employer readability. Vendor “ATS compatible” assurance is not a test result. |
| TargetedResume.io [E-EM-01](https://targetedresume.io/how-it-works) | Advertises keyword coverage, required terms counted twice, same keyword list before/after. | Extraction/coverage accuracy and runtime reproducibility. Transparent formula alone does not validate a score. |
| CVExpert [E-EM-03](https://cvexpert.ro/) | Fit score/keywords advertised. | Formula, calibration and outcome validation unavailable in inspected page. |

**Conclusion supported by these differences:** scores are tool-specific summaries of selected signals. This sample does not establish a common pass mark, employer score, interview probability or “beat ATS” guarantee. A transparent formula is an auditability improvement; it is not proof of hiring validity.

## Current product score contract — directed method, calibration unproven

Use **Candidate–Job Fit** from the complete confirmed profile and **CV–Job Match** from the selected document, both 0–100 estimates. Owner feedback relayed for discovery supplies the current starting weights, evidence strengths and twelve acceptance criteria: [OAF-03 summary](owner-feedback-round1.md). These supersede architecture v1 parameters. The relayed architecture v2 worked example is documented separately in [internal evidence](iteration2/internal-evidence.md); its numbers cannot be attached to Mara until exact fixture alignment. Architecture owns implementation/validation and calibration; expose independent eligibility and **Not tested** readability. Explain six independently visible dimensions:

1. Job extraction/interpretation quality: requirements may be incomplete or ambiguous; user can correct them.
2. Required/preferred qualifications: satisfied, unsupported or unclear, with job and career evidence. A preferred tool cannot compensate for an unsupported required license by disappearing into a high average.
3. Professional versus technical skills, including tools/domain terms, with deduplicated concept matches and explicit equivalence reasons.
4. Relevant experience/positioning and duration computed from confirmed intervals. Uncertain dates remain uncertain; concurrent months are not summed twice.
5. Content/section/achievement coaching. Quality opportunities should not reward fabricated metrics or unnecessary sections.
6. Document readability: text availability, order and field coverage. Keep separate from semantic compatibility so changing a template cannot create experience.

Store normalized job version, Base CV version, tailored CV version, requirement IDs/spans, rule/alias/taxonomy/parser/model versions and score explanation. Before/after comparisons must use the same job interpretation and rules. If those change, disclose a new baseline rather than claiming an improvement from editing alone. No job → no invented Candidate Fit or CV–Job Match. Separate document structure/readiness diagnostics may run without a job; any readiness score needs its own disclosed method and N/A rules (SRF-02/03/04). Unusable input cannot yield a fabricated result. Invalid/empty denominator → explanation, not 100.

Candidate wording: “Estimated match to this job description. Uses our published rules and your confirmed information; employers may assess different criteria.” Add visible unsupported requirements and review actions alongside the number. Localized wording needs UX validation; avoid red/green “rejected/accepted” states.

## CV structure/readability acceptance proposal

This is a test design, **not a completed parser benchmark**. Architecture owns implementation/tool selection; no paid or employer ATS test was run.

- Golden synthetic fixtures: RO diacritics/EN; junior projects; experienced multi-page; two positioning titles with unchanged employment titles; partial/overlapping/ongoing dates; long company/link names; no metrics; certifications; missing contacts; image-only upload; corrupted/oversized/password-protected inputs.
- Import tests: raw text separately from normalized fields; mark unclear association/date; compare known names/contacts/employer/role/date/education/skills; ensure partial success is reviewable. Synthetic data may behave differently from real ATS data; do not submit fake applications.
- PDF tests: render from confirmed data; extract with at least two independent readers where feasible; compare expected section sequence, role/company/date adjacency, bullet order, contact text, all diacritics and page breaks. Manually verify visual legibility at standard page scale.
- Release gates proposed: no known loss/reordering of required text in the supported fixture corpus; rendering failures prevent false “ready” messages; export errors retry without losing edits; meaningful change invalidates old export checks. Measure field precision/recall and order errors, not merely total extracted characters.
- Limit statement in results: local extraction tests increase confidence for our output path and fixture set; they do not certify compatibility with every ATS/version/configuration. Follow an employer's accepted file format instructions.

Human-readable content recommendations (clear language, relevant facts, reverse chronology) also have official [Europass guidance](https://europass.europa.eu/en/create-europass-cv). Exact page/word/bullet limits in a builder are editorial defaults, not universal ATS requirements.

Owner-directed partial credit (1/.75/.4/0) applies only to supported reviewed classifications, including confirmed limited-detail claims and confirmed transferable facts. Unconfirmed/fabricated content remains zero. Primary requirement categories prevent accidental double-counting; no automatic credential equivalence. All twelve acceptance tests are traced in owner-feedback-round1.md; architecture now reports their v2 execution, but strategy has not rerun them or established empirical quality. Historical competitor and original ATS evidence above remains unchanged.
