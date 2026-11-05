import { describe, expect, it, vi } from "vitest";
import { emptyCv, fingerprint, newId, type CvContent, type Experience, type RewriteEvent, type RoleResult } from "@resumora/shared";
import { createApp } from "../app.ts";
import { AiUnavailableError, type ModelDeps } from "../ai/call-model.ts";
import { AiStreamBrokenError } from "../ai/stream-model.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import type { CvRepo } from "../cv/repo.ts";
import { roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";
import { checkProposal, rewriteEvents } from "./rewrite.ts";

const note = (answer: string, question = "How often?") => ({ id: newId(), question, answer, via: ["pick" as const], askedAt: "2026-11-01T10:00:00.000Z" });

async function* chunks(...parts: Array<string | Error>): AsyncGenerator<string> {
  for (const p of parts) {
    if (p instanceof Error) throw p;
    yield p;
  }
}
async function collect(it: AsyncIterable<RewriteEvent>) {
  const out: RewriteEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe("checkProposal", () => {
  const role = roleWith(["Prepared contracts for 40 workers.", "Answered phones."], { notes: [note("Under 10 a day"), note("10–50 a week")] });
  const [b1, b2] = role.bullets;

  it("accepts a changed proposal with known numbers", () => {
    expect(checkProposal(role, b1!.id, "Drafted contracts for 40 workers each month.", role.notes)).toBe("ok");
  });
  it("accepts both ends of a range picked in a note, but not an exact number from nowhere", () => {
    expect(checkProposal(role, b2!.id, "Answered 10–50 calls a week.", role.notes)).toBe("ok");
    expect(checkProposal(role, b2!.id, "Answered 30 calls a week.", role.notes)).toBe("number");
  });
  it("drops 221 characters or more", () => {
    expect(checkProposal(role, b2!.id, "x".repeat(220), role.notes)).toBe("ok");
    expect(checkProposal(role, b2!.id, "x".repeat(221), role.notes)).toBe("length");
  });
  it("drops unknown ids, new without notes, and unchanged text", () => {
    expect(checkProposal(role, "nope", "Something new here.", role.notes)).toBe("unknownBullet");
    expect(checkProposal({ ...role, notes: [] }, "new", "Trained staff.", [])).toBe("newWithoutNote");
    expect(checkProposal(role, "new", "Trained staff.", role.notes)).toBe("ok");
    expect(checkProposal(role, b2!.id, "  Answered   phones.  ", role.notes)).toBe("unchanged");
  });
  it("drops a proposal for a keep-as-is bullet", () => {
    expect(checkProposal(role, b2!.id, "Handled calls.", role.notes, new Set([b2!.id]))).toBe("unchanged");
  });
});

describe("rewriteEvents", () => {
  const check = (_k: string, t: string) => (t.includes("7") ? ("number" as const) : ("ok" as const));

  it("orders events start, delta, ready per block, then done", async () => {
    const events = await collect(rewriteEvents(chunks("### b1\nOne ", "two.\n### b2\nThree.\n", "### end\n"), check));
    expect(events.map((e) => e.event)).toEqual(["start", "delta", "delta", "ready", "start", "delta", "ready", "done"]);
    expect(events[0]!.data).toEqual({ index: 0, replaces: "b1" });
    expect(events[3]!.data).toEqual({ index: 0, text: "One two." });
  });

  it("marks new blocks with replaces null and failed checks as dropped", async () => {
    const events = await collect(rewriteEvents(chunks("### new\nGrew 7 teams.\n### end\n"), check));
    expect(events[0]!.data).toEqual({ index: 0, replaces: null });
    expect(events.find((e) => e.event === "dropped")!.data).toEqual({ index: 0, reason: "number" });
    expect(events.some((e) => e.event === "ready")).toBe(false);
  });

  it("a broken stream keeps earlier ready, never readies the broken block, then error and done", async () => {
    const events = await collect(rewriteEvents(chunks("### b1\nFirst.\n### b2\nSecond hal", new AiStreamBrokenError()), check));
    const names = events.map((e) => e.event);
    expect(names.filter((n) => n === "ready")).toHaveLength(1);
    expect(events.find((e) => e.event === "ready")!.data).toMatchObject({ index: 0 });
    expect(names.slice(-2)).toEqual(["error", "done"]);
    expect(events.at(-2)!.data).toMatchObject({ code: "stream_broken" });
  });

  it("unavailable AI becomes an ai_unavailable error", async () => {
    const events = await collect(rewriteEvents(chunks(new AiUnavailableError()), check));
    expect(events.map((e) => e.event)).toEqual(["error", "done"]);
    expect(events[0]!.data).toMatchObject({ code: "ai_unavailable" });
  });
});

// ---- routes ----

const enc = new TextEncoder();
const sseBody = (text: string) =>
  [`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`, `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`, "data: [DONE]\n\n"].join("");

function setup(opts: { cv: CvContent; answer: string; scores?: RoleResult; status?: number }) {
  const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const order: string[] = [];
  const inner = memoryCvRepo();
  const cv: CvRepo = {
    ...inner,
    snapshot: async (reason) => {
      order.push("snapshot");
      await inner.snapshot(reason);
    },
  };
  const store = new Map();
  const model: ModelDeps = {
    providers: [{ name: "openai", url: "https://example.test", apiKey: "k", model: "m" }],
    fetch: (async (_u: string, init: RequestInit) => {
      order.push("model");
      bodies.push(JSON.parse(String(init.body)));
      if (opts.status) return new Response("{}", { status: opts.status });
      return new Response(enc.encode(sseBody(opts.answer)), { status: 200 });
    }) as typeof fetch,
    logCall: async () => {},
  };
  const app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (t) => (t === "good" ? { id: "user-1", token: t } : null),
    cvRepo: () => cv,
    importRepo: () => {
      throw new Error("not used");
    },
    insightsRepo: (u) => memoryInsightsRepo(u.id, store),
    model: () => model,
    queue: { send: async () => {} },
    log: vi.fn(),
  });
  const ready = (async () => {
    await inner.save(opts.cv, 0);
    if (opts.scores) await memoryInsightsRepo("user-1", store).put(opts.scores.roleId, opts.scores);
  })();
  const post = async (path: string, body?: unknown) => {
    await ready;
    return app.request(`/v1/enrich/${path}`, { method: "POST", headers: { authorization: "Bearer good", "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  };
  return { post, bodies, order };
}

async function readEvents(res: Response) {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((b) => b.trim())
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)![1]!;
      const data = JSON.parse(/^data: (.*)$/m.exec(block)![1]!) as Record<string, unknown>;
      return { event, data };
    });
}

const cvWith = (roles: Experience[], summary = "Payroll specialist."): CvContent => {
  const cv = emptyCv("en");
  return { ...cv, basics: { ...cv.basics, summary }, experience: roles };
};

describe("POST /v1/enrich/rewrite-role", () => {
  const role = roleWith(["Prepared contracts for 40 workers.", "Answered phones.", "Closed the books monthly."], { notes: [note("10–50 a week", "How many calls?")] });
  const [b1, b2] = role.bullets;

  it("snapshots once before the model, streams events, and puts notes and keep-as-is marks in the message", async () => {
    const scores = {
      roleId: role.id, policy: "x", fingerprint: fingerprint(role, "en"), score: 80,
      bullets: [{ id: b2!.id, score: 100 }, { id: b1!.id, score: 50 }],
    } as unknown as RoleResult;
    const answer = `### ${b1!.id}\nDrafted contracts for 40 workers.\n### ${b2!.id}\nHandled the phones.\n### new\nAnswered 10–50 calls a week.\n### end\n`;
    const { post, bodies, order } = setup({ cv: cvWith([role]), answer, scores });
    const res = await post("rewrite-role", { roleId: role.id });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = await readEvents(res);
    expect(order).toEqual(["snapshot", "model"]);
    expect(events.filter((e) => e.event === "ready").map((e) => e.data.index)).toEqual([0, 2]);
    expect(events.find((e) => e.event === "dropped")!.data).toEqual({ index: 1, reason: "unchanged" });
    expect(events.at(-1)).toEqual({ event: "done", data: {} });
    const user = bodies[0]!.messages[1]!.content;
    expect(user).toContain("Q: How many calls?\nA: 10–50 a week");
    expect(user).toMatch(new RegExp(`${b2!.id}.*keep as is`));
    expect(user).not.toMatch(new RegExp(`${b1!.id}.*keep as is`));
  });

  it("409 not_saved for a missing role, with no snapshot and no model call", async () => {
    const { post, order } = setup({ cv: cvWith([role]), answer: "" });
    const res = await post("rewrite-role", { roleId: "gone" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_saved");
    expect(order).toEqual([]);
  });

  it("an unavailable provider gives an ai_unavailable error event, then done", async () => {
    const { post } = setup({ cv: cvWith([role]), answer: "", status: 500 });
    const events = await readEvents(await post("rewrite-role", { roleId: role.id }));
    expect(events.map((e) => e.event)).toEqual(["error", "done"]);
    expect(events[0]!.data).toMatchObject({ code: "ai_unavailable" });
  });
});

describe("POST /v1/enrich/rewrite-summary", () => {
  const r1 = roleWith(["Prepared contracts for 40 workers."], { company: "Acme Payroll", title: "Payroll Specialist", notes: [note("Under 10 a day", "How many?")] });
  const r2 = roleWith(["Ran the front desk."], { company: "Beta Hotel", title: "Receptionist", startDate: "2017-03", endDate: "2019-12" });

  it("snapshots once before the model and sends every role in full", async () => {
    const { post, bodies, order } = setup({ cv: cvWith([r1, r2]), answer: "### summary\nPayroll specialist with 40 workers' contracts behind them.\n### end\n" });
    const events = await readEvents(await post("rewrite-summary"));
    expect(order).toEqual(["snapshot", "model"]);
    expect(events.map((e) => e.event)).toContain("ready");
    expect(events.find((e) => e.event === "start")!.data).toEqual({ index: 0, replaces: "summary" });
    const user = bodies[0]!.messages[1]!.content;
    for (const part of ["Payroll Specialist", "Acme Payroll", "Beta Hotel", "Receptionist", "2017-03", "2019-12", "Ran the front desk.", "Q: How many?\nA: Under 10 a day"]) {
      expect(user).toContain(part);
    }
  });

  it("works with an empty summary, and drops any key but summary", async () => {
    const { post } = setup({ cv: cvWith([r1], ""), answer: "### b1\nSomething.\n### end\n" });
    const events = await readEvents(await post("rewrite-summary"));
    expect(events.find((e) => e.event === "dropped")!.data).toEqual({ index: 0, reason: "unknownBullet" });
  });

  it("drops a summary with an invented number", async () => {
    const { post } = setup({ cv: cvWith([r1]), answer: "### summary\nPayroll specialist with 12 years of experience.\n### end\n" });
    const events = await readEvents(await post("rewrite-summary"));
    expect(events.find((e) => e.event === "dropped")!.data).toEqual({ index: 0, reason: "number" });
  });
});
