# Experience score and rewrite evaluation

Date: 2026-11-05 · Score policy: `score/1` · Command: `npm run eval:enrich` · Never run in CI.

## What this means

We asked the real AI to review 43 bullet points from 15 made-up roles (38 graded against the grades we expected, plus 5 that must score 0) (9 English, 6 Romanian), and to
rewrite bullets in 6 more made-up roles built to tempt it into mistakes. We ran the whole set twice.
Both runs passed every check.

- **Grading agrees with the expectations we wrote ourselves.** In both runs, 37 of 38 bullets were graded
  within one step of what we expected on all four parts (contribution, clarity, specificity, impact).
  That is 97%, against a bar of 90%. The one miss was a Romanian line about updating an order sheet
  "daily": the AI said "daily" is a clear result; we had said no result. On reflection the AI has a
  fair point, and we left our expectation as it was rather than change it after the fact.
- **Empty and repeated bullets get zero.** "TBD", "de completat" and a bullet copied word for word
  scored 0 every time. The 2 reworded repeats also scored 0 in both runs (reported, not part of the bar).
- **The AI did not invent numbers.** In 12 rewrite runs, 0 proposals had a figure that was not in
  the person's own text or answers. In the example where the person gave a figure ("about 60 calls a day"), the rewrite used it (seen when reading the output; the eval prints this as usedNumber). A
  range they picked ("10–50 a week") stayed a range. The code check that would have caught an
  invented number had nothing to catch, so the AI itself is behaving, not just the safety net.
- **Answer choices never contained an exact number** (0 of 112 choices across the two runs).
- **Romanian stays Romanian.**
- **Cheap and quick.** About 1.9 cents for the whole set per run. A rewrite starts showing words in
  under a second on average (worst 1.2 seconds) and finishes in about one second.

Things to know, which the pass bar does not cover:

- In run 1, one Romanian rewrite used first person ("Am scanat codurile de bare ..."). In run 2 the
  same case came back correctly without it. CVs should not read in first person, and no code check
  catches this today, so it can still reach the person's screen.
- Some rewrites add polish the person never said, for example "to optimize route efficiency" or
  "to maintain service standards". These are not numbers, so the check lets them through. The
  person still sees each proposal before accepting it.

### Three real before/after examples (made-up people)

| Before | After (from the real run) |
|---|---|
| Answered customer calls. (answer given: "About 60 calls a day, mostly booking questions.") | Managed approximately 60 customer calls per day, primarily addressing booking inquiries. |
| Trained new staff. (answer picked: "10–50 a week") | Trained 10–50 new staff members per week. |
| Ajutat la pregătirea comenzilor. (răspuns: scanat coduri de bare, împachetat colete pentru curier) | Scanat coduri de bare și împachetat colete pentru curier în vederea pregătirii comenzilor. |

## Pass bar

- Each grade within one step of expected on at least 90% of bullets (the four parts are counted
  together: a bullet agrees only when all four are within one step). "Within one step" means
  missing and partial, or partial and specific. Missing against specific is not.
- Placeholder and exact-duplicate bullets score 0.
- 0 proposals with an unknown number after the code check. How many the AI wrote before the check
  is counted too.
- Rewrites stay in the case's language. Romanian passes with Romanian letters (ăâîșțşţ) or at least
  2 Romanian stop words (și, de, la, pentru, cu, în, din, pe), and at most 1 English one (the, and, for, with, of).
- A picked range may appear as the range, never as an exact number.
- Not in the bar, only reported: options with an exact number, paraphrased duplicates.

Time to first word = milliseconds from the start of the request to the first streamed piece of text.
Cost = tokens reported by the provider times the price table in `run.eval.ts` (same as the import eval).

## Results

| | Run 1 | Run 2 |
|---|---|---|
| Overall | PASS | PASS |
| Grades within one step (all four parts) | 37 / 38 (97.4%) | 37 / 38 (97.4%) |
| Contribution / clarity / specificity / impact | 38 / 38 / 38 / 37 | 38 / 38 / 38 / 37 |
| Placeholder and exact duplicate score 0 | 3 / 3 | 3 / 3 |
| Paraphrased duplicates scored 0 (reported) | 2 / 2 | 2 / 2 |
| Rewrite cases passing | 6 / 6 | 6 / 6 |
| Unknown numbers before the check | 0 | 0 |
| Unknown numbers after the check | 0 | 0 |
| Options with an exact number (before the filter) | 0 of 54 | 0 of 58 |
| Time to first word, average / worst | 631 ms / 787 ms | 830 ms / 1197 ms |
| Slowest case | en-hr-coordinator, 2.4 s | ro-rezultate-vagi, 2.1 s |
| Most expensive case | ro-rezultate-vagi, $0.0013 | ro-rezultate-vagi, $0.0013 |
| Total cost | $0.0189 | $0.0190 |
| Run length | 32.5 s | 33.6 s |

Each rewrite case takes about 1 s and costs about $0.0002; each score case 1.2 to 2.4 s and about $0.0012.

The single graded miss in both runs: `ro-duplicat-parafrazat`, "Actualizat zilnic tabelul de urmărire a
comenzilor." The AI graded impact "specific" (daily = a stated frequency); we expected "missing".

Per-case detail of the rewrite traps (both runs): the vague number (40%) was kept and no new figure was
added; the real answer (60 calls) appeared in the rewrite; with no answers no number was added; the duplicate pair
came back as two separate rewrites, none was dropped; the Romanian role stayed Romanian; the picked range
stayed a range.

## Prompt changes

None. The pass bar was met on the first run with the prompts as they were, so `prompts.ts` and
`rewrite-prompts.ts` are unchanged, and the weights and checks are untouched.

## Models

Prices found for every call (no "no price" warning), so the cost covers all calls. Cases and expected
grades are in `cases.ts`; the expectations were written before the first run and not changed after it.
