import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type JobExtraction, type MatchLabel, type MatchScore } from "@resumora/shared";
import { fakeModel } from "./fake-model.ts";
import { memoryTailorRepo, type MemoryTailorStore } from "./memory-repo.ts";
import { scoreMatch } from "./score.ts";
import { supabaseTailorRepo } from "./supabase-repo.ts";

const job: JobExtraction = {
  title: "Engineer", company: "Acme", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "unknown", salary: null, summary: "Build software", responsibilities: ["Use SQL"],
  requirements: [{ text: "TypeScript", kind: "must", category: "skill" }],
  benefits: ["Private insurance"], applyBy: null, isJobPosting: true,
};
const label = (ref = "r0", changes: Partial<MatchLabel> = {}): MatchLabel => ({
  ref, kind: ref.startsWith("k:") ? "keyword" : "requirement", status: "met",
  evidence: "Built TypeScript services with SQL.", inferred: false, ...changes,
});
const input = () => {
  const cv = emptyCv();
  cv.basics.summary = "Built TypeScript services with SQL.";
  return { userId: "user-a", cv, job, keptInferred: new Set<string>() };
};
const answer = () => ({ labels: [label(), label("k:TypeScript"), label("k:SQL")], cvSeniority: "unknown" });

describe("scoreMatch", () => {
  it("scores requirement and keyword labels using the cheap model and logs the task", async () => {
    const model = fakeModel(answer);
    model.deps.providers[0]!.strongModel = "expensive";
    const score = await scoreMatch({ model: model.deps }, input());
    expect(score).toMatchObject({ policy: "match/1", total: 100, band: "excellent", capped: false });
    expect(score.labels).toEqual(answer().labels);
    expect(model.requests[0]?.model).toBe("m");
    expect(model.logged[0]).toMatchObject({ task: "tailor_score", userId: "user-a", status: "ok" });
  });

  it("scores a junior CV lower than a senior CV for a senior job", async () => {
    const work = { ...input(), job: { ...job, seniority: "senior" as const } };
    const juniorModel = fakeModel(() => ({ ...answer(), cvSeniority: "junior" }));
    const seniorModel = fakeModel(() => ({ ...answer(), cvSeniority: "senior" }));
    const junior = await scoreMatch({ model: juniorModel.deps }, work);
    const senior = await scoreMatch({ model: seniorModel.deps }, work);
    expect(junior.total).toBe(89);
    expect(senior.total).toBe(100);
  });

  it.each(["met", "partial"] as const)("downgrades invented %s evidence, including inferred claims", async (status) => {
    const model = fakeModel(() => ({ ...answer(), labels: answer().labels.map((label) => ({ ...label, status, evidence: "Managed 50 engineers.", inferred: true })) }));
    const score = await scoreMatch({ model: model.deps }, input());
    expect(score.labels).toEqual(answer().labels.map((label) => ({ ...label, status: "missing", evidence: null, inferred: false })));
    expect(score).toMatchObject({ total: 0, capped: true });
  });

  it.each([null, ""])("does not award points without evidence (%s)", async (evidence) => {
    const model = fakeModel(() => ({ ...answer(), labels: answer().labels.map((label) => ({ ...label, evidence })) }));
    expect((await scoreMatch({ model: model.deps }, input())).total).toBe(0);
  });

  it("keeps the header out of the user message and evidence check", async () => {
    const work = input();
    const privateFields = {
      fullName: "Ada Lovelace", firstName: "Ada", lastName: "Lovelace", email: "ada@example.test",
      phone: "+40 123456789", location: "Private address", website: "https://ada.example.test",
      linkedin: "https://linkedin.com/in/ada",
    };
    Object.assign(work.cv.basics, privateFields, { titles: ["Software Engineer"] });
    const original = structuredClone(work.cv);
    const model = fakeModel(() => ({ ...answer(), labels: answer().labels.map((label) => ({ ...label, evidence: privateFields.fullName })) }));
    const score = await scoreMatch({ model: model.deps }, work);
    const messages = model.requests[0]?.messages as { role: string; content: string }[];
    const user = messages.find((message) => message.role === "user")!.content;
    for (const value of Object.values(privateFields)) expect(user).not.toContain(value);
    expect(user).toContain("Software Engineer");
    expect(score.labels[0]?.status).toBe("missing");
    expect(work.cv).toEqual(original);
  });

  it("rejects layout-only evidence in an empty CV and omits layout from the user message", async () => {
    const work = { ...input(), cv: emptyCv() };
    const model = fakeModel(() => ({
      ...answer(), labels: answer().labels.map((label) => ({ ...label, evidence: "languages" })),
    }));
    const score = await scoreMatch({ model: model.deps }, work);
    expect(score.labels[0]).toMatchObject({ status: "missing", evidence: null });
    expect(score.total).toBe(0);
    const messages = model.requests[0]?.messages as { role: string; content: string }[];
    const user = JSON.parse(messages.find((message) => message.role === "user")!.content);
    expect(user.cv).not.toHaveProperty("layout");
  });

  it("checks evidence against unescaped CV text", async () => {
    const work = input();
    work.cv.basics.summary = 'Built "TypeScript" services.\nUsed SQL.';
    const model = fakeModel(() => ({ ...answer(), labels: answer().labels.map((label) => ({ ...label, evidence: work.cv.basics.summary })) }));
    expect((await scoreMatch({ model: model.deps }, work)).total).toBe(100);
  });

  it("awards no points for missing labels even if the model marks them inferred", async () => {
    const model = fakeModel(() => ({ ...answer(), labels: answer().labels.map((label) => ({ ...label, status: "missing", evidence: null, inferred: true })) }));
    expect(await scoreMatch({ model: model.deps }, input())).toMatchObject({ total: 0, capped: true });
  });

  it("passes kept inferred labels to the shared scorer", async () => {
    const model = fakeModel(() => ({ ...answer(), labels: answer().labels.map((label) => ({ ...label, inferred: true })) }));
    const work = input();
    expect((await scoreMatch({ model: model.deps }, work)).total).toBe(50);
    work.keptInferred = new Set(["r0", "k:TypeScript", "k:SQL"]);
    expect((await scoreMatch({ model: model.deps }, work)).total).toBe(100);
  });

  it.each([
    [], [label(), label()], [label("r9")], [label(), label("k:insurance")],
    [label(), label("k:SQL"), label("k:SQL")],
  ])("rejects incomplete, duplicate or unrelated labels: %j", async (...labels) => {
    const model = fakeModel(() => ({ ...answer(), labels }));
    await expect(scoreMatch({ model: model.deps }, input())).rejects.toMatchObject({ code: "ai_failed" });
  });

  it("rejects requirement-only replies when the job has requirements", async () => {
    const model = fakeModel(() => ({ ...answer(), labels: [label()] }));
    await expect(scoreMatch({ model: model.deps }, input())).rejects.toMatchObject({ code: "ai_failed" });
  });

  it("reports fake provider failures as ai_failed", async () => {
    const model = fakeModel(answer, 503);
    await expect(scoreMatch({ model: model.deps }, input())).rejects.toMatchObject({ code: "ai_failed" });
  });
});

describe("score repositories", () => {
  afterEach(() => vi.unstubAllGlobals());

  const storedScore: MatchScore = {
    policy: "match/1", total: 0, band: "low", capped: true,
    parts: { requirements: { points: 0, max: 100 }, keywords: null, seniority: null, langEdu: null },
    labels: [label("r0", { status: "missing", evidence: null })],
  };

  it("isolates users, jobs, targets and tailored copies and returns independent scores", async () => {
    const store: MemoryTailorStore = new Map();
    const repo = memoryTailorRepo("a", store);
    expect(await repo.getScore("job", "base")).toBeNull();
    const score = structuredClone(storedScore);
    await repo.saveScore("job", "base", null, score);
    score.total = 99;
    expect(await repo.getScore("job", "base")).toEqual(storedScore);
    expect(await memoryTailorRepo("b", store).getScore("job", "base")).toBeNull();
    expect(await repo.getScore("other", "base")).toBeNull();
    expect(await repo.getScore("job", "tailored")).toBeNull();
    await repo.saveScore("job", "tailored", "copy-a", storedScore);
    await repo.saveScore("job", "tailored", "copy-b", { ...storedScore, total: 50 });
    expect(await repo.getScore("job", "tailored", "copy-a")).toEqual(storedScore);
    expect((await repo.getScore("job", "tailored"))?.total).toBe(50);
    expect(await repo.getScore("job", "tailored", "copy-c")).toBeNull();
    const read = (await repo.getScore("job", "base"))!;
    read.labels.length = 0;
    expect(await repo.getScore("job", "base")).toEqual(storedScore);
    await repo.saveScore("job", "base", null, { ...storedScore, total: 60 });
    expect((await repo.getScore("job", "base"))?.total).toBe(60);
  });

  it("round-trips all score fields through Supabase using the user's token", async () => {
    let row: Record<string, unknown> | null = null;
    const urls: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer user-token");
      urls.push(new URL(url));
      if (init.method === "POST") {
        row = JSON.parse(String(init.body));
        return new Response(null, { status: 201 });
      }
      return Response.json(row);
    }));
    const repo = supabaseTailorRepo(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-key" },
      { id: "a", token: "user-token" },
    );
    expect(await repo.getScore("job", "base")).toBeNull();
    await repo.saveScore("job", "tailored", "copy-a", storedScore);
    expect(row).toMatchObject({ user_id: "a", job_id: "job", target: "tailored", tailored_cv_id: "copy-a" });
    expect(await repo.getScore("job", "tailored", "copy-a")).toEqual(storedScore);
    const params = urls.at(-1)!.searchParams;
    expect(params.get("job_id")).toBe("eq.job");
    expect(params.get("target")).toBe("eq.tailored");
    expect(params.get("tailored_cv_id")).toBe("eq.copy-a");
    expect(params.get("order")).toBe("created_at.desc");
    expect(params.get("limit")).toBe("1");
  });

  it("surfaces Supabase read and write failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "permission denied" }, { status: 403 })));
    const repo = supabaseTailorRepo(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-key" },
      { id: "a", token: "user-token" },
    );
    await expect(repo.getScore("job", "base")).rejects.toThrow("match_scores select failed");
    await expect(repo.saveScore("job", "base", null, storedScore)).rejects.toThrow("match_scores insert failed");
  });
});
