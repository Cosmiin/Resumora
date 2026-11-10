import { beforeEach, describe, expect, it, vi } from "vitest";
import { AchievementsAnswerSchema, emptyCv, type CvContent } from "@resumora/shared";
import { createApp } from "../app.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";

const headers = { authorization: "Bearer user-a", "content-type": "application/json" };
const payroll = roleWith(["Prepared payroll for 40 staff.", "Cut late payments by half."], {
  notes: [{ id: "n1", question: "What changed?", answer: "Errors dropped to zero in 6 months", via: ["type"], askedAt: "2026-11-05T10:00:00.000Z" }],
});
const sales = roleWith(["Sold software to 12 banks."], { company: "Fintech Co", title: "Account Manager" });
let cv: ReturnType<typeof memoryCvRepo>;
let model: ReturnType<typeof fakeModel>;
let app: ReturnType<typeof createApp>;
const post = (auth = headers) => app.request("/v1/enrich/achievements", { method: "POST", headers: auth, body: "{}" });
async function save(content: Partial<CvContent>) {
  await cv.save({ ...emptyCv("en"), experience: [payroll, sales], ...content }, (await cv.get()).version);
}

beforeEach(async () => {
  cv = memoryCvRepo();
  await save({});
  model = fakeModel(() => ({ suggestions: [] }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "user-a" ? { id: token, token } : null),
    cvRepo: () => cv,
    insightsRepo: (user) => memoryInsightsRepo(user.id),
    model: () => model.deps,
    importRepo: () => { throw new Error("not used"); },
    jobRepo: () => { throw new Error("not used"); },
    jobQueue: { send: async () => {} },
    queue: { send: async () => {} },
    log: vi.fn(),
  });
});

describe("POST /v1/enrich/achievements", () => {
  it("sends the period on a past role's notes, leaving undated notes unchanged", async () => {
    await save({ experience: [
      { ...payroll, startDate: "2014-10", endDate: "2015-07", current: false },
      { ...sales, startDate: "", notes: payroll.notes },
    ] });
    const before = await cv.get();
    expect((await post()).status).toBe(200);
    const user = (model.requests[0]!.messages as { content: string }[])[1]!.content;
    const roles = JSON.parse(user.split("<roles>\n")[1]!.split("\n</roles>")[0]!);
    expect(roles[0].notes).toEqual(payroll.notes.map(({ question, answer }) => ({ question, answer, period: "2014-10 – 2015-07" })));
    expect(roles[1].notes).toEqual(payroll.notes.map(({ question, answer }) => ({ question, answer })));
    expect(await cv.get()).toEqual(before);
  });

  it("needs sign-in", async () => {
    expect((await post({ "content-type": "application/json" } as typeof headers)).status).toBe(401);
  });

  it("returns 3–5 suggestions, each from a real role, skipping ones already listed and invented numbers", async () => {
    await save({ achievements: [{ id: "a1", text: "Cut late payments by half." }] });
    model = fakeModel(() => ({ suggestions: [
      { text: "Brought payroll errors to zero within 6 months", roleId: payroll.id },
      { text: "  cut late payments by half. ", roleId: payroll.id },
      { text: "Won 12 banks as software clients", roleId: sales.id },
      { text: "Grew revenue by 300%", roleId: sales.id },
      { text: "Ran payroll for 40 staff without a missed run", roleId: payroll.id },
      { text: "Led a team", roleId: "no-such-role" },
      { text: "Kept every payroll on time", roleId: payroll.id },
      { text: "Opened a new bank segment", roleId: sales.id },
      { text: "Trained the team on payroll", roleId: payroll.id },
    ] }));
    const res = await post();
    expect(res.status).toBe(200);
    const { suggestions } = AchievementsAnswerSchema.parse(await res.json());
    expect(suggestions).toEqual([
      { text: "Brought payroll errors to zero within 6 months", roleId: payroll.id },
      { text: "Won 12 banks as software clients", roleId: sales.id },
      { text: "Ran payroll for 40 staff without a missed run", roleId: payroll.id },
      { text: "Kept every payroll on time", roleId: payroll.id },
      { text: "Opened a new bank segment", roleId: sales.id },
    ]);
    const sent = JSON.stringify(model.requests[0]?.messages);
    expect(sent).toContain("Errors dropped to zero in 6 months");
    expect(sent).toContain("Cut late payments by half.");
  });

  it("returns fewer when only a few hold up, and none without a model call when the roles say nothing", async () => {
    model = fakeModel(() => ({ suggestions: [{ text: "Won 12 banks as software clients", roleId: sales.id }] }));
    expect(AchievementsAnswerSchema.parse(await (await post()).json()).suggestions).toHaveLength(1);
    await save({ experience: [roleWith([])] });
    model = fakeModel(() => ({ suggestions: [] }));
    expect(AchievementsAnswerSchema.parse(await (await post()).json()).suggestions).toEqual([]);
    expect(model.requests).toHaveLength(0);
  });
});
