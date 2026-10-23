# ATS and readiness demonstrators

Current proposed semantic method is [ATS-01 v1.1.0](method-v1.1.md); `score_v1_1.py`, `rules-v1.1.json`, `fixtures-v1.1.json`, and `worked-examples-v1.1.json` contain the synthetic reviewed-input demonstrator. [Assessment input schema](../../schemas/cv/v1/assessment-input-1.1.schema.json) pins fixture/method inputs. Independent readiness-completion work is in `readiness-rubric-v1.json`, `readiness-fixtures-v1.json`, and `readiness-worked-v1.json`.

Run from the repository root:

```sh
python3 research/ats/score_v1_1.py
python3 research/ats/readiness_v1.py
```

The scripts replay structured synthetic evidence; neither implements natural-language job extraction, a production matcher, employer ATS integration, calibrated hiring prediction, or PDF extraction. Eligibility and actual PDF readability are separate from semantic scores. Check [calibration and limits](calibration.md) and [PDF test design](pdf-tests.md). No score is approved as a product promise.
