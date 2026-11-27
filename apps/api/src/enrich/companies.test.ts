import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompaniesAnswerSchema, ToolsAnswerSchema, emptyCv, type CvContent } from "@resumora/shared";
import { createApp } from "../app.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";

const headers = { authorization: "Bearer user-a", "content-type": "application/json" };
const first = roleWith(["Ran payroll in SAP."], { company: "Carbon Global", location: "Remote", title: "HR Manager" });
const second = roleWith(["Hired 40 people."], { company: "carbon global SRL", location: "Remote", title: "Recruiter" });
const third = roleWith(["Placed candidates."], { company: "Robert Half", location: "Toronto", title: "Staffing Manager" });
let cv: ReturnType<typeof memoryCvRepo>;
let model: ReturnType<typeof fakeModel>;
let answer: () => unknown;
let app: ReturnType<typeof createApp>;
const post = (path: string) => app.request(`/v1/enrich/${path}`, { method: "POST", headers, body: "{}" });
async function save(content: Partial<CvContent>) {
  await cv.save({ ...emptyCv("en"), experience: [first, second, third], ...content }, (await cv.get()).version);
}
const sent = () => JSON.stringify(model.requests[0]?.messages);

beforeEach(async () => {
  cv = memoryCvRepo();
  await save({});
  answer = () => ({ companies: [] });
  model = fakeModel(() => answer());
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

describe("POST /v1/enrich/companies", () => {
  it("names each company once, however it is spelled, with the rule to propose only when sure", async () => {
    answer = () => ({ companies: [{ key: "carbon global", proposal: null }, { key: "robert half", proposal: " Staffing and recruitment firm. " }] });
    const res = await post("companies");
    expect(res.status).toBe(200);
    const body = CompaniesAnswerSchema.parse(await res.json());
    expect(body.companies).toEqual([{ key: "carbon global", proposal: null }, { key: "robert half", proposal: "Staffing and recruitment firm." }]);
    expect(sent().match(/"key\\":\\"carbon global\\"/g)).toHaveLength(1);
    expect(sent()).toContain("Robert Half");
    expect(sent()).toContain("not sure");
    expect(model.logged[0]?.task).toBe("enrich_companies");
  });

  it("drops a company it was not asked about and turns a blank proposal into none", async () => {
    answer = () => ({ companies: [{ key: "acme", proposal: "Makes anvils." }, { key: "robert half", proposal: "   " }] });
    const body = CompaniesAnswerSchema.parse(await (await post("companies")).json());
    expect(body.companies).toEqual([{ key: "robert half", proposal: null }]);
  });

  it("does not send a self-employed or freelance name to the AI, and answers it as the person's own work", async () => {
    await save({ experience: [first, roleWith(["Built sites for clients."], { company: "Self-Employed", location: "Remote" }), roleWith(["Wrote copy."], { company: "Freelancing" })] });
    answer = () => ({ companies: [{ key: "carbon global", proposal: null, selfEmployed: false }] });
    const body = CompaniesAnswerSchema.parse(await (await post("companies")).json());
    expect(body.companies).toEqual([
      { key: "self-employed", proposal: null, selfEmployed: true },
      { key: "freelancing", proposal: null, selfEmployed: true },
      { key: "carbon global", proposal: null },
    ]);
    expect(sent()).not.toContain("Self-Employed");
    expect(sent()).not.toContain("Freelancing");
  });

  it("passes on a name the AI says is the person working for themselves, without a description", async () => {
    await save({ experience: [first, roleWith(["Ran small stores."], { company: "Independent Shopify Projects" })] });
    answer = () => ({ companies: [
      { key: "carbon global", proposal: "Carbon accounting software.", selfEmployed: false },
      { key: "independent shopify projects", proposal: "Shopify stores for small brands.", selfEmployed: true },
    ] });
    const body = CompaniesAnswerSchema.parse(await (await post("companies")).json());
    expect(body.companies).toEqual([
      { key: "carbon global", proposal: "Carbon accounting software." },
      { key: "independent shopify projects", proposal: null, selfEmployed: true },
    ]);
    expect(sent()).toContain("working for themselves");
  });

  it("makes no AI call when every name is the person's own work", async () => {
    await save({ experience: [roleWith(["Built sites."], { company: "Freelance" })] });
    const body = CompaniesAnswerSchema.parse(await (await post("companies")).json());
    expect(body.companies).toEqual([{ key: "freelance", proposal: null, selfEmployed: true }]);
    expect(model.requests).toHaveLength(0);
  });

  it("asks nothing when no role names a company", async () => {
    await save({ experience: [roleWith(["Did things."], { company: "  " })] });
    const body = CompaniesAnswerSchema.parse(await (await post("companies")).json());
    expect(body).toEqual({ companies: [] });
    expect(model.requests).toHaveLength(0);
  });

  it("503 when the AI is unavailable", async () => {
    model = fakeModel(() => ({}), 500);
    expect((await post("companies")).status).toBe(503);
  });
});

describe("POST /v1/enrich/tools", () => {
  it("returns tools per role, without unknown roles or repeats, at most 8", async () => {
    answer = () => ({ roles: [
      { roleId: first.id, tools: ["SAP", "sap", "Excel", "Workday", "Taleo", "Greenhouse", "LinkedIn", "Slack", "Notion", "Jira"] },
      { roleId: "nobody", tools: ["Excel"] },
    ] });
    const res = await post("tools");
    expect(res.status).toBe(200);
    const body = ToolsAnswerSchema.parse(await res.json());
    expect(body.roles).toEqual([{ roleId: first.id, tools: ["SAP", "Excel", "Workday", "Taleo", "Greenhouse", "LinkedIn", "Slack", "Notion"] }]);
    expect(sent()).toContain("Ran payroll in SAP.");
    expect(model.logged[0]?.task).toBe("enrich_tools");
  });

  it("asks nothing for a CV with no roles", async () => {
    await save({ experience: [] });
    expect(ToolsAnswerSchema.parse(await (await post("tools")).json())).toEqual({ roles: [] });
    expect(model.requests).toHaveLength(0);
  });

  it("503 when the answer never has the right shape (retried, then given up as unavailable)", async () => {
    answer = () => ({ nope: true });
    expect((await post("tools")).status).toBe(503);
  });
});
