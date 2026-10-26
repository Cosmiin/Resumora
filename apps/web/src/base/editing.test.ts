import { expect, it } from "vitest";
import {
  dateInput,
  parseDateInput,
  prepareDraft,
  richLines,
  safeRichHtml,
  patchFact,
  setContributions,
} from "./editing";
import {
  allFacts,
  blankDraft,
  clone,
  fact,
  newEducation,
  newOptionalEntry,
  newRole,
} from "./model";
import { applyAnswer } from "./enrichment";
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
it("keeps allowed text/list formatting while eliminating executable elements, remote content and attributes", () => {
  const safe = safeRichHtml(
    '<p onclick="x()"><b>Own</b> <i>work</i></p><ol><li>One</li></ol><script>bad()</script><img src="https://bad.test/a"><svg onload="x()"></svg>',
  );
  const doc = new DOMParser().parseFromString(safe, "text/html");
  expect(doc.querySelectorAll("script,img,svg,[onclick]")).toHaveLength(0);
  expect(doc.querySelector("b")?.textContent).toBe("Own");
  expect(doc.querySelector("ol li")?.textContent).toBe("One");
  expect(richLines(safe)).toEqual(["Own work", "One"]);
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
it("enriches optional targets without mutating their source, tracks the actual replacement fact and rejects stale targets", () => {
  for (const kind of [
    "projects",
    "certifications",
    "volunteering",
    "custom",
  ] as const) {
    const d = blankDraft(),
      entry = newOptionalEntry();
    entry.title = fact("Synthetic entry");
    entry.details = fact("Original details");
    d.optionalSections.push({ id: kind, kind, label: "", entries: [entry] });
    const old = clone(d);
    const answer = {
      id: "answer",
      targetId: entry.id,
      question: "contribution" as const,
      text: "Exact own words",
      status: "draft" as const,
      mode: "replace" as const,
    };
    const result = applyAnswer(d, answer, entry.details.id);
    const updated = result.optionalSections.at(-1)!.entries[0].details;
    expect(updated.value).toBe(answer.text);
    expect(result.answers[0].factId).toBe(updated.id);
    expect(result.sources.at(-1)?.locator).toBe(entry.id);
    expect(d).toEqual(old);
    expect(() => applyAnswer(result, answer, entry.details.id)).toThrow(
      "staleTarget",
    );
  }
});
it("revises a committed enrichment answer without duplicating its contribution", () => {
  const d = blankDraft(),
    r = newRole();
  d.roles.push(r);
  const answer = {
    id: "answer",
    targetId: r.id,
    question: "impact" as const,
    text: "First",
    status: "draft" as const,
    mode: "append" as const,
  };
  const first = applyAnswer(d, answer, r.context.id);
  const second = applyAnswer(
    first,
    { ...first.answers[0], status: "draft", text: "Revised exact text" },
    r.context.id,
  );
  expect(second.roles[0].bullets).toHaveLength(1);
  expect(second.roles[0].bullets[0].value).toBe("Revised exact text");
  expect(second.answers[0].factId).toBe(second.roles[0].bullets[0].id);
  expect(first.roles[0].bullets[0].value).toBe("First");
});

it.each(["projects", "certifications", "volunteering", "custom"] as const)(
  "preserves independent %s answers, original details and links through revisions and manual edits",
  (kind) => {
    const d = blankDraft(),
      entry = newOptionalEntry();
    entry.details = {
      ...fact("Original details"),
      sourceId: "import",
      sourceClaimId: "details",
    };
    d.optionalSections.push({ id: kind, kind, label: "", entries: [entry] });
    const original = clone(d);
    const answer = {
      id: "first",
      targetId: entry.id,
      question: "context" as const,
      text: "First answer",
      status: "draft" as const,
      mode: "append" as const,
    };
    let next = applyAnswer(d, answer, entry.details.id);
    next = applyAnswer(
      next,
      { ...answer, id: "second", question: "tools", text: "Second answer" },
      entry.details.id,
    );
    next = applyAnswer(
      next,
      { ...next.answers[0], text: "Revised first", status: "draft" },
      entry.details.id,
    );
    let updated = next.optionalSections.at(-1)!.entries[0];
    expect(updated.details).toEqual(entry.details);
    expect(updated.bullets!.map((f) => f.value)).toEqual([
      "Revised first",
      "Second answer",
    ]);
    const secondSource = next.sources.find((s) => s.text === "Second answer")!;
    next = patchFact(next, updated.bullets![1], "Manually corrected second");
    const second = next.answers.find((a) => a.id === "second")!;
    expect(second.text).toBe("Manually corrected second");
    next = applyAnswer(
      next,
      { ...second, status: "draft", text: "Revised second" },
      entry.details.id,
    );
    updated = next.optionalSections.at(-1)!.entries[0];
    expect(updated.bullets!.map((f) => f.value)).toEqual([
      "Revised first",
      "Revised second",
    ]);
    for (const saved of next.answers) {
      const destination = allFacts(next).find((f) => f.id === saved.factId)!;
      expect(destination.value).toBe(saved.text);
      expect(next.sources.some((s) => s.id === saved.sourceId)).toBe(true);
    }
    expect(updated.bullets![1].sourceLineage).toContainEqual({
      sourceId: secondSource.id,
    });
    expect(d).toEqual(original);
  },
);

it("keeps role answer links and formatted contributions consistent through preview, bulk edits, revisions and deletion", () => {
  const d = blankDraft(),
    r = newRole();
  d.roles.push(r);
  const answer = {
    id: "answer",
    targetId: r.id,
    question: "context" as const,
    text: "First",
    status: "draft" as const,
    mode: "append" as const,
  };
  const first = applyAnswer(d, answer, r.context.id);
  const formatted = setContributions(first, r.id, "<p><b>First</b></p>");
  const corrected = patchFact(
    formatted,
    formatted.roles[0].bullets[0],
    "Corrected",
  );
  expect(corrected.presentation.contributionHtml?.[r.id]).toBeUndefined();
  expect(corrected.answers[0]).toMatchObject({
    text: "Corrected",
    factId: corrected.roles[0].bullets[0].id,
  });
  const bulk = setContributions(corrected, r.id, "<p><i>Bulk edit</i></p>");
  expect(bulk.answers[0]).toMatchObject({
    text: "Bulk edit",
    factId: bulk.roles[0].bullets[0].id,
  });
  const revised = applyAnswer(
    bulk,
    { ...bulk.answers[0], status: "draft", text: "Final" },
    r.context.id,
  );
  expect(revised.roles[0].bullets.map((f) => f.value)).toEqual(["Final"]);
  expect(revised.presentation.contributionHtml?.[r.id]).toBeUndefined();
  expect(
    allFacts(revised).find((f) => f.id === revised.answers[0].factId)?.value,
  ).toBe("Final");
  expect(revised.roles[0].bullets[0].sourceLineage).toContainEqual({
    sourceId: first.sources.at(-1)!.id,
  });
  const removed = setContributions(revised, r.id, "");
  expect(removed.roles[0].bullets).toEqual([]);
  expect(removed.answers[0].factId).toBeUndefined();
  expect(formatted.presentation.contributionHtml?.[r.id]).toContain(
    "<b>First</b>",
  );
});

it.each([
  ["New", "Answer A", "Answer B"],
  ["Answer A", "New", "Answer B"],
  ["Answer A", "Answer B", "New"],
  ["Answer B", "Answer A"],
  ["Answer B"],
  ["Answer A"],
])(
  "retains surviving answer identities after bulk contributions become %j",
  (...lines) => {
    const d = blankDraft(),
      role = newRole();
    d.roles.push(role);
    let enriched = d;
    for (const [id, text, question] of [
      ["a", "Answer A", "context"],
      ["b", "Answer B", "tools"],
    ] as const) {
      enriched = applyAnswer(
        enriched,
        {
          id,
          text,
          question,
          targetId: role.id,
          status: "draft",
          mode: "append",
        },
        role.context.id,
      );
    }
    const original = clone(enriched);
    const edited = setContributions(
      enriched,
      role.id,
      lines.map((line) => `<p><b>${line}</b></p>`).join(""),
    );
    expect(edited.roles[0].bullets.map((f) => f.value)).toEqual(lines);
    for (const saved of enriched.answers) {
      const answer = edited.answers.find((a) => a.id === saved.id)!;
      expect(answer.text).toBe(saved.text);
      expect(answer.sourceId).toBe(saved.sourceId);
      if (lines.includes(saved.text)) {
        expect(answer.factId).toBe(saved.factId);
        expect(
          edited.roles[0].bullets.find((f) => f.id === saved.factId),
        ).toEqual(enriched.roles[0].bullets.find((f) => f.id === saved.factId));
      } else expect(answer.factId).toBeUndefined();
    }
    const revising = edited.answers.find((a) => lines.includes(a.text))!;
    const revised = applyAnswer(
      edited,
      {
        ...revising,
        text: "Revised answer",
        status: "draft",
      },
      role.context.id,
    );
    expect(revised.roles[0].bullets.map((f) => f.value)).toEqual(
      lines.map((line) => (line === revising.text ? "Revised answer" : line)),
    );
    expect(revised.presentation.contributionHtml?.[role.id]).toBeUndefined();
    expect(enriched).toEqual(original);
  },
);

it("preserves duplicate contributions as distinct facts and keeps edited answers linked", () => {
  const d = blankDraft(),
    role = newRole();
  role.bullets = [fact("Same"), fact("Same"), fact("Last")];
  d.roles.push(role);
  d.answers = role.bullets.map((f, i) => ({
    id: `answer-${i}`,
    targetId: role.id,
    question: "context",
    text: f.value,
    status: "confirmed",
    mode: "append",
    factId: f.id,
  }));
  const inserted = setContributions(
    d,
    role.id,
    "First<div>Same</div><div>Same</div><div>Last</div>",
  );
  expect(inserted.roles[0].bullets.slice(1)).toEqual(role.bullets);
  expect(inserted.answers).toEqual(d.answers);
  const edited = setContributions(
    inserted,
    role.id,
    "<p>First</p><p>Same</p><p>Same</p><p>Edited last</p>",
  );
  expect(edited.answers[2]).toMatchObject({
    text: "Edited last",
    factId: edited.roles[0].bullets[3].id,
  });
  expect(edited.roles[0].bullets[3].fieldId).toBe(role.bullets[2].fieldId);
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
  expect(richLines(html as string)).toEqual(expected);
  const d = blankDraft(),
    role = newRole();
  d.roles.push(role);
  expect(
    setContributions(d, role.id, html as string).roles[0].bullets.map(
      (f) => f.value,
    ),
  ).toEqual(expected);
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
