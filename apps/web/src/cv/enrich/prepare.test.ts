import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, fingerprint, type CvContent, type Experience, type RoleResult } from "@resumora/shared";

const api = vi.hoisted(() => ({ reportFailure: vi.fn(), improveBullet: vi.fn(), brainDump: vi.fn(), roleDescription: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { changeActions, createLimiter, prepareRoleChanges, toChanges, withPlacedChanges, type Change } from "./prepare.ts";

const role: Experience = {
  id: "r1", company: "Acme", title: "Analyst", location: "", startDate: "2020-01", endDate: "", current: true, description: "Old.",
  bullets: [{ id: "b1", text: "Did reports." }, { id: "b2", text: "Cut costs by 10% in a year." }, { id: "b3", text: "Helped." }],
  notes: [],
};
const cv: CvContent = { ...emptyCv("en"), experience: [role] };
const grade = (id: string, score: number) => ({
  id, score, contribution: "specific" as const, clarity: "specific" as const, specificity: "specific" as const,
  impact: "missing" as const, issue: "impact" as const, tip: null, question: null,
});
const result: RoleResult = {
  roleId: "r1", policy: "score/8", fingerprint: fingerprint(role, "en"), score: 60,
  bullets: [grade("b1", 60), grade("b2", 90), grade("b3", 30)], nextStep: null, questions: [], roleQuestions: [], thin: false,
};
const rewrite = (bulletId: string, text: string) => ({ proposal: { bulletId, text }, bulletBefore: 60, bulletAfter: 90, roleBefore: 60, roleAfter: 70, cached: false });
const base = { cv, roleId: "r1", result, answeredLines: new Set<string>(), answeredRole: false, thinWithAnswers: false, describe: false };

beforeEach(() => {
  vi.resetAllMocks();
  api.improveBullet.mockImplementation(({ bulletId }: { bulletId: string }) => Promise.resolve(rewrite(bulletId, `New ${bulletId}.`)));
  api.roleDescription.mockResolvedValue({ text: "Acme makes anvils. Analysed sales.", keywords: [] });
  api.brainDump.mockResolvedValue({ proposals: [{ id: "p1", text: "Built a dashboard.", score: 80 }], roleBefore: 60, roleAfterAll: 80 });
});

describe("prepareRoleChanges", () => {
  it("rewrites only the lines below 80, and makes no other call when nothing else is asked", async () => {
    const { changes, failed } = await prepareRoleChanges(base);
    expect(api.improveBullet.mock.calls.map(([body]) => body.bulletId)).toEqual(["b1", "b3"]);
    expect(api.improveBullet).toHaveBeenCalledWith({ roleId: "r1", bulletId: "b1", fingerprint: fingerprint(role, "en") });
    expect(api.roleDescription).not.toHaveBeenCalled();
    expect(api.brainDump).not.toHaveBeenCalled();
    expect(changes.map((c) => c.id)).toEqual(["bullet:b1", "bullet:b3"]);
    expect(failed).toBe(false);
  });

  it("rewrites a line answered about even when it scores 80 or more, and every line below 100 after an answer about the role", async () => {
    await prepareRoleChanges({ ...base, answeredLines: new Set(["b2"]) });
    expect(api.improveBullet.mock.calls.map(([body]) => body.bulletId)).toEqual(["b1", "b2", "b3"]);
    api.improveBullet.mockClear();
    await prepareRoleChanges({ ...base, answeredRole: true });
    expect(api.improveBullet.mock.calls.map(([body]) => body.bulletId)).toEqual(["b1", "b2", "b3"]);
  });

  it("adds a description and new lines when asked", async () => {
    const { changes } = await prepareRoleChanges({ ...base, describe: true, thinWithAnswers: true });
    expect(changes[0]).toEqual({ id: "description", kind: "description", before: "Old.", after: "Acme makes anvils. Analysed sales." });
    expect(changes.at(-1)).toEqual({ id: "new:p1", kind: "new", before: "", after: "Built a dashboard." });
    expect(api.brainDump).toHaveBeenCalledWith({ roleId: "r1", fingerprint: fingerprint(role, "en"), source: "answers" });
  });

  it("keeps what came when one call fails, and says so", async () => {
    api.improveBullet.mockImplementation(({ bulletId }: { bulletId: string }) => (bulletId === "b1" ? Promise.reject(new Error("down")) : Promise.resolve(rewrite(bulletId, `New ${bulletId}.`))));
    const { changes, failed } = await prepareRoleChanges(base);
    expect(changes.map((c) => c.id)).toEqual(["bullet:b3"]);
    expect(failed).toBe(true);
    expect(api.reportFailure).toHaveBeenCalledWith("improve-bullet", "r1", expect.any(Error));
  });

  it("leaves out a rewrite that says nothing better and one equal to the page", async () => {
    api.improveBullet.mockImplementation(({ bulletId }: { bulletId: string }) => Promise.resolve(bulletId === "b1"
      ? { needsDetail: true, nextQuestion: null } : rewrite(bulletId, " Helped. ")));
    expect((await prepareRoleChanges(base)).changes).toEqual([]);
  });

  it("asks nothing for a role that is not on the CV", async () => {
    expect(await prepareRoleChanges({ ...base, roleId: "gone" })).toEqual({ changes: [], failed: false });
    expect(api.improveBullet).not.toHaveBeenCalled();
  });
});

describe("changeActions", () => {
  const changes: Change[] = [
    { id: "description", kind: "description", before: "Old.", after: "New description." },
    { id: "bullet:b1", kind: "bullet", bulletId: "b1", before: "Did reports.", after: "Built weekly reports." },
    { id: "bullet:b3", kind: "bullet", bulletId: "b3", before: "Helped.", after: "Helped more." },
    { id: "new:p1", kind: "new", before: "", after: "Built a dashboard." },
    { id: "new:p2", kind: "new", before: "", after: "Trained two people." },
  ];

  it("maps each kind and leaves out what was kept or is the same as the page", () => {
    const decisions = [
      { id: "description", text: "New description." }, { id: "bullet:b1", text: "Built weekly reports." },
      { id: "bullet:b3", text: "Helped." }, { id: "new:p1", text: "Built a dashboard." }, { id: "new:p2", text: "Trained two people." },
    ];
    const out = changeActions(cv, "r1", "experience", changes, decisions);
    expect(out.actions).toEqual([
      { type: "setItemField", list: "experience", itemId: "r1", field: "description", value: "New description." },
      { type: "replaceBullet", roleId: "r1", bulletId: "b1", text: "Built weekly reports." },
      { type: "addBullets", roleId: "r1", texts: ["Built a dashboard.", "Trained two people."] },
    ]);
    expect(out.applied).toBe(4);
    expect(out.changedBullets).toEqual(["b1"]);
  });

  it("does nothing without decisions", () => {
    expect(changeActions(cv, "r1", "experience", changes, [])).toEqual({ actions: [], applied: 0, changedBullets: [] });
  });
});

describe("createLimiter", () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    return { promise, resolve };
  };

  it("never runs more than its limit at once, and runs every task", async () => {
    const limit = createLimiter(2);
    let running = 0;
    let most = 0;
    const gates = Array.from({ length: 5 }, deferred);
    const all = Promise.all(gates.map((g, i) => limit(async () => {
      running++;
      most = Math.max(most, running);
      await g.promise;
      running--;
      return i;
    })));
    for (const g of gates) { await Promise.resolve(); g.resolve(); await new Promise((r) => setTimeout(r, 0)); }
    expect(await all).toEqual([0, 1, 2, 3, 4]);
    expect(most).toBe(2);
  });

  it("passes a failure on and keeps going", async () => {
    const limit = createLimiter(1);
    await expect(limit(() => Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(await limit(() => Promise.resolve("next"))).toBe("next");
  });

  it("shared by two roles, their requests interleave within one limit", async () => {
    const order: string[] = [];
    let running = 0;
    let most = 0;
    api.improveBullet.mockImplementation(async ({ roleId, bulletId }: { roleId: string; bulletId: string }) => {
      running++;
      most = Math.max(most, running);
      order.push(`${roleId}:${bulletId}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end ${roleId}:${bulletId}`);
      running--;
      return rewrite(bulletId, `New ${bulletId}.`);
    });
    const r2: Experience = { ...role, id: "r2", bullets: role.bullets.map((b) => ({ ...b, id: `2${b.id}` })) };
    const two: CvContent = { ...cv, experience: [role, r2] };
    const result2: RoleResult = { ...result, roleId: "r2", fingerprint: fingerprint(r2, "en"), bullets: result.bullets.map((b) => ({ ...b, id: `2${b.id}` })) };
    const limit = createLimiter(3);
    await Promise.all([
      prepareRoleChanges({ ...base, cv: two, answeredRole: true, limit }),
      prepareRoleChanges({ ...base, cv: two, roleId: "r2", result: result2, answeredRole: true, limit }),
    ]);
    expect(most).toBe(3);
    // r2 starts while r1 is still under way: one queue for both.
    expect(order.indexOf("r2:2b1")).toBeLessThan(order.indexOf("end r1:b3"));
  });
});

describe("withPlacedChanges", () => {
  const own: Change[] = [
    { id: "bullet:b3", kind: "bullet", bulletId: "b3", before: "Helped.", after: "Helped the sales team." },
    { id: "new:p1", kind: "new", before: "", after: "Built a dashboard." },
  ];

  it("a placed line replaces the role's own change for that line, and the text of the new line it was sent as", () => {
    const sent = toChanges(own);
    const out = withPlacedChanges(own, sent, [
      { id: "a1", kind: "bullet", bulletId: "b3", text: "Helped the sales team of 6." },
      { id: "a2", kind: "bullet", bulletId: sent[1]!.id, text: "Built a dashboard in Tableau." },
    ], role);
    expect(out).toEqual([
      { id: "bullet:b3", kind: "bullet", bulletId: "b3", before: "Helped.", after: "Helped the sales team of 6." },
      { id: "new:p1", kind: "new", before: "", after: "Built a dashboard in Tableau." },
    ]);
  });

  it("a line not changed before becomes a change in the role's line order; a description leads; a new line comes last", () => {
    const sent = toChanges(own);
    const out = withPlacedChanges(own, sent, [
      { id: "a1", kind: "bullet", bulletId: "b1", text: "Did reports in Excel." },
      { id: "a2", kind: "description", text: "Acme makes anvils." },
      { id: "a3", kind: "new", text: "Trained two juniors." },
      { id: "a4", kind: "bullet", bulletId: "gone", text: "Nothing to hang this on." },
    ], role);
    expect(out.map((c) => [c.kind, c.before, c.after])).toEqual([
      ["description", "Old.", "Acme makes anvils."],
      ["bullet", "Did reports.", "Did reports in Excel."],
      ["bullet", "Helped.", "Helped the sales team."],
      ["new", "", "Built a dashboard."],
      ["new", "", "Trained two juniors."],
    ]);
    // The list given is not touched.
    expect(own).toHaveLength(2);
  });
});

describe("toChanges", () => {
  it("turns prepared changes into the shared change list; a new line gets a fresh id", () => {
    const out = toChanges([
      { id: "description", kind: "description", before: "Old.", after: "New description." },
      { id: "bullet:b1", kind: "bullet", bulletId: "b1", before: "Did reports.", after: "Built weekly reports." },
      { id: "new:new1", kind: "new", before: "", after: "Built a dashboard." },
    ]);
    expect(out.slice(0, 2)).toEqual([
      { id: "description", kind: "description", text: "New description." },
      { id: "bullet:b1", kind: "bullet", bulletId: "b1", text: "Built weekly reports." },
    ]);
    expect(out[2]).toMatchObject({ kind: "new", text: "Built a dashboard." });
    expect(out[2]!.id).not.toBe("new:new1");
    expect(toChanges([{ id: "new:new1", kind: "new", before: "", after: "X." }])[0]!.id).not.toBe(out[2]!.id);
  });
});
