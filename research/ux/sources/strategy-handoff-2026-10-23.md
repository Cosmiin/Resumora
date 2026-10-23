# Strategy checkpoint 1 — v1, 2026-10-23

Status: initial evidence ready for cross-review; integrated package and product choices remain unapproved. Research access date for all links below: 2026-10-23. This is discovery, not production implementation.

## Bounded shortlist

Ten representatives, not a market census: Jobscan (job-match scanner), Teal (profile/tailoring/job workflow), Rezi (AI writing/keyword targeting), Resume Worded (document/LinkedIn reviews), Kickresume (design/AI writing), Enhancv (visual editor/tailoring), FlowCV (emerging EU builder), Europass (public EU career profile), eJobs (Romanian job-platform CV), CVmaker.ro (Romanian-localized commercial builder). Selection is a research sampling choice, not a market-share claim. Product/help/pricing claims need their own sources; inclusion does not verify a capability.

## Initial evidence and implications

- **E-ATS-01 — verified vendor documentation:** Greenhouse describes parsing as importing resume information into candidate fields. Failure can leave the document attached while details require manual entry. It lists columns, tables, headers/footers/text boxes, image-based content and unclear sections among risks, and a parser-specific 2.5 MB limit. [Greenhouse, Unsuccessful resume parse](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse), updated 2026-03-02. **Implication (our recommendation):** separate extraction/readability from semantic matching; show extraction review and export text-order checks. No universal ATS pass/fail claim.
- **E-COMP-01 — verified advertised method, not independently validated:** Jobscan names hard skills, degree where applicable, title, soft skills and other keywords as matching priorities; measurable results and word count are advice outside match rate. Exact formula and employer equivalence are unknown. [Jobscan tutorial](https://www.jobscan.co/jobscan-tutorial). **Implication:** separate required/preferred evidence and quality coaching from a fit estimate; never alter historical employment titles to optimize a score.
- **E-COMP-02 — verified public plan:** Teal advertises unlimited resume versions and tracking on free and paid; free keyword matching is top five versus full list/custom terms on Teal+. [Teal comparison](https://help.tealhq.com/en/articles/9530153-teal-vs-teal). **Implication:** resume variants alone are weak differentiation; propose verified career facts and transparent change approval as the core workflow.
- **E-EU-01 — verified public workflow:** Europass keeps a career profile, selects facts into multiple CVs and supports 31 document languages. [Europass CV](https://europass.europa.eu/en/create-europass-cv). EURES calls it free for everyone: [EURES](https://eures.europa.eu/jobseekers/europass_en). **Implication:** durable career profile and multilingual documents are established baselines; do not market them as unique.
- **E-KW-01 — verified resource availability:** the Commission exposes ESCO classification APIs, including a local option. [ESCO API](https://esco.ec.europa.eu/en/use-esco/use-esco-services-api). **Hypothesis:** versioned RO/EN concept aliases plus a small tool-name dictionary may be sufficient for initial bilingual matching. ESCO alone is not proof of perfect synonym coverage or qualification equivalence.

## Proposed smallest useful MVP — recommendation, awaiting approval

One persistent, versioned Base CV; PDF/DOCX upload or manual entry with confirmation; short evidence-seeking enrichment; job text input; structured required/preferred requirements; five keyword evidence statuses; transparent compatibility estimate with separate readability; truthful per-job variant; change approval; a structured editor; one tested single-column PDF template; RO interface plus EN, independently selected document language. Account/privacy/deletion and server-enforced entitlements are essential if any commercial launch is approved. No prices selected.

Candidate exclusions requiring scope approval: URL ingestion and extension at first release (paste fallback), automatic applications, job discovery/tracker, cover letters, interview practice, many templates, OCR, DOCX export, broad language coverage, semantic embeddings and employer-specific score simulation. Baseline requests these capabilities to be evaluated; this proposal does not silently remove them from discovery or prototype coverage.

## Cross-review requests through Firstmate

1. Architecture: confirm minimum input formats/OCR fallback, provenance state/immutable versions, deterministic alias matching boundaries, PDF test feasibility and whether cost favors targeted enrichment over full-document regeneration. Own model/infrastructure/Stripe operating prices; strategy owns competitor selling prices only.
2. UX: preserve independent interface/document languages, upload confirmation, Base versus job edits, five keyword statuses and readable uncertainty. How much cognitive load do two titles/two skill groups create in the synthetic six-journey prototype? Distinguish observed screenshot evidence from proposed behavior.
3. Architecture + UX: return numbered objections/constraints and exact snapshot pointers through Firstmate. Strategy will draft the integrated backlog/decision register and record every disposition.

## Assumptions and unresolved choices

- A-01: target segment is Romanian job seekers applying locally and in English; baseline supports language direction, but segment willingness to pay and job-search frequency are untested.
- A-02: one trustworthy end-to-end loop is more useful than breadth; a product hypothesis needing approval and later user evaluation.
- D-01: first release input scope (paste first versus URL and extension immediately).
- D-02: supported import formats and handling scans (manual fallback versus OCR).
- D-03: score display policy and calibration acceptance (baseline requires an honest 0–100 estimate; do not present proposed weights as validated).
- D-04: template/export scope (one tested PDF versus several layouts and DOCX).
- D-05: commercial release limits and 1/3/6-month terms; no selling-price decision in this lane.

## Checks and boundaries

Read approved product baseline and kickoff setup update; inspected this worktree (README and ignore scaffold, no design system or app). Primary web search/open used for sources above; no accounts, purchases, paid model calls, production changes or remote publishing. Lavish help and matching table/comparison/plan/input playbooks read; later review will use the documented Tailwind v4/DaisyUI v5 fallback because this new project has no theme. Browser verification, full price capture, final review and cross-review are pending.
