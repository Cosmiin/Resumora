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
