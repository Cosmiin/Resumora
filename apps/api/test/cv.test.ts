import { beforeEach, describe, expect, it, vi } from "vitest";
import { CvResponseSchema, ErrorBodySchema, emptyCv, newId, type CvContent } from "@resumora/shared";
import { createApp } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import { memoryInsightsRepo } from "../src/enrich/memory-repo.ts";
import type { InsightsRepo } from "../src/enrich/repo.ts";
import { storedCv } from "../src/cv/supabase-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (res: Response): Promise<any> => res.json();

const auth = { authorization: "Bearer good", "content-type": "application/json" };

function cvNamed(fullName: string): CvContent {
  return { ...emptyCv(), basics: { ...emptyCv().basics, fullName } };
}

let repo: CvRepo;
let insights: InsightsRepo;
let app: ReturnType<typeof createApp>;
let clock: Date;

beforeEach(() => {
  clock = new Date("2026-11-04T10:00:00Z");
  repo = memoryCvRepo({ now: () => clock });
  insights = memoryInsightsRepo("user-1");
  app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "good" ? { id: "user-1", token } : null),
    cvRepo: () => repo,
    importRepo: () => {
      throw new Error("not used");
    },
    jobRepo: () => {
      throw new Error("not used");
    },
    insightsRepo: () => insights,
    model: () => {
      throw new Error("not used");
    },
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
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

/** A v1 CV as an old database row holds it: no new lists, no layout. */
function storedV1(fullName: string): Record<string, unknown> {
  const v1: Record<string, unknown> = { ...cvNamed(fullName), schemaVersion: 1 };
  for (const key of ["layout", "achievements", "volunteering", "awards", "courses", "publications", "interests", "enrichedAt"]) delete v1[key];
  v1.experience = [
    { id: newId(), company: "Acme", title: "PM", location: "", startDate: "2020-01", endDate: "", current: true, description: "", bullets: [{ id: newId(), text: "Shipped it" }] },
  ];
  return v1;
}

describe("old v1 CVs", () => {
  /** Mimics supabaseCvRepo: raw rows read through storedCv; restore copies the stored value as SQL does. */
  function rawRepo(row: unknown, versions: Record<string, unknown>): CvRepo {
    return {
      async get() {
        return { content: storedCv(row), version: 1, updatedAt: "2026-11-04T10:00:00Z" };
      },
      async save() {
        throw new Error("not used");
      },
      async addJobNotes() {
        throw new Error("not used");
      },
      async listHistory() {
        return [];
      },
      async getHistory(id) {
        return id in versions ? { content: storedCv(versions[id]), createdAt: "2026-11-04T09:00:00Z" } : null;
      },
      async restore(id) {
        if (!(id in versions)) return null;
        row = versions[id];
        return { ok: true, version: 2, updatedAt: "2026-11-04T10:01:00Z" };
      },
      async clearHistory() {},
      async snapshot() {
        throw new Error("not used");
      },
    };
  }

  it("GET /v1/cv returns a stored v1 CV as v2", async () => {
    repo = rawRepo(storedV1("Ana"), {});
    const body = CvResponseSchema.parse(await json(await get("/v1/cv")));
    expect(body.content.schemaVersion).toBe(2);
    expect(body.content.basics.fullName).toBe("Ana");
    expect(body.content.experience[0]!.bullets[0]!.text).toBe("Shipped it");
    expect(body.content.achievements).toEqual([]);
  });

  it("history detail of a v1 version comes back as v2", async () => {
    const id = newId();
    repo = rawRepo(storedV1("Now"), { [id]: storedV1("Before") });
    const res = await get(`/v1/cv/history/${id}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.content.schemaVersion).toBe(2);
    expect(body.content.basics.fullName).toBe("Before");
  });

  it("restoring a v1 history version saves v2", async () => {
    const id = newId();
    repo = rawRepo(storedV1("Now"), { [id]: storedV1("Before") });
    expect((await send("POST", `/v1/cv/history/${id}/restore`, { version: 1 })).status).toBe(200);
    const body = CvResponseSchema.parse(await json(await get("/v1/cv")));
    expect(body.content.schemaVersion).toBe(2);
    expect(body.content.basics.fullName).toBe("Before");
  });

  it("PUT /v1/cv rejects a v1 body with 400", async () => {
    const res = await send("PUT", "/v1/cv", { content: storedV1("Old"), version: 0 });
    expect(res.status).toBe(400);
    expect(ErrorBodySchema.parse(await json(res)).error.code).toBe("invalid_content");
  });
});

describe("Remove my CV", () => {
  it("empties the CV and deletes its history and role scores", async () => {
    await send("PUT", "/v1/cv", { content: cvNamed("Ana Pop"), version: 0 });
    clock = new Date(clock.getTime() + 11 * 60_000);
    await send("PUT", "/v1/cv", { content: cvNamed("Ana Popescu"), version: 1 });
    expect((await repo.listHistory()).length).toBeGreaterThan(0);
    await insights.put("r1", { roleId: "r1" } as never);

    const res = await send("DELETE", "/v1/cv", { version: 2 });
    expect(res.status).toBe(200);
    const body = CvResponseSchema.parse(await json(res));
    expect(body.content).toEqual(emptyCv());
    expect(body.version).toBe(3);
    expect((await repo.get()).content).toEqual(emptyCv());
    expect(await repo.listHistory()).toEqual([]);
    expect(await insights.list()).toEqual([]);
  });

  it("a second try after a half-finished removal finishes the cleanup", async () => {
    await send("PUT", "/v1/cv", { content: cvNamed("Ana Pop"), version: 0 });
    await insights.put("r1", { roleId: "r1" } as never);
    // The first try emptied the CV, then failed before the scores were deleted.
    await repo.save(emptyCv(), 1);
    const res = await send("DELETE", "/v1/cv", { version: 1 });
    expect(res.status).toBe(200);
    expect(CvResponseSchema.parse(await json(res)).version).toBe(2);
    expect(await repo.listHistory()).toEqual([]);
    expect(await insights.list()).toEqual([]);
  });

  it("changes nothing when the CV was saved somewhere else first", async () => {
    await send("PUT", "/v1/cv", { content: cvNamed("Ana Pop"), version: 0 });
    await insights.put("r1", { roleId: "r1" } as never);
    const res = await send("DELETE", "/v1/cv", { version: 0 });
    expect(res.status).toBe(409);
    expect((await repo.get()).content.basics.fullName).toBe("Ana Pop");
    expect(await insights.list()).toHaveLength(1);
  });
});
