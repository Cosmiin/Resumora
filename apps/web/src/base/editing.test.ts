import { expect, it } from "vitest";
import {
  dateInput,
  parseDateInput,
  prepareDraft,
  richLines,
  safeRichHtml,
  patchFact,
} from "./editing";
import { blankDraft, clone, fact, newOptionalEntry, newRole } from "./model";
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
