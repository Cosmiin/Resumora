# Integrated proposal verification — 2026-10-23

This receipt describes discovery-artifact checks only. None establishes connected service behavior, calibrated scoring, actual PDF output/readability, production security, or owner approval.

## UX prototype

- `python3 prototype/build_portable.py` — rebuilt `prototype/review.html` from the reviewed app source; styles are locally bundled and optional theme helpers use pinned CDN assets.
- `node --check prototype/app.js` — passed.
- `node prototype/verify.mjs` — passed 67 deterministic DOM/local-state assertions covering journeys A–F.
- `python3 reviews/ux/browser-runner.py --script reviews/ux/browser-journeys.js` — 39 Chrome interaction checks passed at 1560×1000 and 390×844 in the prior complete journey pass. The changed integrated-v3 label was then checked against the rebuilt portable file at both sizes; scroll width matched viewport (1560/1560 and 390/390). Console reported no messages.
- The prior mobile route sweep covered Home, Base, ATS, Compare, Templates, Preview, Plans, LinkedIn, Applications and Guide at 390px; all ten fit the viewport. Browser commands used the task-owned `chrome-devtools-axi` wrapper. Its machine-specific runner and captured PNGs are ignored and not included in the proposal package.

## Included schema and demonstrator checks

- `python3 schemas/cv/v1/validate.py` — seven canonical CV fixtures passed; 15 malformed variants rejected; privacy projection and claim/date constraints passed. The validator skips workspace companion fixtures because those use a separate contract.
- `python3 schemas/cv/v1/validate_assessment.py` — five assessment fixtures passed; three invalid variants rejected.
- `python3 schemas/cv/v1/workspace_revision_v1_1.py` — latest-version, tailored/not-tailored, stale, search, sent-record and correction assertions passed; three invalid variants rejected.
- `python3 research/ats/score_v1_1.py` — 12/12 criteria plus six edge contracts passed. Output remains a structured synthetic score, not a production matcher.
- `python3 research/ats/readiness_v1.py` — ten readiness checks passed. Its independent readiness measure is not semantic quality or eligibility.
- `python3 research/architecture/duration_bounds_v1.py` — six duration guards passed; only partial-date bounds are demonstrated.
- `python3 research/costs/model_v1_2.py` and `python3 research/costs/free_pilot_v1_2.py` — arithmetic and scenario checks passed; capacity remains unproven and cost outputs are modeled.

## Known verification limitation

`python3 research/costs/cohorts_v1_1.py` does not run in this snapshot because it imports `model_v1_1.py`, which is not part of the current v1.2 cost snapshot. The current v1.2 model/free-pilot scripts pass. The historical cohort script is retained as a source artifact and is not represented as verified. Do not use its output until its matching versioned dependency is restored or the model owner updates it.

## Review state

Lavish feedback rounds are terminal and acknowledged per task-owned receipts; no live board or unresolved annotation round is being claimed. The consolidated package remains discovery-only. Product policy decisions D-01–14 remain open in the linked strategy register; review is not implementation authorization.

## Review corrections — reproducible focused checks

Use Node 22 or newer. From a fresh checkout, install only the prototype's declared development dependencies and run its focused verifier:

```sh
npm ci --prefix prototype
npm test --prefix prototype
```

`prototype/package-lock.json` pins jsdom and its transitive dependencies. The test command executes the same public interactions against both the source entry and the generated portable page. Its assertions observe rendered controls, exported JSON and `window.demo.snapshot()`; the network check records attempted fetch, XMLHttpRequest, WebSocket, EventSource and sendBeacon calls during those interactions. External theme assets are excluded from this DOM test. This does not establish browser layout or PDF behavior.

The review correction covers canonical BridgeWorks/Power Automate/SQL/API evidence in recommendations, rewrites, enrichment and explicit Base promotion; draft freshness after saves, repeated tailoring and job switching; per-application job/current-CV/submitted-snapshot continuity; explicit sent history through Interview/Closed; document-specific translation; consistent eligibility and unavailable Candidate Fit; mixed-type chronology; search recovery after navigation; and diagnostic/question/confirmation paths for every Base section, each role and custom sections. Contextual answers retain separate per-section drafts, validate before saving and address roles by stable ID in each target document.

The demo uses a new local storage namespace for its revised snapshot contract. Prior demonstration state remains untouched in its old namespace. No production persistence or service was added. The unused Home variant, redundant extensionless inventory and settled entry-focus question were removed; `inventory.json`, screenshot evidence metadata and frozen strategy snapshots remain preserved. Rebuild the portable page with `python3 prototype/build_portable.py` whenever app source changes, then refresh `PROPOSAL-MANIFEST.sha256` before handing the package back.

Focused review result: `npm test --prefix prototype` passed 171 checks against the source entry and 171 against the rebuilt portable page. Dependency setup used `npm ci --prefix prototype --ignore-scripts --no-audit --no-fund`. No complete repository test/lint suite, browser-layout rerun, production service, push, PR or CI phase was executed in this review turn.

### Follow-up selection, rewrite and portability corrections

The default synthetic document now omits API/payroll bullets and their summary/context repetitions while retaining all confirmed evidence in Base. Its selected content starts at 62.5; adding the existing supported project reaches 90. If the enrichment answer is already displayed in role context, its qualitative outcome and payroll context contribute before a project is added (80 in the scripted journey). Scores and keyword states follow the same visible section/bullet projection used for document rendering. Compare renders and scores Base and the actual proposed selection separately; accepting uses that same proposal. These are bounded bilingual fixture checks, not a general-purpose matcher or calibrated assessment.

The focused verifier also exercises hiding/restoring sections, editing away project evidence, selecting bullets without a project, preserving helper corrections and Undo, excluding unmeasured results, and exporting two independent application records through both JSON controls with submitted snapshots, sent attestations, contacts, next actions, section confirmations and LinkedIn review state. The maintained browser journey is executed in the DOM verifier to detect contract drift; this does not constitute a Chrome layout pass.

Follow-up focused result: `npm test --prefix prototype` passed 200 assertions for the source entry and 200 for the rebuilt portable page, including execution of the maintained browser journey. The new selection checks distinguish Base from an application's attached snapshot, and verify identical Romanian/English payroll coverage. Dependency setup used the declared lockfile with scripts disabled. No repository-wide test/lint suite or browser-layout, PDF, push, PR or CI phase was run.


### Selected sections and submission prerequisites

The evidence projection now includes every visible text section (summary, education, languages, project, certifications and custom content), both skill groups, and visible role text and selected bullets. The focused regressions move the same canonical supported project evidence through each text section in Romanian and English, checking score, keywords, comparison and export preview before and after hiding it.

New submission attestations require an attached current document at the shared application-save boundary, whether the stage is Preparing, Sent, Interview or Closed. Job-first records still save without a CV while unsent. Regression coverage checks rejection without a snapshot or sent-count increment, successful attestation after creating Base, a viewable submitted snapshot and preserved history through later stages. Existing rewrite, Undo, unmeasured-result and full application/review JSON portability coverage remains in the verifier.

Focused result for this round: `npm test --prefix prototype` passed 297 assertions for the source page and 297 for the regenerated portable page. Both new regressions and the existing rewrite/export/browser-journey checks passed. No complete repository test or lint suite, browser-layout pass, production service, push, PR or CI phase was run.


### Draft evidence, dates and requirement priorities

Evidence drawers read the displayed editor draft directly, without requiring Base, a job or a saved analysis. Analysis links still read the saved current document; non-bullet requirement links retain their synthetic source disclosure. Review dates and document dates share formatting from the role's actual endpoints, precision, current flag and document language. Requirement overrides are applied by the shared list consumed by checkboxes, badges and keyword priority groups; edits refresh labels immediately and invalidate analysis without changing the illustrative scoring method.

Focused regressions exercise evidence before the first save and after draft corrections, saved Base/job/analysis evidence, precise/year-only/current/unknown dates in both document languages with an independent UI language, and both override directions for every requirement with both UI languages.

Focused result: `npm test --prefix prototype` passed 434 assertions against source and 434 against the regenerated portable page. The regression setup uses the supported Jobs → Requirements navigation. No complete repository test/lint suite, browser-layout pass, production integration, push, PR or CI phase was run.
