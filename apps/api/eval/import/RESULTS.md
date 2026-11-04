# Import evaluation results

Date: 2026-11-04 · Prompt: `import.v3.3` · Command: `npm run eval:import`

Models: `google/gemini-3.1-flash-lite` through OpenRouter (first choice, privacy routing on),
`gpt-5.4-mini` through OpenAI (fallback). Prices from openrouter.ai on 2026-11-04 (see `run.eval.ts`).

Pass bar (all 12 cases): every section found and placed; ≥ 95% fields correct; 0 invented lines;
100% word for word with accents; flags match; each import < 30 s and < $0.01.
A pass counts only when two full runs in a row pass.

## Final run 1

```
case                    sections  fields  invented  extra  accents  flags  secs   cost     result
01-one-column           ok        100.0%  0         0      ok       ok     4.7    $0.0028  PASS
02-two-column           ok        100.0%  0         0      ok       ok     4.8    $0.0029  PASS
03-three-column         ok        100.0%  0         0      ok       ok     4.5    $0.0027  PASS
04-colour-sidebar       ok        100.0%  0         0      ok       ok     4.1    $0.0026  PASS
05-layout-tables        ok        100.0%  0         0      ok       ok     3.4    $0.0025  PASS
06-icon-headings        ok        100.0%  0         0      ok       ok     3.8    $0.0025  PASS
07-romanian             ok        100.0%  0         0      ok       ok     4.8    $0.0031  PASS
08-odd-headings         ok        100.0%  0         0      ok       ok     3.9    $0.0028  PASS
09-no-skills            ok        100.0%  0         0      ok       ok     4.3    $0.0027  PASS
10-scan                 ok        100.0%  0         0      ok       ok     4.3    $0.0026  PASS
11-docx-tables          ok        100.0%  0         0      ok       ok     4.2    $0.0025  PASS
12-long-four-pages      ok        100.0%  0         0      ok       ok     8.6    $0.0063  PASS

total cost $0.0358, slowest 8.6 s, 12/12 cases pass
```

## Final run 2

```
case                    sections  fields  invented  extra  accents  flags  secs   cost     result
01-one-column           ok        100.0%  0         0      ok       ok     5.0    $0.0028  PASS
02-two-column           ok        100.0%  0         0      ok       ok     4.1    $0.0029  PASS
03-three-column         ok        100.0%  0         0      ok       ok     4.3    $0.0027  PASS
04-colour-sidebar       ok        100.0%  0         0      ok       ok     4.4    $0.0026  PASS
05-layout-tables        ok        100.0%  0         0      ok       ok     3.7    $0.0025  PASS
06-icon-headings        ok        100.0%  0         0      ok       ok     4.2    $0.0025  PASS
07-romanian             ok        100.0%  0         0      ok       ok     4.5    $0.0031  PASS
08-odd-headings         ok        100.0%  0         0      ok       ok     4.3    $0.0028  PASS
09-no-skills            ok        100.0%  0         0      ok       ok     4.1    $0.0027  PASS
10-scan                 ok        100.0%  0         0      ok       ok     4.2    $0.0026  PASS
11-docx-tables          ok        100.0%  0         0      ok       ok     3.5    $0.0025  PASS
12-long-four-pages      ok        100.0%  0         0      ok       ok     8.8    $0.0063  PASS

total cost $0.0358, slowest 8.8 s, 12/12 cases pass
```

All seven checks passed in both runs.

## Answer key corrections

None. The keys agree with the owner's rules and the files:
- "Prototyping" (04, 10), "Route planning" and "Inventory control" (05) are practices, which the
  owner's rules put in professional skills.
- 06 has no achievements or highlights section; the three lines are role bullets under Work History,
  so the key (empty achievements, achievements flag) is right.
- 11: "Handled accounts payable for 30 stores." is a plain paragraph under the role in the Word file,
  so it is the role's description, as the key says.

## Scorer fixes (correctness, not leniency)

- A skill placed in the wrong skill group counted twice (missing and extra). It now counts once, as a
  miss, and is listed as "wrong skill group".
- When the key leaves first and last name empty, a filled pair is accepted only if "first last"
  (either order) is exactly the full name.
- The runner saves each result to `apps/api/node_modules/.cache/eval/results/<case>.json`.

## Changes that reached the bar

Prompt (added sentences in the generated category part only; the owner's rules are unchanged):
- achievements only holds a section the CV itself presents as achievements or highlights; role
  results stay in role bullets.
- A skill is technical only when it names a tool, software, language, platform or technology; a
  method, practice or activity is professional.
- In text without list markers (Word files), the line after a role's dates that states its scope is
  the description.
- `sourceHeadings` uses only the listed keys; the summary heading is listed and gets `summary`;
  a skills heading gets `skills`.
- A section that went to a list is not also copied into `custom`.

Mapping (`toCvContent`):
- A heading category that is a skill group's name means `skills`; a field path such as
  `basics.summary` means its last part.
- A degree line that ends with the field of study ("Master of Public Health, Global Health Policy"
  with field "Global Health Policy") keeps only the degree.
