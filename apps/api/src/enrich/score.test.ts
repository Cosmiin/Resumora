import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiInputRejectedError, AiOutputTooLongError } from "../ai/call-model.ts";

/** Set to make callModel throw this error instead of calling the (fake) provider. */
const forced = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock("../ai/call-model.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/call-model.ts")>();
  return {
    ...real,
    callModel: (...args: Parameters<typeof real.callModel>) => {
      if (forced.error) return Promise.reject(forced.error);
      return real.callModel(...args);
    },
  };
});
import { RoleResultSchema, SCORE_POLICY, buildRoleResult, emptyCv, fingerprint, type CvContent, type Experience } from "@resumora/shared";
import { ApiError } from "../errors.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";
import { gradeBullets, scoreRole } from "./score.ts";
import { scoreSystemPrompt, scoreUserMessage } from "./prompts.ts";
import { allSpecific, fakeModel, roleWith } from "./fake-model.ts";

let cv: ReturnType<typeof memoryCvRepo>;
let insights: ReturnType<typeof memoryInsightsRepo>;
let content: CvContent;

async function save(...roles: Experience[]) {
  content = { ...emptyCv("en"), experience: roles };
  await cv.save(content, (await cv.get()).version);
}
const fp = (r: Experience) => fingerprint(r, content.locale);

beforeEach(() => {
  forced.error = null;
  cv = memoryCvRepo();
  insights = memoryInsightsRepo("user-1");
});

const run = (model: ReturnType<typeof fakeModel>, role: Experience, sent = fp(role)) =>
  scoreRole({ cv, insights, model: model.deps, userId: "user-1" }, { roleId: role.id, fingerprint: sent });

describe("scoreRole", () => {
  it.each(["cached", "pending", "fresh"])("drops answered role questions from %s results without changing the fingerprint", async (source) => {
    const role = roleWith(["Prepared payroll files."]);
    await save(role);
    const answer = {
      ...allSpecific(role),
      roleQuestions: [
        { text: "  Which tools did you use?  ", options: ["Excel", "SAP", "Workday"] },
        { text: "Who did you report to?", options: ["The CEO", "A department head", "The owner"] },
      ],
    };
    const stored = buildRoleResult(role, answer, fp(role));
    if (source === "cached") await insights.put(role.id, stored);
    if (source === "pending") {
      await insights.put(role.id, { ...stored, fingerprint: "old" });
      await insights.putPending(role.id, stored);
    }
    role.notes.push({ id: "n1", question: "  WHICH TOOLS DID YOU USE?  ", answer: "SAP", via: ["type"], askedAt: "2026-11-06T00:00:00Z" });
    await save(role);
    expect(fp(role)).toBe(stored.fingerprint);
    const model = fakeModel(() => answer);
    const result = await run(model, role);
    expect(result.roleQuestions).toEqual([
      { id: "rq2", text: "Who did you report to?", options: ["The CEO", "A department head", "The owner"], kind: "role", topic: "other" },
    ]);
    expect(result.fingerprint).toBe(stored.fingerprint);
    role.notes.push({ id: "n2", question: "who did you report to?", answer: "The CEO", via: ["type"], askedAt: "2026-11-06T00:01:00Z" });
    await save(role);
    expect((await run(model, role)).roleQuestions).toEqual([]);
    expect(model.requests).toHaveLength(source === "fresh" ? 1 : 0);
  });

  it("re-scores a row stored under the old policy once", async () => {
    const role = roleWith(["Prepared payroll files."]);
    await save(role);
    const stored = buildRoleResult(role, allSpecific(role), fp(role));
    await insights.put(role.id, { ...stored, policy: "score/3" });
    const model = fakeModel(() => allSpecific(role));
    expect((await run(model, role)).policy).toBe(SCORE_POLICY);
    await run(model, role);
    expect(model.requests).toHaveLength(1);
  });

  it("the prompt always covers company, purpose and tools, skips what the CV or notes answer, and allows at most 5 more", async () => {
    const role = roleWith(["Prepared payroll files."]);
    role.notes.push({ id: "n1", question: "What does the company do?", answer: "Acme runs payroll for small firms", via: ["type"], askedAt: "2026-11-06T00:00:00Z" });
    await save(role);
    const model = fakeModel(() => ({ ...allSpecific(role), thin: true,
      roleQuestions: [{ text: "What was the role for?", options: ["Payroll", "HR", "Finance"], topic: "purpose" }] }));
    const result = await run(model, role);
    const sent = JSON.stringify(model.requests[0]?.messages);
    expect(sent).toContain("what the company does");
    expect(sent).toContain("what the role was for");
    expect(sent).toContain("tools");
    expect(sent).toContain("at most 5 more");
    expect(sent).toContain("Acme runs payroll for small firms");
    expect(result.roleQuestions.map((q) => q.topic)).toEqual(["purpose"]);
    expect(result.thin).toBe(true);
  });

  it("asks the model once for a missing row and stores the result", async () => {
    const role = roleWith(["Prepared employment contracts for temporary workers."]);
    await save(role);
    const model = fakeModel(() => allSpecific(role));
    const result = await run(model, role);
    expect(result.score).toBe(100);
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]).toMatchObject({ temperature: 0, max_completion_tokens: 780 });
    expect(model.logged.map((l) => l.task)).toEqual(["enrich_score"]);
    expect(await insights.get(role.id)).toEqual(result);
  });

  it("returns a cached row with the same fingerprint and policy without a model call", async () => {
    const role = roleWith(["Prepared payroll files."]);
    await save(role);
    await run(fakeModel(() => allSpecific(role)), role);
    const second = fakeModel(() => {
      throw new Error("should not be called");
    });
    expect((await run(second, role)).policy).toBe(SCORE_POLICY);
    expect(second.requests).toHaveLength(0);
  });

  it("promotes a matching pending result without a model call", async () => {
    const role = roleWith(["Prepared payroll files."]);
    await save(role);
    const predicted = buildRoleResult(role, allSpecific(role), fp(role));
    await insights.put(role.id, { ...predicted, fingerprint: "old" });
    await insights.putPending(role.id, predicted);
    const model = fakeModel(() => ({}));
    expect(await run(model, role)).toEqual(predicted);
    expect(model.requests).toHaveLength(0);
    expect(model.logged).toHaveLength(0);
    expect(await insights.get(role.id)).toEqual(predicted);
  });

  it("the matching main result wins over pending", async () => {
    const role = roleWith(["Prepared payroll files."]);
    await save(role);
    const main = buildRoleResult(role, allSpecific(role), fp(role));
    await insights.put(role.id, main);
    await insights.putPending(role.id, { ...main, score: 80 });
    const model = fakeModel(() => ({}));
    expect(await run(model, role)).toEqual(main);
    expect(model.requests).toHaveLength(0);
  });

  it("ignores pending results from score/1 or a different fingerprint", async () => {
    const role = roleWith(["Prepared payroll files."]);
    await save(role);
    const predicted = buildRoleResult(role, allSpecific(role), fp(role));
    await insights.put(role.id, { ...predicted, fingerprint: "old" });
    await insights.putPending(role.id, { ...predicted, policy: "score/1" });
    await insights.putPending(role.id, { ...predicted, fingerprint: "other" });
    const model = fakeModel(() => allSpecific(role));
    expect((await run(model, role)).policy).toBe(SCORE_POLICY);
    expect(model.requests).toHaveLength(1);
  });

  it("re-grades a stored score/2 row once", async () => {
    const role = roleWith(["Prepared payroll files."]);
    await save(role);
    const old = await run(fakeModel(() => allSpecific(role)), role);
    const stored = {
      roleId: role.id, policy: "score/2", fingerprint: old.fingerprint, score: old.score,
      bullets: old.bullets, nextStep: old.nextStep, questions: old.questions,
    };
    await insights.put(role.id, RoleResultSchema.parse(stored));
    const model = fakeModel(() => allSpecific(role));
    const result = await run(model, role);
    expect(result.policy).toBe(SCORE_POLICY);
    expect(await run(model, role)).toEqual(result);
    expect(model.requests).toHaveLength(1);
  });

  it("409 not_saved for a stale fingerprint, with no call", async () => {
    const role = roleWith(["Prepared payroll files."]);
    await save(role);
    const model = fakeModel(() => allSpecific(role));
    await expect(run(model, role, "stale")).rejects.toMatchObject({ status: 409, code: "not_saved" });
    expect(model.requests).toHaveLength(0);
  });

  it("409 not_saved for a role that is not in the saved CV", async () => {
    await save(roleWith(["x"]));
    const other = roleWith(["y"]);
    const failure = run(fakeModel(() => ({})), other);
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 409, code: "not_saved" });
  });

  it("scores and stores role questions for a role with no bullets", async () => {
    const role = roleWith([]);
    await save(role);
    const model = fakeModel(() => ({
      ...allSpecific(role),
      roleQuestions: [
        { text: "Which tools did you use?", options: ["Excel", "SAP", "Workday"] },
        { text: "Who did you report to?", options: ["The CEO", "A department head", "The owner"] },
      ],
    }));
    const result = await run(model, role);
    expect(result).toMatchObject({
      score: null, bullets: [], nextStep: null, questions: [],
      roleQuestions: [
        { id: "rq1", text: "Which tools did you use?", options: ["Excel", "SAP", "Workday"], kind: "role" },
        { id: "rq2", text: "Who did you report to?", options: ["The CEO", "A department head", "The owner"], kind: "role", topic: "other" },
      ],
    });
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]).toMatchObject({ max_completion_tokens: 600 });
    expect(JSON.stringify(model.requests[0]?.messages)).toContain("[]");
    expect(await insights.get(role.id)).toEqual(result);
    expect(await run(model, role)).toEqual(result);
    expect(model.requests).toHaveLength(1);
  });

  it("502 and nothing stored when the model grades an id that was not sent or skips one", async () => {
    const role = roleWith(["One", "Two"]);
    await save(role);
    const extra = allSpecific(role);
    extra.bullets.push({ ...extra.bullets[0]!, id: "invented" });
    await expect(run(fakeModel(() => extra), role)).rejects.toMatchObject({ status: 502, code: "ai_bad_answer" });
    const missing = allSpecific(role);
    missing.bullets.pop();
    await expect(run(fakeModel(() => missing), role)).rejects.toMatchObject({ status: 502, code: "ai_bad_answer" });
    expect(await insights.list()).toEqual([]);
  });

  it("503 when every provider fails", async () => {
    const role = roleWith(["One"]);
    await save(role);
    await expect(run(fakeModel(() => ({}), 500), role)).rejects.toMatchObject({ status: 503 });
  });

  it("502 when the answer is cut off at the output limit", async () => {
    const role = roleWith(["One"]);
    await save(role);
    forced.error = new AiOutputTooLongError();
    await expect(run(fakeModel(() => ({})), role)).rejects.toMatchObject({ status: 502, code: "ai_bad_answer" });
  });

  it("503 when every provider rejects the input", async () => {
    const role = roleWith(["One"]);
    await save(role);
    forced.error = new AiInputRejectedError();
    await expect(run(fakeModel(() => ({})), role)).rejects.toMatchObject({ status: 503, code: "ai_unavailable" });
  });

  it("removes rows for roles that are no longer in the saved CV", async () => {
    const gone = roleWith(["Old"]);
    const kept = roleWith(["New"]);
    await save(gone);
    await run(fakeModel(() => allSpecific(gone)), gone);
    await save(kept);
    await run(fakeModel(() => allSpecific(kept)), kept);
    expect((await insights.list()).map((r) => r.roleId)).toEqual([kept.id]);
  });
});

describe("gradeBullets", () => {
  const role = roleWith([], { bullets: [{ id: "b1", text: "Prepared payroll files." }, { id: "b2", text: "Checked staff records." }] });
  const grade = (model: ReturnType<typeof fakeModel>, ids: readonly string[] = ["b2"]) =>
    gradeBullets({ cv, insights, model: model.deps, userId: "user-1" }, role, "ro", ids);

  it("grades only the requested bullet with context and logs enrich_score", async () => {
    const answer = { ...allSpecific(role), bullets: [allSpecific(role).bullets[1]!] };
    const model = fakeModel(() => answer);
    expect(await grade(model)).toEqual(answer.bullets);
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]).toMatchObject({
      max_completion_tokens: 780,
      messages: [
        { role: "system", content: scoreSystemPrompt("ro") },
        { role: "user", content: expect.stringContaining("Grade only these bullets: b2. Return entries for those ids only; the other bullets are context.") },
      ],
    });
    expect(JSON.stringify(model.requests[0]?.messages)).toContain("Prepared payroll files.");
    expect(model.logged).toMatchObject([{ task: "enrich_score", userId: "user-1", status: "ok" }]);
  });

  it.each(["extra", "missing", "duplicate", "wrong"])("maps %s bullet ids to 502 ai_bad_answer without retries", async (kind) => {
    const answer = allSpecific(role);
    const b2 = answer.bullets[1]!;
    answer.bullets = kind === "extra" ? answer.bullets : kind === "missing" ? [] : kind === "duplicate" ? [b2, b2] : [answer.bullets[0]!];
    const model = fakeModel(() => answer);
    await expect(grade(model)).rejects.toMatchObject({ status: 502, code: "ai_bad_answer" });
    expect(model.requests).toHaveLength(1);
    expect(model.logged).toMatchObject([{ task: "enrich_score", status: "ok" }]);
  });

  it("accepts a corrected schema-invalid answer on retry", async () => {
    let calls = 0;
    const model = fakeModel(() => {
      if (calls++ === 0) return {};
      const answer = allSpecific(role);
      return { ...answer, bullets: [answer.bullets[1]!] };
    });
    expect(await grade(model)).toHaveLength(1);
    expect(model.requests).toHaveLength(2);
  });

  it("grades several ids in any order using the proportional token limit", async () => {
    const answer = allSpecific(role);
    const model = fakeModel(() => answer);
    expect(await grade(model, ["b2", "b1"])).toEqual(answer.bullets);
    expect(model.requests[0]).toMatchObject({ max_completion_tokens: 960 });
    expect(JSON.stringify(model.requests[0]?.messages)).toContain("Grade only these bullets: b2, b1.");
  });

  it("keeps provider failures as 503 ai_unavailable", async () => {
    await expect(grade(fakeModel(() => ({}), 500))).rejects.toMatchObject({ status: 503, code: "ai_unavailable" });
  });
});

describe("score prompt", () => {
  it("prioritizes the seven topics, and role questions cover company, purpose and tools, then at most 5 more", () => {
    const prompt = scoreSystemPrompt("en");
    const topics = ["| Tools |", "| Reporting line |", "| Leading people |", "| Who they worked with |", "| Processes |", "| Scope |", "| Results |"];
    let previous = -1;
    for (const topic of topics) {
      const position = prompt.indexOf(topic);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
    const fixed = ["topic company: what the company does", "topic purpose: what the role was for", "topic tools: the tools"].map((s) => prompt.indexOf(s));
    expect(fixed.every((at, i) => at > (fixed[i - 1] ?? -1))).toBe(true);
    expect(prompt).toContain("at most 5 more");
    expect(prompt).not.toContain("Role questions ask only about");
  });

  it("requires options for every question and avoids facts already answered", () => {
    const prompt = scoreSystemPrompt("en");
    expect(prompt).toContain("up to 4 options for every question");
    expect(prompt).toContain("Do not add an option\n  meaning other, something else or none of the above");
    expect(prompt).toContain("Never ask about something the CV or the notes already answer.");
    expect(prompt).not.toContain("Use an empty list when the question is open");
  });

  it("includes the role's notes so known facts are not asked again", () => {
    const role = roleWith([], {
      notes: [{ id: "n1", question: "Which tools did you use?", answer: "SAP", via: ["type"], askedAt: "2026-11-06T00:00:00Z" }],
    });
    expect(scoreUserMessage(role)).toContain(JSON.stringify({ question: "Which tools did you use?", answer: "SAP" }));
  });

  it("sends title and description as context and every bullet as { id, text }, its period, and no company", () => {
    const role = roleWith(["First", "Second"], { company: "Secret Corp", startDate: "2019-03" });
    const message = scoreUserMessage(role);
    expect(message).toContain("context only");
    expect(message).toContain("Payroll Specialist");
    expect(message).toContain("Payroll for 40 staff.");
    for (const b of role.bullets) expect(message).toContain(JSON.stringify({ id: b.id, text: b.text }));
    expect(message).not.toContain("Secret Corp");
    expect(message).toContain("Role period (context only, not graded): 2019-03 – ");
  });

  it("contains all 7 calibration lines and no unsupported-language escape", () => {
    const prompt = scoreSystemPrompt("en");
    for (const line of [
      "Responsible for various administrative tasks.",
      "Prepared employment contracts for temporary workers.",
      "Supported Romanian market-entry planning through partner outreach.",
      "Coordinated onboarding documentation between recruiters and payroll teams.",
      "Increased efficiency by 75% using advanced solutions.",
      "Investigated failed API requests using application logs.",
      "Cut onboarding time from 3 days to 20 minutes by introducing video ID checks.",
    ]) expect(prompt).toContain(line);
    expect(prompt).not.toContain("unsupported-language");
    expect(prompt).toContain("10–50");
  });

  it("names the CV language and keeps the output rule", () => {
    expect(scoreSystemPrompt("ro")).toContain("CV locale: ro");
    expect(scoreSystemPrompt("en")).toContain("every supplied bullet id exactly once");
  });
});

describe("projects and volunteering are scored like roles", () => {
  const project = () => ({ ...roleWith(["Built a Python forecast script."], { title: "Budget forecast", company: "Personal project" }), url: "" });

  it("scores a project and a volunteering item, saying which kind each is", async () => {
    const p = project();
    const v = roleWith(["Mentored 12 students."], { title: "Mentor", company: "Junior Achievement" });
    content = { ...emptyCv("en"), projects: [p], volunteering: [v] };
    await cv.save(content, (await cv.get()).version);
    const model = fakeModel(() => allSpecific(p));
    const result = await scoreRole({ cv, insights, model: model.deps, userId: "user-1" }, { roleId: p.id, fingerprint: fingerprint(p, "en") });
    expect(result.score).toBeGreaterThan(0);
    const sent = JSON.stringify(model.requests[0]?.messages);
    expect(sent).toContain("This is a project");
    expect(sent).toContain("what the project was");
    const model2 = fakeModel(() => allSpecific(v));
    await scoreRole({ cv, insights, model: model2.deps, userId: "user-1" }, { roleId: v.id, fingerprint: fingerprint(v, "en") });
    expect(JSON.stringify(model2.requests[0]?.messages)).toContain("This is a volunteering role");
  });

  it("a role's message names no kind", async () => {
    const role = roleWith(["Prepared payroll files."]);
    await save(role);
    const model = fakeModel(() => allSpecific(role));
    await run(model, role);
    expect(JSON.stringify(model.requests[0]?.messages)).not.toContain("This is a");
  });

  it("removes a deleted project's cached score and keeps the others", async () => {
    const p = project();
    const role = roleWith(["Prepared payroll files."]);
    await insights.put(p.id, buildRoleResult(p, allSpecific(p), fingerprint(p, "en")));
    content = { ...emptyCv("en"), experience: [role], projects: [p] };
    await cv.save(content, (await cv.get()).version);
    await run(fakeModel(() => allSpecific(role)), role);
    expect(await insights.get(p.id)).not.toBeNull();
    await save(role);
    await run(fakeModel(() => allSpecific(role)), role);
    expect(await insights.get(p.id)).toBeNull();
  });
});
