import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemLinesAnswerSchema, emptyCv, type CvContent } from "@resumora/shared";
import { createApp } from "../app.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { fakeModel } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";

const headers = { authorization: "Bearer user-a", "content-type": "application/json" };
let cv: ReturnType<typeof memoryCvRepo>;
let answers: unknown[];
let model: ReturnType<typeof fakeModel>;
let app: ReturnType<typeof createApp>;
const post = (body: unknown) => app.request("/v1/enrich/item-lines", { method: "POST", headers, body: JSON.stringify(body) });
const course = { section: "courses", itemId: "c1", text: "We built pivot tables and dashboards for the monthly sales report in Excel." };

const content: CvContent = {
  ...emptyCv("en"),
  courses: [{ id: "c1", name: "Excel for analysts", provider: "Udemy", date: "2022-03", bullets: [{ id: "c1-l1", text: "Pivot tables for sales data." }] }],
  interests: [{ id: "i1", name: "Chess" }],
};

beforeEach(async () => {
  cv = memoryCvRepo();
  await cv.save(content, (await cv.get()).version);
  answers = [];
  model = fakeModel(() => answers.shift());
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

describe("POST /v1/enrich/item-lines", () => {
  it("validates the section, the item and the text", async () => {
    expect((await post({ ...course, section: "experience" })).status).toBe(400);
    expect((await post({ ...course, text: "   " })).status).toBe(400);
    expect((await post({ section: "courses", itemId: "c1" })).status).toBe(400);
    // An item that isn't saved in that section (or exists only in another one).
    expect((await post({ ...course, itemId: "nope" })).status).toBe(409);
    expect((await post({ ...course, section: "awards" })).status).toBe(409);
    expect(model.requests).toHaveLength(0);
  });

  it("returns short lines for a course, on the cheap tier, logged as enrich_item_lines", async () => {
    answers.push({ lines: ["Built monthly sales dashboards in Excel.", "Summarised sales data with pivot tables for the monthly report."] });
    const res = await post(course);
    expect(res.status).toBe(200);
    const body = ItemLinesAnswerSchema.parse(await res.json());
    expect(body.lines).toEqual(["Built monthly sales dashboards in Excel.", "Summarised sales data with pivot tables for the monthly report."]);
    expect(model.logged.map((l) => l.task)).toEqual(["enrich_item_lines"]);
    expect(model.requests[0]!.model).toBe("m");
    const user = JSON.stringify(model.requests[0]!.messages);
    expect(user).toContain("Excel for analysts");
    expect(user).toContain("monthly sales report");
  });

  it("drops a line naming a tool or a number not in the item or the text, and one already under the item", async () => {
    answers.push({ lines: [
      "Built dashboards in Tableau.",
      "Cut reporting time by 40%.",
      "Pivot tables for sales data.",
      "Built monthly sales dashboards in Excel.\nAnd more.",
      "Built monthly sales dashboards in Excel.",
    ] });
    const body = ItemLinesAnswerSchema.parse(await (await post(course)).json());
    expect(body.lines).toEqual(["Built monthly sales dashboards in Excel."]);
  });

  it("an empty answer gives no lines", async () => {
    answers.push({ lines: [] });
    const body = ItemLinesAnswerSchema.parse(await (await post({ section: "interests", itemId: "i1", text: "I play online most evenings." })).json());
    expect(body.lines).toEqual([]);
  });

  it("a failing model is a 502, not a crash", async () => {
    model = fakeModel(() => ({}), 500);
    expect((await post(course)).status).toBeGreaterThanOrEqual(502);
  });
});
