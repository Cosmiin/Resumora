# ATS-01 method 1.1.0 — two semantic scores and independent eligibility

Current discovery baseline after the six-item review round received through Firstmate on 23 October 2026. It supersedes method1.0.0 for new examples. It does not authorize a production app, model experiment or deployment. Parameters are owner-directed starting values, not scientifically validated hiring weights. Original prompts and a complete receipt are preserved under `reviews/architecture/feedback/`.

## Four distinct answers

1. **Candidate–Job Fit**: compare the complete confirmed professional profile against the job. If that profile is unavailable, return null and explain that broader evaluation needs information. A CV rewrite must never increase this score without a factual profile revision.
2. **CV–Job Match**: compare only supported information actually represented in the selected CV. Reordering/wording that preserves the evidence mapping has zero effect. Adding omitted confirmed evidence can improve this score without changing Candidate Fit.
3. **Eligibility**: independently assess identified non-compensatory conditions. `requirements_satisfied`, `needs_verification`, or `confirmed_requirement_gap`; persist warnings beside both scores, comparisons and export previews. It is not a legal eligibility certification.
4. **ATS Readability**: independent `untested|pass|warn|fail` on a pinned actual document/PDF. An HTML preview or high semantic score never implies readability passed.

## Structured pipeline and versioned inputs

StageA: an AI extraction adapter proposes atomic job requirements with stable ID, primary category, quoted source-span references, required/unspecified/preferred priority, polarity/ambiguity, hard-gate status/kind, valid-evidence policy and permitted equivalence. Do not turn every tool mentioned into a requirement or every “required” phrase into a knockout. Review ambiguous extraction.

StageB: an AI matching adapter proposes links from each requirement to confirmed profile facts and CV items. Classify demonstrated/equivalent, confirmed claim with limited context, related transferable evidence, or not evidenced. Retain exact relation, explanation, supporting claim IDs, document items and matcher/model/prompt version. Rebranding aliases (Make/Integromat) differ from adjacent tools (Make/Zapier). Payroll automation may support an HR workflow requirement; generic payroll cannot establish a specific platform or license. RO/EN equivalents use versioned accepted mappings; no adjacent-credential or country-recognition inference.

StageC: deterministic code calculates both scores from accepted structured inputs. No LLM guesses an overall number. Store raw normalized requirements, classifications, category weights/effective weights and all versions; replay accepted mappings instead of rerunning a nondeterministic model for reproducibility.

Pin profile/document/job snapshots, requirement-set revision/hash, rules/weight profile, dictionary, normalizer, matcher/model/prompt, evidence mapping and as-of date. Candidate cache key excludes presentation; CV cache includes selected document evidence. Same-profile comparison must keep Candidate Fit unchanged. Before/after rejects changed job/requirements/rules/dictionary/matcher/normalizer/as-of, and identifies changed profile versions explicitly.

The runnable demonstrator `score_v1_1.py` consumes synthetic reviewed JSON; it is not an implemented natural-language extractor, production matcher or backend. `assessment-input-1.1.schema.json` is a companion input contract, separate from unchanged canonical CV schema1.0.0.

## Formula

| Primary category | Baseline weight |
|---|---:|
|Technical skills, tools and methodologies|30|
|Responsibilities and domain expertise|25|
|Relevant professional experience|15|
|Demonstrated accomplishments|10|
|Education, certifications and qualifications|10|
|Professional and transferable skills|5|
|Job title and positioning|5|

Priorities within a category: required3, unspecified2, preferred1. Source evidence establishes wording/priority; ambiguous necessity is retained for review. **No frequency or repeated-keyword bonus.** Job keyword display can rank by priority/category and source evidence without creating additional score atoms.

Match strengths: demonstrated or accepted semantic equivalent1.00; confirmed claim with limited supporting context0.75; related/transferable evidence0.40; not evidenced/unconfirmed/suggested/rejected0.00. These values are configurable in a pinned rules version. User-confirmed is an attestation, not independent verification. A standalone unconfirmed claim cannot earn0.75 merely by appearing in the CV. The same qualitative outcome can earn1.00 as a supported metric; there is no metric-size/count bonus or pressure to disclose confidential figures.

For category d, `coverage_d = sum(priority_j × strength_j) / sum(priority_j)`. Overall `score = sum(effective_weight_d × coverage_d)`. Nominal weights total100. Only genuinely absent **job** categories are excluded; redistribute their weights proportionally and expose effective weights. Never exclude a category because the candidate has no evidence. Empty/unusable job requirements produce null, not100.

Technical worked example: Make(required3×1), Airtable(required3×1), Zapier(preferred1×0.4) gives6.4/7=0.9142857143 coverage; at30weight the contribution is27.42857143points. Repeating Make in source text or CV does not change it.

Future job-family weight profiles may be reviewed/versioned (e.g. management vs engineering). No per-person or opaque AI-chosen weight adjustment is enabled. Calibrate profiles by occupation with fairness/uncertainty review before adopting them.

## Deduplication, OR, AND and negation

One canonical requirement ID has one primary category. SQL as a technical tool does not also score as a responsibility and accomplishment merely because it is repeated. Distinct explicit requirements, such as SQL proficiency and delivering regulatory reports, can share evidence but remain separately justified. Show denominators and reused evidence.

Merge repeated reviewed canonical atoms and source spans without increasing priority. Conflicting category/priority/gate classification requires review. OR alternatives form one requirement; take maximum supported fulfillment, not sum or multiple missing gaps. AND children split the parent's importance so total priority is conserved. Reviewed `not_required` mentions are excluded; ambiguous polarity requires clarification. “NoSQL” is not a negation, and “not only X but also Y” needs contextual parsing. The new demonstrator tests the structured polarity/dedup/OR/AND contracts; automatic NLP interpretation still requires future quality tests.

## Eligibility and evidence limits

Hard conditions include explicit legal licenses, country-specific authorization, current credentials or genuinely non-negotiable job conditions. Weighted required skills may remain compensatory; priority3 does not automatically set `hardGate:true`.

Use the full confirmed profile for eligibility when available, otherwise available CV evidence with explicit scope. A fully supported permitted exact/equivalent condition can be satisfied. Missing/limited/unconfirmed or merely transferable evidence is **needs verification**, not proof the person lacks it. Only an explicit confirmed denial or reliable contrary evidence can produce **confirmed requirement gap**; absence alone cannot. Structured assertions retain actor/source/reason. A missing CV credential present in the profile is an omission recommendation, not a false legal gap.

Transferable capability cannot satisfy a strict credential/authorization. No numeric hard cap: the perfect-other-categories fixture can reach90 with an unverified license, while independent eligibility remains conspicuous. An explicit confirmed unmet condition produces the stronger gap state. Neither status implies employer-specific legal adjudication.

Relevant duration derives from confirmed dates, never title guesses. Retain existing lower/upper interval-union convention from1.0.0; concurrent roles count once, partial dates stay partial, missing dates remain unknown and as-of is fixed. No gap/part-time/age/name/address/prestige penalty. Scope/seniority/recency must be explicit job-based evidence; no generic age or recency decay. Unknown evidence means not evidenced, not incapable.

## Recommendations and change attribution

Three required gap classes: `profile_present_cv_omitted` (select existing confirmed evidence), `insufficiently_demonstrated` (add a real supported project/context), `not_supported_in_available_profile` (ask or acknowledge gap). Each recommendation retains requirement/source spans, evidence, action, confirmation need and limitations. Compute a prospective delta only when a concrete supported patch can be deterministically evaluated under locked rules. Current generic recommendation examples use delta null rather than inventing an improvement.

Main synthetic profile Candidate Fit94.93, CV Match59.93. Selecting existing HR-context evidence adds25 and the existing confirmed qualitative outcome adds10, taking CV Match to94.93 while Candidate Fit stays94.93. A separate enrichment fixture changes the profile and raises Candidate Fit10; it is labeled new-fact improvement. Cosmetic wording alone changes neither score.

Preserve five keyword display statuses: included, confirmed profile fact omitted, confirmed equivalent expression, awaiting confirmation, not evidenced. Match strength/relation/eligibility are separate axes, not overloaded into one badge. “Confirmed by you” is accurate UI language; external verification requires actual provenance. No empty/irrelevant section score padding.

## Executed checks and calibration

Run `python3 research/ats/score_v1_1.py`; outputs `rules-v1.1.json`, `fixtures-v1.1.json`, `worked-examples-v1.1.json`. All12 owner acceptance criteria pass: repetition invariance; approved equivalence; transferable strict-gate boundary; high-score mandatory visibility; Candidate Fit invariant to CV-only edits; omitted evidence improves CV score; unsupported achievements0; transparent absent-category renormalization; contribution sum; identical replay; independent readability; evidence-linked before/after. Six additional contracts cover absent profile, duplicate atom, reviewed negation, OR, AND and version-lock rejection.

Companion schema validation passes5inputs and rejects3invalid variants. These are synthetic logic checks, not validated predictive performance, automatic multilingual semantic quality, employer ATS integration or real PDF extraction. Calibration/regression plan remains necessary: expert annotation, held-out people/job families/languages, evidence precision/required-gap recall, cross-language consistency, occupation-specific fairness and versioned model/cost review. Proposed quality thresholds are unachieved goals, not reported measurements.
