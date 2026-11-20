# No description warnings on import (owner's feedback, 20 Nov 2026)

After import.v3.5 went live, an import still showed description warnings in other words: "has a description that appears
to be split across two pages…" and "has a description that is empty as the text following the dates is a bullet point",
each with It's correct / I'll fix it on my CV. Owner: descriptions never need confirming; if a line is a description, put
it there, if not, that's fine.

## Task 1: Never warn about a description

**Goal:** the import prompt's narrow rule (no warning for an entry *without* a description) becomes a rule against any
warning about a description: missing, empty, unsure, separated from the bullets or split across a page break. The model
decides and places the text, and says nothing about it. Version import.v3.6.

**Acceptance tests:** the prompt holds the new rule and not the old one; PROMPT_VERSION is import.v3.6.

```scope
files: apps/api/src/imports/prompts.ts, apps/api/test/prompts.test.ts
new_files: none
deps: none
size: ~15 lines
```
