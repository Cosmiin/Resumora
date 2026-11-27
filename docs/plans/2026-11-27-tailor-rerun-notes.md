# Two notes from the owner's re-run: no doubled skills, no tool question on "something similar"

The owner tailored the same job again after PR 97 (27 Nov) and noted two things (`tailoring-rerun-notes-2026-11-27.md` in the workspace folder). He then said to go on with the next steps and take the notes into account. This plan builds the two notes; the three-screen flow has its own plan.

## Task 1: The skills step never gives two skills the same name

```
files: apps/api/src/tailor/section-prompts.ts, apps/api/src/tailor/section-pass.ts, apps/api/test/tailor-section.test.ts
new_files: none
deps: none
size: ~35 lines
```

Seen on the live site: Review Skills offered "Make.com → Workflow Automation Tools", "Make / Integromat → Workflow Automation Tools" and "Zapier → Workflow Automation Tools", and "Anthropic Claude" and "OpenAI GPT" each "→ Prompt-based AI Tools". Keeping them all puts the same skill on the CV three times (and twice), and the tools' own names are lost.

**Goal.**
- `SECTION_RULES.skills` gains: never give two skills the same name, and never rename a skill to a name another skill on the CV already has; a tool's, product's or technology's own name stays as it is (Make.com, Zapier), never replaced by a category; a category the job asks for may be proposed once, as a new skill, when the CV supports it.
- Skills step, in code: names are compared ignoring case, accents, hyphens and spaces. A rename is dropped (the skill keeps its name) when its new name is the name of another skill on the CV, or the name an earlier proposal of the same reply already gives (a rename or a new skill). A new skill is dropped when its name is one the CV already has, or one an earlier proposal already gives. A rename to the skill's own name in another spelling is kept (it is the same skill).
- Dropped ones are logged as `tailor duplicate skills dropped` with the count and item ids only; they are not counted in `removed`.
- The other sections are untouched.

**Acceptance tests** (`tailor-section.test.ts`, skills step).
- Three skills renamed to "Workflow Automation Tools": only the first proposal is returned; the log has one `tailor duplicate skills dropped` entry with count 2 and no skill text.
- A rename to the name of another skill on the CV (other case, with a hyphen) is not returned.
- A new skill whose name the CV already has, and a second new skill with the name of an earlier one in other spelling, are not returned; `removed` stays 0.
- A skill renamed to its own name with other capitals is returned.
- The skills prompt contains the new rule.

## Task 2: "No, but I used something similar" is one tap

```
files: apps/web/src/tailor/QuestionCard.tsx, apps/web/src/tailor/across.test.tsx, apps/web/src/i18n/en-tailor.ts, apps/web/src/i18n/ro-tailor.ts, apps/api/src/tailor/section-pass.ts, apps/api/test/tailor-questions.test.ts
new_files: none
deps: none
size: ~30 lines
```

The owner: no need to ask which tool, when I say I used something similar.

Without the tool's name there is nothing true to write about it, and nothing to attach to a role, so the roles are not asked either: the answer becomes one tap, like "No, and nothing similar".

**Goal.**
- Web, the all-roles question: picking "No, but I used something similar" makes the answer ready at once. The "What did you use?" field and the "In which roles did you use it?" list are gone, with their texts in both languages. The answer sent is `{ value: "No", via: "option", use: "similar" }`, with no roles. Picking it again clears it; ticking a role afterwards switches to "used", as today for "none".
- API: `acrossNote` gives no note for a "similar" answer with no roles ticked (so nothing is sent to the writing steps and no note is saved). A stored older answer that names a tool and has roles keeps its note as today.
- The gap counts as answered, as for "none": no role asks it again.

**Acceptance tests.**
- `across.test.tsx`: picking "something similar" shows no text field and no second role list, enables Next, and sends `use: "similar"` with value "No" and no `roleIds`.
- `tailor-questions.test.ts`: after a "similar" answer with no roles, no job note is saved on any role and a later role step does not ask the gap again; `acrossNote` returns null for it, and still returns the "Used X for the kind of work…" note for an older answer with a tool and roles.

## Note for the owner

After Task 2 the two "No" answers lead to the same result. Merging them into one "No" is a one-line change if he wants it.
