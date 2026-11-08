import { beforeEach, describe, expect, it, vi } from "vitest";
import { CvResponseSchema, ErrorBodySchema, MAX_CV_BYTES, emptyCv, newId, type CvContent, type Note } from "@resumora/shared";
import { createApp } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";

const headers = { authorization: "Bearer good", "content-type": "application/json" };
let repo: CvRepo;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  repo = memoryCvRepo();
  const unused = () => { throw new Error("not used"); };
  app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => token === "good" ? { id: "user-1", token } : null,
    cvRepo: () => repo,
    importRepo: unused, jobRepo: unused, insightsRepo: unused, model: unused,
    queue: { send: async () => {} }, jobQueue: { send: async () => {} }, log: vi.fn(),
  });
});

const send = (method: string, path: string, body: unknown) =>
  app.request(path, { method, headers, body: JSON.stringify(body) });

async function savedHistory() {
  const content: CvContent = {
    ...emptyCv(),
    basics: { ...emptyCv().basics, summary: "Older summary" },
    experience: [{
      id: newId(), company: "Acme", title: "Engineer", location: "", startDate: "2020-01",
      endDate: "", current: true, description: "Older role text", bullets: [], notes: [],
    }],
  };
  expect((await send("PUT", "/v1/cv", { content, version: 0 })).status).toBe(200);
  const note: Note = {
    id: newId(), jobId: newId(), question: "How large was the team?", answer: "Six engineers",
    via: ["type"], askedAt: "2026-11-08T10:00:00Z",
  };
  const current: CvContent = {
    ...content, basics: { ...content.basics, summary: "Newer summary" },
    experience: [{ ...content.experience[0]!, description: "Newer role text", notes: [note] }],
  };
  expect((await send("PUT", "/v1/cv", { content: current, version: 1 })).status).toBe(200);
  const [item] = await repo.listHistory();
  return { id: item!.id, note, current };
}

describe("history restore keeps newer notes", () => {
  it("returns and saves the older text with a job note added since", async () => {
    const { id, note, current } = await savedHistory();
    const response = await send("POST", `/v1/cv/history/${id}/restore`, { version: 2 });
    expect(response.status).toBe(200);
    const saved = CvResponseSchema.parse(await (await app.request("/v1/cv", { headers })).json());
    expect(saved.version).toBe(3);
    expect(saved.content.basics.summary).toBe("Older summary");
    expect(saved.content.experience[0]!.description).toBe("Older role text");
    expect(saved.content.experience[0]!.notes).toEqual([note]);
    expect(CvResponseSchema.parse(await response.json())).toEqual(saved);
    const history = await repo.listHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.reason).toBe("restore");
    expect((await repo.getHistory(history[0]!.id))!.content).toEqual(current);
  });

  it("rejects a restore whose next PUT body is oversized without changing its content or version", async () => {
    const older: CvContent = {
      ...emptyCv(),
      custom: Array.from({ length: 40 }, () => ({ id: newId(), title: "Older text", details: "é".repeat(3000) })),
      experience: [{
        id: newId(), company: "Acme", title: "Engineer", location: "", startDate: "2020-01",
        endDate: "", current: true, description: "Older role text", bullets: [], notes: [],
      }],
    };
    const current: CvContent = {
      ...older, custom: [],
      experience: [{ ...older.experience[0]!, notes: Array.from({ length: 4 }, () => ({
        id: newId(), question: "What did you do?", answer: "a".repeat(4000),
        via: ["type"], askedAt: "2026-11-08T10:00:00Z",
      })) }],
    };
    const merged = { ...older, experience: current.experience };
    older.basics.summary = "a".repeat(MAX_CV_BYTES - new TextEncoder().encode(JSON.stringify(merged)).length);
    expect(new TextEncoder().encode(JSON.stringify(merged)).length).toBe(MAX_CV_BYTES);
    expect((await send("PUT", "/v1/cv", { content: older, version: 0 })).status).toBe(200);
    expect((await send("PUT", "/v1/cv", { content: current, version: 1 })).status).toBe(200);
    const [item] = await repo.listHistory();
    const before = await repo.get();
    const response = await send("POST", `/v1/cv/history/${item!.id}/restore`, { version: before.version });
    expect(response.status).toBe(413);
    expect(ErrorBodySchema.parse(await response.json()).error.code).toBe("content_too_large");
    expect(await repo.get()).toEqual(before);
  });

  it("leaves newer content and history unchanged when the version is stale", async () => {
    const { id, current } = await savedHistory();
    const response = await send("POST", `/v1/cv/history/${id}/restore`, { version: 1 });
    expect(response.status).toBe(409);
    expect(ErrorBodySchema.parse(await response.json()).error.code).toBe("version_conflict");
    expect((await repo.get()).content).toEqual(current);
    expect(await repo.listHistory()).toHaveLength(1);
  });

  it("returns not found for an unknown history version", async () => {
    const response = await send("POST", `/v1/cv/history/${newId()}/restore`, { version: 0 });
    expect(response.status).toBe(404);
    expect(ErrorBodySchema.parse(await response.json()).error.code).toBe("not_found");
    expect((await repo.get()).version).toBe(0);
    expect(await repo.listHistory()).toHaveLength(0);
  });
});
