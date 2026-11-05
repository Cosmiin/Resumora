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
