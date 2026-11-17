import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, fingerprint, type CvContent, type Experience, type RoleResult } from "@resumora/shared";

const api = vi.hoisted(() => ({ improveBullet: vi.fn(), brainDump: vi.fn(), roleDescription: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { changeActions, prepareRoleChanges, type Change } from "./prepare.ts";

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
