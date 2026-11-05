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
import { SCORE_POLICY, emptyCv, fingerprint, type CvContent, type Experience } from "@resumora/shared";
import { ApiError } from "../errors.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";
import { scoreRole } from "./score.ts";
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

  it("asks again when the cached row is from another policy", async () => {
    const role = roleWith(["Prepared payroll files."]);
    await save(role);
    const old = await run(fakeModel(() => allSpecific(role)), role);
    await insights.put(role.id, { ...old, policy: "score/0" });
    const model = fakeModel(() => allSpecific(role));
    expect((await run(model, role)).policy).toBe(SCORE_POLICY);
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

  it("a role with no bullets has a null score and no call", async () => {
    const role = roleWith([]);
    await save(role);
    const model = fakeModel(() => ({}));
    const result = await run(model, role);
    expect(result.score).toBeNull();
    expect(model.requests).toHaveLength(0);
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

describe("score prompt", () => {
  it("sends title and description as context and every bullet as { id, text }, with no company or dates", () => {
    const role = roleWith(["First", "Second"], { company: "Secret Corp", startDate: "2019-03" });
    const message = scoreUserMessage(role);
    expect(message).toContain("context only");
    expect(message).toContain("Payroll Specialist");
    expect(message).toContain("Payroll for 40 staff.");
    for (const b of role.bullets) expect(message).toContain(JSON.stringify({ id: b.id, text: b.text }));
    expect(message).not.toContain("Secret Corp");
    expect(message).not.toContain("2019");
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
