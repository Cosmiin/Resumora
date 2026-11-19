import { beforeEach, describe, expect, it } from "vitest";
import { buildRoleResult, emptyCv, fingerprint, type Change, type Experience, type Note } from "@resumora/shared";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { allSpecific, fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";
import { placeAnswers } from "./use-answers.ts";

const note = (question: string, answer: string): Note =>
  ({ id: `n-${question.length}`, question, answer, via: ["type"], askedAt: "2026-11-19T10:00:00.000Z" });

const stores = note("How many stores did you run?", "About 12 stores, on Shopify Plus.");
const boss = note("Who did you report to?", "I reported to the Head of Ecommerce.");

let role: Experience;
let cv: ReturnType<typeof memoryCvRepo>;
let insights: ReturnType<typeof memoryInsightsRepo>;
let model: ReturnType<typeof fakeModel>;
let reply: unknown;

async function save(r: Experience) {
  role = r;
  await cv.save({ ...emptyCv("en"), experience: [role] }, (await cv.get()).version);
  await insights.put(role.id, buildRoleResult(role, allSpecific(role), fingerprint(role, "en")));
}

const run = (changes: Change[] = [], questions = [stores.question, boss.question], fp = fingerprint(role, "en")) =>
  placeAnswers({ cv, insights, model: model.deps, userId: "user-a" }, { roleId: role.id, fingerprint: fp, changes, questions });
const userMessage = () => (model.requests[0]!.messages as { content: string }[])[1]!.content;

beforeEach(async () => {
  cv = memoryCvRepo();
  insights = memoryInsightsRepo("user-a");
  reply = { description: null, lines: [] };
  model = fakeModel(() => reply);
  await save(roleWith(["Managed online stores.", "Ran discount campaigns."], { notes: [stores, boss], description: "Ecommerce agency." }));
});

describe("placeAnswers", () => {
  it("makes no model call when no note answers this round's questions", async () => {
    expect(await run([], ["What did you build?"])).toEqual({ changes: [] });
    expect(model.requests).toHaveLength(0);
  });

  it("matches questions the way the path keys them (case and spaces ignored)", async () => {
    await run([], ["  how many STORES did you   run? "]);
    expect(model.requests).toHaveLength(1);
    expect(model.logged.map((l) => l.task)).toEqual(["enrich_use_answers"]);
    expect(userMessage()).toContain("About 12 stores");
    expect(userMessage()).not.toContain("Head of Ecommerce");
    expect(userMessage()).toContain("write every line to reach specific on all five parts");
    expect(userMessage()).not.toContain("must reach at least the role's line average");
  });

  it("returns a fact placed in the description as a description change", async () => {
    reply = { description: "Ecommerce agency. Reported to the Head of Ecommerce.", lines: [] };
    const out = await run();
    expect(out.changes).toEqual([expect.objectContaining({ kind: "description", text: "Ecommerce agency. Reported to the Head of Ecommerce." })]);
  });

  it("returns a line rewrite as a bullet change, and a line that fits nowhere as a new line", async () => {
    reply = { description: null, lines: [
      { id: role.bullets[0]!.id, text: "Managed 12 online stores on Shopify Plus." },
      { id: null, text: "Ran Shopify Plus stores for the agency's clients." },
    ] };
    const out = await run();
    expect(out.changes).toEqual([
      expect.objectContaining({ kind: "bullet", bulletId: role.bullets[0]!.id, text: "Managed 12 online stores on Shopify Plus." }),
      expect.objectContaining({ kind: "new", text: "Ran Shopify Plus stores for the agency's clients." }),
    ]);
    const ids = out.changes.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(role.bullets[0]!.id);
  });

  it("drops a line with a number that neither the role nor its notes say", async () => {
    reply = { description: null, lines: [{ id: role.bullets[0]!.id, text: "Managed 50 stores on Shopify Plus." }] };
    expect(await run()).toEqual({ changes: [] });
  });

  it("drops a line over 440 characters", async () => {
    const long = `${`Managed 12 online stores on Shopify Plus ${"and more ".repeat(60)}`.slice(0, 440)}x`;
    expect(long.length).toBe(441);
    reply = { description: null, lines: [{ id: role.bullets[0]!.id, text: long }] };
    expect(await run()).toEqual({ changes: [] });
  });

  it("keeps a line of exactly 440 characters", async () => {
    const text = `Managed 12 online stores on Shopify Plus ${"and more ".repeat(60)}`.slice(0, 439).trimEnd().padEnd(439, "x") + "y";
    expect(text.length).toBe(440);
    reply = { description: null, lines: [{ id: role.bullets[0]!.id, text }] };
    expect((await run()).changes).toEqual([expect.objectContaining({ kind: "bullet", bulletId: role.bullets[0]!.id, text })]);
  });

  it("drops a line for an unknown id and a line that changes nothing", async () => {
    reply = { description: null, lines: [
      { id: "nope", text: "Managed 12 online stores." },
      { id: role.bullets[1]!.id, text: "Ran discount campaigns." },
    ] };
    expect(await run()).toEqual({ changes: [] });
  });

  it("works on the proposed role: the model sees a rewritten line's new text, and changes target it", async () => {
    const rewrite: Change = { id: "c1", kind: "bullet", bulletId: role.bullets[0]!.id, text: "Managed online stores for agency clients." };
    reply = { description: null, lines: [{ id: role.bullets[0]!.id, text: "Managed online stores for agency clients." }] };
    const out = await run([rewrite]);
    expect(userMessage()).toContain("Managed online stores for agency clients.");
    expect(userMessage()).not.toContain("\"Managed online stores.\"");
    // Same text as the proposed line: nothing to change.
    expect(out.changes).toEqual([]);
  });

  it("409 when the role changed since the fingerprint", async () => {
    await expect(run([], undefined, "old")).rejects.toMatchObject({ status: 409, code: "not_saved" });
  });
});
