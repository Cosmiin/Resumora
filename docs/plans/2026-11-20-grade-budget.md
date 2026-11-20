# Grading answers get room for the role questions

Seen live on 20 Nov (recording of a real Enrich round): one `check-changes` request failed with 502 `ai_bad_answer` because its grading answer was "output cut off at the length limit". The person saw "Some changes could not be prepared".

Measured with the real AI the same day (one 6-line role, 3 runs per case): a graded line costs about 200 tokens and the role-wide part (marks plus 4–5 role questions with options and amounts) 400–700. The limits were 600 + 180 a line (grade lines), 800 + 180 a line (grade lines and re-read the role) and min(5000, 1000 + 200 a line) (whole role). One case used 715 of 780. A role may have up to 8 role questions, so a longer answer ran over.

## Task 1: One roomier limit for every grading answer

```
files: apps/api/src/enrich/score.ts, apps/api/src/enrich/score.test.ts
new_files: none
deps: none
size: ~15 lines
```

**Goal.** All three grading calls use `GRADE_TOKENS(lines) = min(8000, 1400 + 300 × lines)`. Nothing else changes: no retry, no new check. A limit only caps the answer; a shorter answer costs the same as before.

**Acceptance tests.** `score.test.ts`: `GRADE_TOKENS(0)` 1400, `(3)` 2300, `(40)` 8000; the whole-role, grade-lines and re-read calls send 1700 (1 line), 1400 (no lines), 1700 (1 id), 2000 (2 ids) and 1400 (re-read, no ids).
