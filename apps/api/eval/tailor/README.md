# Tailoring eval

Six fictional CV + job pairs (`fixtures.json`): a matching EN backend CV, a matching RO accountant CV, a teacher
switching to product analysis, an 18-year engineering-manager career (written to run past 2 pages), a weak support
CV and a chef applying for a data-engineering job. Every pair's CV and job are checked against `CvContentSchema` and
`JobExtractionSchema` before any model call.

For each pair, `run.ts`:
1. scores the Base CV 3 times (Score 1) and records the spread;
2. runs the whole tailoring through the API routes, as the web does: start, then every section's pass and accept,
   with no answers and no confirmed flags (flagged items fall back to the Base wording, inferred items stay unreviewed);
3. takes Score 2 from the last accept and builds the tailored CV with the web app's own PDF builder (Classic template).

| Check | Pass bar |
|---|---|
| Invented facts: a number that neither the Base CV nor the job has, or an employer the Base CV doesn't have | 0 |
| Score 1 spread over 3 runs | ≤ 3 |
| Cost per run (Score 1 once + the tailoring, no letter), priced from `PRICES` in `run.ts` | < $0.05 |
| PDF pages | ≤ 2 |

Also reported: Score 1 → 2 lift and keyword coverage before → after (keyword labels found / all keyword labels).

## Run it with the real AI keys

```
npm run eval:tailor
```

From the repo root. It reads the keys from `apps/api/.dev.vars`; set `EVAL_DEV_VARS` to read another checkout's file
instead (the values are never printed). It writes `RESULTS.md` next to this file. A few cents per run.

A model missing from `PRICES` in `run.ts` fails the cost check with "no price for …": add its per-token price.

## CI

`apps/api/test/tailor-eval.test.ts` runs the same pipeline on all 6 pairs with a fake model in `npm test`.
Known gap: tailoring rewords bullets but never removes them, so the 48-bullet long-career CV stays over 2 pages
(3 pages even with every bullet cut to 6 words). The CI test expects exactly that one failure.
