import { expect, it } from "vitest";
import {
  dateInput,
  parseDateInput,
  prepareDraft,
  richText,
  safeRichHtml,
  patchFact,
  setContributions,
  readContributions,
} from "./editing";
import {
  blankDraft,
  clone,
  fact,
  newEducation,
  newOptionalEntry,
  newRole,
} from "./model";
import {
  saveAnswer,
  addAnswerToCv,
  removeAnswerFromCv,
  enrichmentTarget,
} from "./enrichment";
import { MemoryBaseCvAdapter } from "./adapter";
import { validateDraft } from "./validation";
it("roundtrips month/year, year-only and empty dates without inventing unknown months", () => {
  for (const value of [
    { year: "2020", month: "2" },
    { year: "2019", month: "" },
    { year: "", month: "" },
  ])
    expect(parseDateInput(dateInput(value))).toEqual(value);
  expect(parseDateInput("092021")).toEqual({ year: "2021", month: "9" });
  expect(parseDateInput("13/2020")).toEqual({ year: "2020", month: "13" });
  expect(parseDateInput("02/")).toEqual({ year: "", month: "2" });
});

it("preserves authored spaces and empty native lines when publishing preview text", () => {
  expect(richText(" First  <br><br>Second ")).toBe(" First  \n\nSecond ");
  expect(richText("<div>First</div><div><br></div><div>Second</div>")).toBe(
    "First\n\nSecond",
  );
});
it("keeps allowed text/list formatting while eliminating executable elements, remote content and attributes", () => {
  const safe = safeRichHtml(
    '<p onclick="x()"><b>Own</b> <i>work</i></p><ol><li>One</li></ol><script>bad()</script><img src="https://bad.test/a"><svg onload="x()"></svg>',
  );
  const doc = new DOMParser().parseFromString(safe, "text/html");
  expect(doc.querySelectorAll("script,img,svg,[onclick]")).toHaveLength(0);
  expect(doc.querySelector("b")?.textContent).toBe("Own");
  expect(doc.querySelector("ol li")?.textContent).toBe("One");
  expect(richText(safe)).toBe("Own work\nOne");
});
it("preserves original imported name and provenance, creates only empty required controls, and changes source lineage on manual editing", () => {
  const d = blankDraft();
  d.name = {
    ...fact("Unsplit Original"),
    sourceId: "import",
    sourceClaimId: "name",
    status: "extracted_unconfirmed",
  };
  delete d.nameParts;
  d.contacts = [];
  const old = clone(d),
    ready = prepareDraft(d);
  expect(d).toEqual(old);
  expect(ready.name.value).toBe("Unsplit Original");
  expect(ready.nameParts).toBeUndefined();
  expect(ready.contacts.every((c) => c.value.value === "")).toBe(true);
  const edited = patchFact(ready, ready.name, "Supplied Name");
  expect(edited.name.sourceId).toBe("local_manual");
  expect(edited.name.sourceClaimId).toBeUndefined();
  expect(edited.name.sourceLineage).toContainEqual({
    sourceId: "import",
    sourceClaimId: "name",
  });
  expect(ready.name.status).toBe("extracted_unconfirmed");
});
it("saves incomplete drafts without attesting extracted facts and enforces required completion independently", async () => {
  const d = blankDraft();
  d.name = {
    ...d.name,
    value: "Imported name",
    status: "extracted_unconfirmed",
  };
  const adapter = new MemoryBaseCvAdapter();
  const s = await adapter.save({
    draft: d,
    mode: "autosave",
    expectedRevision: 0,
    requestId: "auto",
  });
  expect(s.reason).toBe("autosave");
  expect(s.draft.name.status).toBe("extracted_unconfirmed");
  expect(validateDraft(s.draft).length).toBeGreaterThan(0);
  await expect(
    adapter.save({ draft: d, expectedRevision: 1, requestId: "explicit" }),
  ).rejects.toMatchObject({ code: "validation" });
  expect((await adapter.history())[0]).toEqual(s);
});
it.each([
  "role",
  "projects",
  "certifications",
  "volunteering",
  "custom",
] as const)(
  "keeps %s Q&A independent from explicit CV additions, updates and removal",
  (kind) => {
    const d = blankDraft();
    let targetId: string;
    if (kind === "role") {
      const entry = newRole();
      d.roles.push(entry);
      targetId = entry.id;
    } else {
      const entry = newOptionalEntry();
      d.optionalSections.push({ id: kind, kind, label: "", entries: [entry] });
      targetId = entry.id;
    }
    const target = enrichmentTarget(d, targetId)!;
    target.field.value = "Original source content";
    const answer = {
      id: "answer",
      targetId: targetId,
      question: "context" as const,
      questionText: "What work did you personally do?",
      text: "First\nSecond",
      status: "draft" as const,
    };
    const original = clone(d);
    const saved = saveAnswer(d, answer, target.field.id);
    expect(saved.roles).toEqual(d.roles);
    expect(saved.optionalSections).toEqual(d.optionalSections);
    expect(saved.presentation).toEqual(d.presentation);
    expect(saved.answers[0]).toMatchObject({
      questionText: answer.questionText,
      text: answer.text,
    });
    expect(saved.sources.at(-1)).toMatchObject({
      label: answer.questionText,
      text: answer.text,
      locator: targetId,
    });
    const added = addAnswerToCv(saved, answer.id, target.field.id);
    expect(addAnswerToCv(added, answer.id, target.field.id)).toEqual(added);
    const first = enrichmentTarget(added, targetId)!.entry.bullets![0];
    expect(added.answers[0].cvFieldId).toBe(first.fieldId);
    expect(enrichmentTarget(added, targetId)!.field).toEqual(target.field);
    const edited = patchFact(added, first, "Independent CV wording");
    expect(edited.answers).toEqual(added.answers);
    const revised = saveAnswer(
      edited,
      { ...edited.answers[0], status: "draft", text: "Revised context" },
      target.field.id,
    );
    expect(enrichmentTarget(revised, targetId)!.entry.bullets![0].value).toBe(
      "Independent CV wording",
    );
    const updated = addAnswerToCv(revised, answer.id, target.field.id);
    expect(enrichmentTarget(updated, targetId)!.entry.bullets).toHaveLength(1);
    expect(
      enrichmentTarget(updated, targetId)!.entry.bullets![0],
    ).toMatchObject({ fieldId: first.fieldId, value: "Revised context" });
    const removed = removeAnswerFromCv(updated, answer.id);
    expect(removed.answers[0].text).toBe("Revised context");
    expect(removed.answers[0].questionText).toBe(answer.questionText);
    expect(removed.answers[0].cvFieldId).toBeUndefined();
    expect(enrichmentTarget(removed, targetId)!.entry.bullets).toEqual([]);
    expect(
      enrichmentTarget(
        addAnswerToCv(removed, answer.id, target.field.id),
        targetId,
      )!.entry.bullets,
    ).toHaveLength(1);
    expect(() =>
      saveAnswer(saved, { ...answer, text: "" }, target.field.id),
    ).toThrow("emptyAnswer");
    expect(() => addAnswerToCv(saved, answer.id, "stale")).toThrow(
      "staleTarget",
    );
    expect(d).toEqual(original);
  },
);

function richRoot(d: ReturnType<typeof blankDraft>, roleId: string) {
  const root = document.createElement("div");
  for (const f of d.roles.find((r) => r.id === roleId)!.bullets) {
    const block = document.createElement("div");
    block.dataset.contribution = f.fieldId;
    block.textContent = f.value;
    root.append(block);
  }
  return root;
}
it("keeps explicit associations through multiline wording, formatting, insertion, reorder and deletion", () => {
  const d = blankDraft(),
    role = newRole();
  d.roles.push(role);
  let initial = d;
  for (const [id, text, question] of [
    ["a", "First\nSecond", "context"],
    ["b", "Same words", "tools"],
  ] as const) {
    initial = saveAnswer(
      initial,
      {
        id,
        targetId: role.id,
        question,
        questionText: `Full question ${id}?`,
        text,
        status: "draft",
      },
      role.context.id,
    );
    initial = addAnswerToCv(initial, id, role.context.id);
  }
  const root = richRoot(initial, role.id);
  const first = root.children[0] as HTMLElement;
  first.innerHTML = "<ul><li><b>First</b><br>Second</li></ul>";
  const formatted = setContributions(initial, role.id, readContributions(root));
  expect(formatted.roles[0].bullets).toEqual(initial.roles[0].bullets);
  expect(formatted.answers).toEqual(initial.answers);
  expect(formatted.sources).toEqual(initial.sources);
  first.innerHTML = "<p><b>First</b></p><p>Second!</p>";
  const edited = setContributions(formatted, role.id, readContributions(root));
  expect(edited.roles[0].bullets[0]).toMatchObject({
    fieldId: initial.roles[0].bullets[0].fieldId,
    value: "First\nSecond!",
  });
  expect(edited.answers).toEqual(initial.answers);
  expect(edited.roles[0].bullets[0].sourceLineage).toContainEqual({
    sourceId: initial.roles[0].bullets[0].sourceId,
  });
  const newBlock = document.createElement("p");
  newBlock.textContent = "New";
  root.prepend(newBlock);
  const inserted = setContributions(edited, role.id, readContributions(root));
  expect(inserted.roles[0].bullets.slice(1)).toEqual(edited.roles[0].bullets);
  root.prepend(root.lastChild!);
  const reordered = setContributions(
    inserted,
    role.id,
    readContributions(root),
  );
  expect(reordered.roles[0].bullets.map((f) => f.value)).toEqual([
    "Same words",
    "New",
    "First\nSecond!",
  ]);
  first.remove();
  const removed = setContributions(reordered, role.id, readContributions(root));
  expect(removed.answers.find((a) => a.id === "a")!.cvFieldId).toBeUndefined();
  expect(removed.answers.find((a) => a.id === "a")!.text).toBe("First\nSecond");
  expect(removed.answers.find((a) => a.id === "b")!.cvFieldId).toBe(
    initial.answers.find((a) => a.id === "b")!.cvFieldId,
  );
  const revised = saveAnswer(
    removed,
    {
      ...removed.answers.find((a) => a.id === "b")!,
      text: "Revised B",
      status: "draft",
    },
    role.context.id,
  );
  expect(revised.roles).toEqual(removed.roles);
  const updated = addAnswerToCv(revised, "b", role.context.id);
  expect(updated.roles[0].bullets.map((f) => f.value)).toEqual([
    "Revised B",
    "New",
  ]);
});

it("does not reassociate identical text and combines native fragments carrying the same identity", () => {
  const d = blankDraft(),
    role = newRole();
  role.bullets = [fact("Same"), fact("Same")];
  d.roles.push(role);
  const root = richRoot(d, role.id);
  const second = root.children[1];
  root.prepend(second);
  const reordered = setContributions(d, role.id, readContributions(root));
  expect(reordered.roles[0].bullets.map((f) => f.fieldId)).toEqual([
    role.bullets[1].fieldId,
    role.bullets[0].fieldId,
  ]);
  const fragment = second.cloneNode(true) as HTMLElement;
  fragment.textContent = "Continuation";
  second.after(fragment);
  const split = setContributions(reordered, role.id, readContributions(root));
  expect(split.roles[0].bullets[0]).toMatchObject({
    fieldId: role.bullets[1].fieldId,
    value: "Same\nContinuation",
  });
  second.remove();
  fragment.remove();
  expect(
    setContributions(split, role.id, readContributions(root)).roles[0].bullets,
  ).toEqual([role.bullets[0]]);
});

it("invalidates formatted contributions on a factual edit without changing saved career context", () => {
  const d = blankDraft(),
    role = newRole();
  role.bullets = [
    {
      ...fact("Old wording"),
      sourceId: "fixture",
      sourceClaimId: "claim",
      status: "extracted_unconfirmed",
    },
  ];
  d.roles.push(role);
  const formatted = setContributions(
    d,
    role.id,
    readContributions(richRoot(d, role.id)),
  );
  expect(formatted.roles[0].bullets).toEqual(role.bullets);
  const changed = patchFact(
    formatted,
    formatted.roles[0].bullets[0],
    "Corrected wording",
  );
  expect(changed.presentation.contributionHtml?.[role.id]).toBeUndefined();
  expect(changed.roles[0].bullets[0].sourceLineage).toContainEqual({
    sourceId: "fixture",
    sourceClaimId: "claim",
  });
  expect(formatted.roles[0].bullets[0].value).toBe("Old wording");
});

it.each([
  ["First<div>Second</div>", ["First", "Second"]],
  ["Before<p>Paragraph</p>After", ["Before", "Paragraph", "After"]],
  ["<div>First<div>Second</div>Third</div>", ["First", "Second", "Third"]],
  [
    "<ul><li>Parent<ul><li>Child</li></ul>Tail</li><li>Sibling</li></ul>",
    ["Parent", "Child", "Tail", "Sibling"],
  ],
  ["<p><b>Bold</b> and <i>italic</i><br>Next</p>", ["Bold and italic", "Next"]],
  [
    "Before<ol><li>One</li><li>Two</li></ol>After",
    ["Before", "One", "Two", "After"],
  ],
])("preserves rich text block boundaries for %s", (html, expected) => {
  expect(richText(html as string)).toBe((expected as string[]).join("\n"));
});

it("excludes inactive end dates consistently and validates them again after ongoing is cleared", () => {
  const d = blankDraft(),
    r = newRole(),
    e = newEducation();
  const optional = newOptionalEntry();
  d.roles.push(r);
  d.education.push(e);
  d.optionalSections.push({
    id: "projects",
    kind: "projects",
    label: "",
    entries: [optional],
  });
  for (const entry of [r, e, optional]) {
    entry.end = fact({ year: "", month: "2" });
    entry.ongoing = fact(false);
    expect(validateDraft(d)).toContainEqual({
      field: entry.end.fieldId,
      code: "date",
    });
    entry.ongoing.value = true;
    expect(validateDraft(d).some((i) => i.field === entry.end.fieldId)).toBe(
      false,
    );
    expect(entry.end.value).toEqual({ year: "", month: "2" });
    entry.ongoing.value = false;
    expect(validateDraft(d)).toContainEqual({
      field: entry.end.fieldId,
      code: "date",
    });
  }
});
