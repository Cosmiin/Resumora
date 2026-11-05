import { describe, expect, it } from "vitest";
import { RoleResultSchema, emptyCv, type RoleResult } from "@resumora/shared";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { HISTORY_LIMIT } from "../cv/repo.ts";
import { memoryInsightsRepo, type MemoryInsightsStore } from "./memory-repo.ts";

const result = (fingerprint: string, roleId = "r1"): RoleResult =>
  RoleResultSchema.parse({ roleId, policy: "score/2", fingerprint, score: null, bullets: [], nextStep: null, questions: [] });

describe("memoryInsightsRepo", () => {
  it("put then get round-trips, and get is null for an unknown role", async () => {
    const repo = memoryInsightsRepo("u1");
    await repo.put("r1", result("a"));
    expect(await repo.get("r1")).toEqual(result("a"));
    expect(await repo.get("r2")).toBeNull();
  });

  it("put replaces the earlier result for the same role", async () => {
    const repo = memoryInsightsRepo("u1");
    await repo.put("r1", result("a"));
    await repo.put("r1", result("b"));
    expect(await repo.list()).toEqual([result("b")]);
  });

  it("list returns only this user's rows", async () => {
    const store: MemoryInsightsStore = new Map();
    const mine = memoryInsightsRepo("u1", store);
    const theirs = memoryInsightsRepo("u2", store);
    await mine.put("r1", result("mine"));
    await theirs.put("r1", result("theirs"));
    expect(await mine.list()).toEqual([result("mine")]);
    expect(await mine.get("r1")).toEqual(result("mine"));
  });

  it("remove deletes the given ids and leaves the rest", async () => {
    const store: MemoryInsightsStore = new Map();
    const repo = memoryInsightsRepo("u1", store);
    await repo.put("r1", result("a"));
    await repo.put("r2", result("b", "r2"));
    await repo.put("r3", result("c", "r3"));
    await memoryInsightsRepo("u2", store).put("r1", result("other"));
    await repo.remove(["r1", "r3"]);
    expect(await repo.list()).toEqual([result("b", "r2")]);
    expect(await memoryInsightsRepo("u2", store).get("r1")).toEqual(result("other"));
  });
});


describe("pending role results", () => {
  it("putPending on a missing row stores nothing", async () => {
    const repo = memoryInsightsRepo("u1");
    await repo.putPending("r1", result("future"));
    expect(await repo.pending("r1")).toEqual([]);
    expect(await repo.get("r1")).toBeNull();
    expect(await repo.list()).toEqual([]);
  });

  it("a sixth entry drops the oldest by at, regardless of array order", async () => {
    const store: MemoryInsightsStore = new Map();
    const repo = memoryInsightsRepo("u1", store);
    await repo.put("r1", result("saved"));
    store.get("u1/r1")!.pending = [3, 1, 5, 2, 4].map((day) => ({
      fingerprint: "p" + day, result: result("p" + day), at: "2020-01-0" + day + "T00:00:00.000Z",
    }));
    await repo.putPending("r1", result("p6"));
    const pending = await repo.pending("r1");
    expect(pending).toHaveLength(5);
    expect(pending.map((p) => p.fingerprint).sort()).toEqual(["p2", "p3", "p4", "p5", "p6"]);
    expect(pending.find((p) => p.fingerprint === "p6")?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("the same fingerprint replaces its entry", async () => {
    const repo = memoryInsightsRepo("u1");
    await repo.put("r1", result("saved"));
    await repo.putPending("r1", result("future"));
    const replacement = { ...result("future"), policy: "score/1" };
    await repo.putPending("r1", replacement);
    expect(await repo.pending("r1")).toEqual([{ fingerprint: "future", result: replacement, at: expect.any(String) }]);
  });

  it("put keeps pending intact, isolated from other users and returned values", async () => {
    const store: MemoryInsightsStore = new Map();
    const repo = memoryInsightsRepo("u1", store);
    await repo.put("r1", result("saved"));
    await repo.putPending("r1", result("future"));
    const pending = await repo.pending("r1");
    await repo.put("r1", result("new-main"));
    expect(await repo.pending("r1")).toEqual(pending);
    pending[0]!.result.fingerprint = "changed";
    expect((await repo.pending("r1"))[0]?.result.fingerprint).toBe("future");
    expect(await memoryInsightsRepo("u2", store).pending("r1")).toEqual([]);
  });

  it("drops pending entries with invalid role results when adding another", async () => {
    const store: MemoryInsightsStore = new Map();
    const repo = memoryInsightsRepo("u1", store);
    await repo.put("r1", result("saved"));
    store.get("u1/r1")!.pending = [{ fingerprint: "bad", result: { ...result("bad"), score: 101 }, at: "2020-01-01T00:00:00.000Z" }];
    await repo.putPending("r1", result("future"));
    expect((await repo.pending("r1")).map((p) => p.fingerprint)).toEqual(["future"]);
  });
});

describe("memoryCvRepo.snapshot", () => {
  it("adds a history item with reason ai holding the current CV", async () => {
    const repo = memoryCvRepo();
    const cv = { ...emptyCv(), basics: { ...emptyCv().basics, fullName: "Ana" } };
    await repo.save(cv, 0);
    await repo.snapshot("ai");
    const [item] = await repo.listHistory();
    expect(item?.reason).toBe("ai");
    expect((await repo.getHistory(item!.id))?.content.basics.fullName).toBe("Ana");
  });

  it("does nothing when there is no saved CV", async () => {
    const repo = memoryCvRepo();
    await repo.snapshot("ai");
    expect(await repo.listHistory()).toEqual([]);
  });

  it("keeps at most 50 items", async () => {
    const repo = memoryCvRepo();
    await repo.save(emptyCv(), 0);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) await repo.snapshot("ai");
    expect(await repo.listHistory()).toHaveLength(HISTORY_LIMIT);
  });
});

describe("role id check", () => {
  it("put refuses a result that belongs to another role", async () => {
    const repo = memoryInsightsRepo("u1");
    await expect(repo.put("r1", result("a", "r2"))).rejects.toThrow(/different role/);
    expect(await repo.list()).toEqual([]);
  });
});
