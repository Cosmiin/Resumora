import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryBaseCvAdapter, AdapterError } from "./adapter";
import {
  blankDraft,
  clone,
  editFact,
  fact,
  newRole,
  allFacts,
  newOptionalEntry,
  type BaseDraft,
} from "./model";
import { dateError, durationBounds, reversedDates } from "./dates";
import { maraReviewDraft } from "./fixture";
import { saveAnswer, addAnswerToCv } from "./enrichment";
import { selectDocument, validateDraft } from "./validation";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
function initial() {
  const d = blankDraft();
  d.name = fact("Persoană Fictivă");
  d.nameParts = { first: "Persoană", last: "Fictivă" };
  d.titles[0] = fact("Analist");
  d.contacts.forEach((c) => {
    c.value = fact(
      c.kind === "email"
        ? "test@example.test"
        : c.platform === "linkedin"
          ? "https://linkedin.com/in/synthetic"
          : "Synthetic contact",
    );
  });
  const language = newOptionalEntry();
  language.title = fact("Română");
  language.proficiency = fact("Native");
  d.optionalSections[0].entries.push(language);
  return d;
}
function input(draft: BaseDraft, expectedRevision = 0) {
  return {
    draft,
    expectedRevision,
    requestId: crypto.randomUUID(),
  };
}
describe("memory adapter through public operations", () => {
  it("ignores object-key order after transport while retaining array and value changes", async () => {
    const adapter = new MemoryBaseCvAdapter();
    const draft = initial();
    const first = await adapter.save(input(draft));
    const decoded = decodeDraft(encodeDraft(draft));
    decoded.name = Object.fromEntries(
      Object.entries(decoded.name).reverse(),
    ) as typeof decoded.name;
    expect(await adapter.save(input(decoded, 1))).toEqual(first);
    expect(await adapter.history()).toHaveLength(1);
    decoded.contacts.reverse();
    expect((await adapter.save(input(decoded, 1))).revision).toBe(2);
    decoded.language = "en";
    expect((await adapter.save(input(decoded, 2))).revision).toBe(3);
    const date = fact({ year: "2020", month: "2" });
    expect(editFact(date, { month: "2", year: "2020" })).toBe(date);
    expect(editFact(date, { month: "3", year: "2020" }).id).not.toBe(date.id);
  });
  it("saves, reopens cloned immutable versions, restores a new checkpoint, and clears in a new page instance", async () => {
    const adapter = new MemoryBaseCvAdapter(),
      d = initial(),
      original = clone(d),
      first = await adapter.save(input(d));
    d.name.value = "Mutated caller";
    const reopened = (await adapter.load())!;
    expect(reopened.draft.name.value).toBe("Persoană Fictivă");
    reopened.draft.name.value = "Mutated read";
    const secondDraft = clone(original);
    secondDraft.language = "en";
    const second = await adapter.save(input(secondDraft, 1));
    const restored = await adapter.restore({
      snapshotId: first.id,
      expectedRevision: 2,
      requestId: "restore-1",
    });
    expect(restored).toMatchObject({
      revision: 3,
      parentId: second.id,
      restoredFrom: first.id,
      draft: original,
    });
    expect((await adapter.history()).map((s) => s.revision)).toEqual([3, 2, 1]);
    expect((await adapter.history())[2].draft).toEqual(original);
    expect(await new MemoryBaseCvAdapter().load()).toBeNull();
  });
  it("rejects pending/invalid facts, handles conflicts without clobbering, replays one intent, and avoids no-op versions", async () => {
    const adapter = new MemoryBaseCvAdapter(),
      draft = blankDraft();
    draft.name.value = "Test";
    await expect(adapter.save(input(draft))).rejects.toMatchObject({
      code: "validation",
    });
    const write = input(initial()),
      saved = await adapter.save(write);
    expect(await adapter.save(write)).toEqual(saved);
    await expect(
      adapter.save({ ...write, mode: "autosave" }),
    ).rejects.toMatchObject({ code: "requestMismatch" });
    const edited = initial();
    edited.name = editFact(edited.name, "Other");
    await expect(adapter.save(input(edited, 0))).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await adapter.load())!.id).toBe(saved.id);
    expect((await adapter.save(input(write.draft, 1))).revision).toBe(1);
    expect(await adapter.history()).toHaveLength(1);
    await expect(
      adapter.restore({
        snapshotId: "unknown",
        expectedRevision: 1,
        requestId: "x",
      }),
    ).rejects.toBeInstanceOf(AdapterError);
  });
});
describe("date and review boundaries", () => {
  it("preserves partial dates and unions overlap with bounds at a pinned month", () => {
    const d = maraReviewDraft(),
      source = clone(d);
    expect(durationBounds(d.roles, { year: "2026", month: "10" })).toEqual({
      min: 70,
      max: 92,
      known: 3,
      unknown: 0,
    });
    expect(d).toEqual(source);
    expect(d.roles[2].start.value).toEqual({ year: "2019", month: "" });
    const extra = newRole();
    d.roles.push(extra);
    expect(durationBounds(d.roles, { year: "2026", month: "10" }).unknown).toBe(
      1,
    );
    expect(dateError({ year: "", month: "2" })).toBe(true);
    expect(dateError({ year: "2020", month: "13" })).toBe(true);
    expect(
      reversedDates({ year: "2020", month: "" }, { year: "2020", month: "" }),
    ).toBe(false);
    expect(
      reversedDates({ year: "2020", month: "5" }, { year: "2020", month: "4" }),
    ).toBe(true);
  });
  it("maps only Mara source claims, keeps pending wording separate, and isolates edits from the shared fixture", () => {
    const canonical = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "../../schemas/cv/v1/fixtures/journey-mara-base1.json",
        ),
        "utf8",
      ),
    );
    const draft = maraReviewDraft();
    const claimMap = new Map<string, { value: unknown }>(
      canonical.claims.map((c: { id: string; value: unknown }) => [c.id, c]),
    );
    for (const field of allFacts(draft)) {
      if (!field.sourceClaimId) continue;
      const source = claimMap.get(field.sourceClaimId)!.value;
      const expected =
        typeof source === "object" && source !== null
          ? "year" in source
            ? {
                year: String((source as { year: number }).year),
                month: "month" in source ? String(source.month) : "",
              }
            : Object.values(source).join(", ")
          : source;
      expect(field.value).toEqual(expected);
    }
    expect(draft.referenceProse[0].approval).toBe("pending");
    expect(
      allFacts(draft).find((f) => f.sourceClaimId === "claim_resp_a")!.status,
    ).toBe("extracted_unconfirmed");
    expect(maraReviewDraft()).toEqual(draft);
    const edited = editFact(draft.name, "Changed by caller");
    expect(edited.id).not.toBe(draft.name.id);
    expect(edited.fieldId).toBe(draft.name.fieldId);
    expect(edited.status).toBe("user_authored");
    expect(edited.sourceLineage).toContainEqual({
      sourceId: "example_mara_source",
      sourceClaimId: "claim_name",
    });
    draft.name = edited;
    expect(maraReviewDraft().name.value).toBe("Mara Ionescu");
  });
  it("distinguishes file metadata selection from any upload or extraction", () => {
    expect(selectDocument()).toEqual({ state: "empty" });
    expect(selectDocument({ name: "cv.pdf", size: 100 })).toMatchObject({
      state: "unavailable",
    });
    expect(selectDocument({ name: "cv.exe", size: 100 })).toMatchObject({
      state: "unsupported",
    });
    expect(selectDocument({ name: "empty.docx", size: 0 })).toMatchObject({
      state: "unsupported",
    });
    expect(validateDraft(initial())).toEqual([]);
  });
});
describe("enrichment source lineage", () => {
  it("saves context independently, adds only explicitly, and rejects stale or missing destinations", () => {
    const d = maraReviewDraft(),
      role = d.roles[0],
      old = clone(d);
    const answer = {
      id: "answer",
      targetId: role.id,
      question: "contribution" as const,
      questionText: "What did you contribute?",
      text: "We reviewed exceptions; no time saving was measured.",
      status: "draft" as const,
    };
    const saved = saveAnswer(d, answer, role.context.id);
    expect(saved.roles).toEqual(d.roles);
    expect(saved.sources.at(-1)).toMatchObject({
      label: answer.questionText,
      text: answer.text,
      locator: role.id,
    });
    const added = addAnswerToCv(saved, answer.id, role.context.id);
    expect(added.roles[0].bullets.at(-1)).toMatchObject({
      value: answer.text,
      status: "user_authored",
    });
    expect(added.roles[1]).toEqual(d.roles[1]);
    expect(() =>
      saveAnswer(d, { ...answer, text: "" }, role.context.id),
    ).toThrow("emptyAnswer");
    expect(() => saveAnswer(d, answer, "stale")).toThrow("staleTarget");
    expect(d).toEqual(old);
    d.roles.splice(0, 1);
    expect(() => saveAnswer(d, answer, role.context.id)).toThrow("staleTarget");
  });
});
