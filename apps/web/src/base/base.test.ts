import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryBaseCvAdapter, AdapterError } from "./adapter";
import {
  blankDraft,
  clone,
  confirmSection,
  coreSections,
  editFact,
  fact,
  newRole,
  allFacts,
  type BaseDraft,
} from "./model";
import { dateError, durationBounds, reversedDates } from "./dates";
import { maraReviewDraft } from "./fixture";
import { applyAnswer } from "./enrichment";
import { selectDocument, validateDraft } from "./validation";
function confirmed(d: BaseDraft) {
  return coreSections.reduce((next, s) => confirmSection(next, s), d);
}
function initial() {
  const d = blankDraft();
  d.name = fact("Persoană Fictivă");
  return confirmed(d);
}
function input(draft: BaseDraft, expectedRevision = 0) {
  return {
    draft,
    expectedRevision,
    acknowledged: true,
    requestId: crypto.randomUUID(),
  };
}
describe("memory adapter through public operations", () => {
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
      adapter.save({ ...write, acknowledged: false }),
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
    const reviewed = confirmSection(draft, "experience");
    expect(
      allFacts(reviewed).find((f) => f.sourceClaimId === "claim_resp_a")!
        .status,
    ).toBe("user_confirmed");
    expect(maraReviewDraft()).toEqual(draft);
    const edited = editFact(draft.name, "Changed by caller");
    expect(edited.id).not.toBe(draft.name.id);
    expect(edited.fieldId).toBe(draft.name.fieldId);
    expect(edited.status).toBe("draft");
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
    expect(validateDraft(initial(), true)).toEqual([]);
  });
});
describe("enrichment source lineage", () => {
  it("requires reviewed answers, applies verbatim to scoped targets, and rejects a stale or missing role", () => {
    const d = maraReviewDraft(),
      role = d.roles[0],
      old = clone(d);
    const answer = {
      id: "answer",
      targetId: role.id,
      question: "contribution" as const,
      text: "We reviewed exceptions; no time saving was measured.",
      status: "review" as const,
      mode: "append" as const,
    };
    const result = applyAnswer(d, answer, role.context.id);
    expect(result.roles[0].bullets.at(-1)).toMatchObject({
      value: answer.text,
      status: "user_confirmed",
    });
    expect(result.sources.at(-1)).toMatchObject({
      text: answer.text,
      locator: role.id,
    });
    expect(result.roles[1]).toEqual(d.roles[1]);
    expect(d).toEqual(old);
    const replacement = applyAnswer(
      d,
      { ...answer, mode: "replace" },
      role.context.id,
    );
    expect(replacement.roles[0].context.value).toBe(answer.text);
    expect(replacement.roles[0].bullets).toEqual(d.roles[0].bullets);
    expect(() =>
      applyAnswer(d, { ...answer, status: "draft" }, role.context.id),
    ).toThrow("answerUnconfirmed");
    expect(() => applyAnswer(d, answer, "stale")).toThrow("staleTarget");
    d.roles.splice(0, 1);
    expect(() => applyAnswer(d, answer, role.context.id)).toThrow(
      "staleTarget",
    );
  });
});
