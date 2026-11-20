# Import takes skills only where the CV lists them

The owner's decision of 20 Nov: the import must not build skills out of job titles, role lines or the summary. A CV with no skills listed imports with no skills; working skills out of the role lines can come at a later stage.

Seen on the live site: a CV with no Skills section imported with 36 skills, all lifted from role lines ("…negotiated supplier contracts…" became "Supplier contract negotiation"). The prompt already said "Never invent skills or qualities from job titles or responsibilities", but its own wording invited it: professional skills were described as "demonstrated work capabilities". Ten reworded ones then showed up under "We couldn't find these lines in your file".

## Task 1: Skills only from where the CV lists them

```
files: apps/api/src/imports/prompts.ts, apps/api/test/prompts.test.ts
new_files: none
deps: none
size: ~15 lines
```

**Goal.** The extraction prompt says skills come only from where the CV lists them as skills: a skills or competencies section, or a labelled skills or tools line. Never from a role's bullets, description or title, the summary or any other sentence, even when a sentence names a clear skill. With no skills listed, all three skill groups stay empty. Professional skills are no longer described as "demonstrated". `PROMPT_VERSION` moves to `import.v3.4`.

**Acceptance tests.**
- `prompts.test.ts`: the prompt contains the new rule (source places, the "never from a sentence" line, the empty-groups line), no longer contains "demonstrated work capabilities", and `PROMPT_VERSION` is `import.v3.4`.
- Real-AI check (`eval/import`, 3 runs before and after, not committed): case 09-no-skills ends with no skills; the other cases keep their skill accuracy.

No code check is added: the owner asked for the prompt rule only.

### Ruling (during the build)
- **Unclear skills wording.** With only the new rules, case 12 of the import eval named its vague skill "Advanced skills (Ambiguous: lacks context)" in 2 of 2 runs (an invented line). The unclearSkills line now says to copy the item exactly, with nothing added to its name, and to explain the ambiguity only in a warning. Case 12 then passed in 6 of 6 runs. This keeps the old behaviour; it is not a new rule.
- **Tools lists inside a role.** A first wording dropped a role's "Tools: Semrush, Canva" line altogether (3 of 3 runs; the old prompt kept it). The rule now says a labelled list counts also when it sits under a role, and the "never from a sentence" examples use other tools.
