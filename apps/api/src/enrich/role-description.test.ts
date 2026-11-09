import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleDescriptionAnswerSchema, emptyCv, fingerprint, type Experience } from "@resumora/shared";
import { createApp } from "../app.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";
import { countSentences } from "./role-description.ts";

const headers = { authorization: "Bearer user-a", "content-type": "application/json" };
let role: Experience;
let cv: ReturnType<typeof memoryCvRepo>;
let answers: unknown[];
let model: ReturnType<typeof fakeModel>;
let app: ReturnType<typeof createApp>;
const post = (body: unknown = { roleId: role.id, fingerprint: fingerprint(role, "en") }) =>
  app.request("/v1/enrich/role-description", { method: "POST", headers, body: JSON.stringify(body) });
const result = async () => {
  const res = await post();
  expect(res.status).toBe(200);
  return RoleDescriptionAnswerSchema.parse(await res.json());
};

beforeEach(async () => {
  role = roleWith(["Prepared payroll files for 40 staff every month."], {
    company: "Acme Payroll", description: "",
    notes: [{ id: "n1", question: "What does the company do?", answer: "Payroll outsourcing for small firms", via: ["type"], askedAt: "2026-11-05T10:00:00.000Z" }],
  });
  cv = memoryCvRepo();
  await cv.save({ ...emptyCv("en"), experience: [role] }, (await cv.get()).version);
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

describe("POST /v1/enrich/role-description", () => {
  it("validates its input and needs the saved role", async () => {
    expect((await post({ roleId: role.id })).status).toBe(400);
    expect((await post({ roleId: role.id, fingerprint: "stale" })).status).toBe(409);
    expect(model.requests).toHaveLength(0);
  });

  it("returns at most two sentences and the ATS keywords that appear in them, from the role and its notes", async () => {
    answers.push({ text: "Acme Payroll runs payroll outsourcing for small firms. The role kept monthly payroll accurate.", keywords: ["payroll outsourcing", "HR software"] });
    expect(await result()).toEqual({ text: "Acme Payroll runs payroll outsourcing for small firms. The role kept monthly payroll accurate.", keywords: ["payroll outsourcing"] });
    const sent = JSON.stringify(model.requests[0]?.messages);
    expect(sent).toContain("Payroll outsourcing for small firms");
    expect(sent).toContain("Prepared payroll files for 40 staff every month.");
    expect(sent).toContain("at most two sentences");
  });

  it("rejects an answer that copies a bullet and retries once", async () => {
    answers.push({ text: "Acme Payroll serves small firms. Prepared payroll files for 40 staff every month!", keywords: [] });
    answers.push({ text: "Acme Payroll serves small firms.", keywords: [] });
    expect((await result()).text).toBe("Acme Payroll serves small firms.");
    expect(model.requests).toHaveLength(2);
  });

  it("returns an empty text after two bad answers (three sentences, then a copied bullet)", async () => {
    answers.push({ text: "One. Two. Three.", keywords: [] });
    answers.push({ text: "prepared payroll files for 40 staff every month", keywords: [] });
    expect(await result()).toEqual({ text: "", keywords: [] });
    expect(model.requests).toHaveLength(2);
  });

  it("passes an empty text through when there is nothing to go on", async () => {
    answers.push({ text: "  ", keywords: ["payroll"] });
    expect(await result()).toEqual({ text: "", keywords: [] });
    expect(model.requests).toHaveLength(1);
  });
});

describe("countSentences", () => {
  it.each([["One sentence.", 1], ["Two. Sentences!", 2], ["Runs v2.5 of the tool. Then more.", 2], ["No end mark", 1], ["", 0]])("%j → %i", (text, n) => {
    expect(countSentences(text)).toBe(n);
  });
});
