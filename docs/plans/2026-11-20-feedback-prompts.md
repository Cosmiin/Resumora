# Owner feedback of 20 Nov: two prompt fixes

From `feedback-notes-2026-11-20.md` (workspace), points 1 and 3. Points 2 and 4 (calmer score screens) wait for the owner's pick of a design.

## Task 1: A role without a description needs no warning (import.v3.5)

```
files: apps/api/src/imports/prompts.ts, apps/api/test/prompts.test.ts
new_files: none
deps: none
size: ~10 lines
```

**Goal.** The owner: a missing description is fine and needs no confirmation; it can be added later in Enrich. The import prompt says a role, project or other entry without a description is normal: its description stays empty and no warning is added. The Word-file rule no longer turns the first line after a role's dates into the description unless that line introduces the role or the company; a line that states a task or a result stays a bullet. `PROMPT_VERSION` moves to `import.v3.5`.

**Acceptance tests.** `prompts.test.ts`: the prompt has the no-warning line and the new Word-file rule, no longer has the old one, and the version is `import.v3.5`.

## Task 2: The tools step offers only tools

```
files: apps/api/src/enrich/tools.ts, apps/api/test/prompts.test.ts
new_files: none
deps: none
size: ~8 lines
```

**Goal.** The owner: "client follow-up", "onboarding" or "recruitment" are not tools; tools and skills must be told apart. The tools prompt asks for software, apps, platforms, systems, programming languages or equipment, each a named product or technology, and never an activity, duty, method, process, framework, metric, skill, team or department, even when the CV names it (with the owner's examples). The word "methods" is gone from what it asks for. Where skills go instead is left for the owner.

**Acceptance tests.** `prompts.test.ts`: the tools prompt has the new tool kinds and the never-list line, and no longer asks for methods.
