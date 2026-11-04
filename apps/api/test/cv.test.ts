import { beforeEach, describe, expect, it, vi } from "vitest";
import { CvResponseSchema, ErrorBodySchema, emptyCv, newId, type CvContent } from "@resumora/shared";
import { createApp } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (res: Response): Promise<any> => res.json();

const auth = { authorization: "Bearer good", "content-type": "application/json" };

function cvNamed(fullName: string): CvContent {
  return { ...emptyCv(), basics: { ...emptyCv().basics, fullName } };
}

let repo: CvRepo;
let app: ReturnType<typeof createApp>;
let clock: Date;

beforeEach(() => {
  clock = new Date("2026-11-04T10:00:00Z");
  repo = memoryCvRepo({ now: () => clock });
  app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "good" ? { id: "user-1", token } : null),
    cvRepo: () => repo,
    importRepo: () => {
      throw new Error("not used");
    },
    queue: { send: async () => {} },
    log: vi.fn(),
  });
});

const get = (path: string) => app.request(path, { headers: auth });
const send = (method: string, path: string, body: unknown) =>
  app.request(path, { method, headers: auth, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("My CV", () => {
  it("new user gets an empty CV", async () => {
    const res = await get("/v1/cv");
    expect(res.status).toBe(200);
    const body = CvResponseSchema.parse(await json(res));
    expect(body.version).toBe(0);
    expect(body.content).toEqual(emptyCv());
  });

  it("save then load", async () => {
    const saved = await send("PUT", "/v1/cv", { content: cvNamed("Ana Pop"), version: 0 });
    expect(saved.status).toBe(200);
    expect((await json(saved)).version).toBe(1);
    const body = CvResponseSchema.parse(await json(await get("/v1/cv")));
    expect(body.version).toBe(1);
    expect(body.content.basics.fullName).toBe("Ana Pop");
  });

  it("stale version conflicts", async () => {
    await send("PUT", "/v1/cv", { content: cvNamed("Tab A"), version: 0 });
    const res = await send("PUT", "/v1/cv", { content: cvNamed("Tab B"), version: 0 });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(ErrorBodySchema.parse(body).error.code).toBe("version_conflict");
    expect(body.current.version).toBe(1);
    const current = CvResponseSchema.parse(await json(await get("/v1/cv")));
    expect(current.content.basics.fullName).toBe("Tab A");
  });

  it("rejects invalid content", async () => {
    const experience = Array.from({ length: 41 }, () => ({
      id: newId(), company: "", title: "", location: "", startDate: "", endDate: "", current: false, bullets: [],
    }));
    const res = await send("PUT", "/v1/cv", { content: { ...emptyCv(), experience }, version: 0 });
    expect(res.status).toBe(400);
    const body = ErrorBodySchema.parse(await json(res));
    expect(body.error.code).toBe("invalid_content");
    expect(body.error.message).toContain("experience");
    expect(CvResponseSchema.parse(await json(await get("/v1/cv"))).version).toBe(0);
  });

  it("rejects malformed JSON", async () => {
    const res = await send("PUT", "/v1/cv", "{not json");
    expect(res.status).toBe(400);
    expect(ErrorBodySchema.parse(await json(res)).error.code).toBe("invalid_json");
  });

  it("rejects oversized content", async () => {
    const big = { content: cvNamed("x"), version: 0, padding: "a".repeat(300 * 1024) };
    const res = await send("PUT", "/v1/cv", big);
    expect(res.status).toBe(413);
    expect(ErrorBodySchema.parse(await json(res)).error.code).toBe("content_too_large");
  });
});

describe("history", () => {
  it("restore brings back an earlier version", async () => {
    await send("PUT", "/v1/cv", { content: cvNamed("First"), version: 0 });
    await send("PUT", "/v1/cv", { content: cvNamed("Second"), version: 1 });

    const list = await json(await get("/v1/cv/history"));
    expect(list.items).toHaveLength(1);
    const [item] = list.items;
    expect(item.reason).toBe("autosave");

    const detail = await json(await get(`/v1/cv/history/${item.id}`));
    expect(detail.content.basics.fullName).toBe("First");

    const restored = await send("POST", `/v1/cv/history/${item.id}/restore`, { version: 2 });
    expect(restored.status).toBe(200);
    expect((await json(restored)).version).toBe(3);
    const current = CvResponseSchema.parse(await json(await get("/v1/cv")));
    expect(current.content.basics.fullName).toBe("First");

    const after = await json(await get("/v1/cv/history"));
    expect(after.items[0].reason).toBe("restore");
  });

  it("restore with a stale version conflicts", async () => {
    await send("PUT", "/v1/cv", { content: cvNamed("First"), version: 0 });
    await send("PUT", "/v1/cv", { content: cvNamed("Second"), version: 1 });
    const [item] = (await json(await get("/v1/cv/history"))).items;
    const res = await send("POST", `/v1/cv/history/${item.id}/restore`, { version: 1 });
    expect(res.status).toBe(409);
  });

  it("autosave snapshots at most once per 10 minutes", async () => {
    await send("PUT", "/v1/cv", { content: cvNamed("v1"), version: 0 });
    await send("PUT", "/v1/cv", { content: cvNamed("v2"), version: 1 });
    clock = new Date("2026-11-04T10:05:00Z");
    await send("PUT", "/v1/cv", { content: cvNamed("v3"), version: 2 });
    expect((await json(await get("/v1/cv/history"))).items).toHaveLength(1);
    clock = new Date("2026-11-04T10:11:00Z");
    await send("PUT", "/v1/cv", { content: cvNamed("v4"), version: 3 });
    expect((await json(await get("/v1/cv/history"))).items).toHaveLength(2);
  });

  it("keeps the newest 50 versions", async () => {
    let version = 0;
    for (let i = 0; i < 55; i++) {
      clock = new Date(clock.getTime() + 11 * 60_000);
      version = (await json(await send("PUT", "/v1/cv", { content: cvNamed(`v${i}`), version }))).version;
    }
    expect((await json(await get("/v1/cv/history"))).items).toHaveLength(50);
  });

  it("unknown history id is not found", async () => {
    const res = await get(`/v1/cv/history/${newId()}`);
    expect(res.status).toBe(404);
    expect(ErrorBodySchema.parse(await json(res)).error.code).toBe("not_found");
  });
});
