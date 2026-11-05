import { describe, expect, it, vi } from "vitest";
import { emptyCv, newId, type CvContent, type Experience, type RewriteEvent } from "@resumora/shared";
import { createApp } from "../app.ts";
import { AiUnavailableError, type ModelDeps } from "../ai/call-model.ts";
import { AiStreamBrokenError } from "../ai/stream-model.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import type { CvRepo } from "../cv/repo.ts";
import { roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";
import { checkProposal, checkSummary, rewriteEvents } from "./rewrite.ts";

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
    expect(checkProposal(role, b1!.id, "Drafted contracts for 40 workers each month.")).toBe("ok");
  });
  it("accepts both ends of a range picked in a note, but not an exact number from nowhere", () => {
    expect(checkProposal(role, b2!.id, "Answered 10–50 calls a week.")).toBe("ok");
    expect(checkProposal(role, b2!.id, "Answered 30 calls a week.")).toBe("number");
  });
  it("drops 221 characters or more", () => {
    expect(checkProposal(role, b2!.id, "x".repeat(220))).toBe("ok");
    expect(checkProposal(role, b2!.id, "x".repeat(221))).toBe("length");
  });
  it("drops unknown ids, new without notes, and unchanged text", () => {
    expect(checkProposal(role, "nope", "Something new here.")).toBe("unknownBullet");
    expect(checkProposal({ ...role, notes: [] }, "new", "Trained staff.")).toBe("newWithoutNote");
    expect(checkProposal(role, "new", "Trained staff.")).toBe("ok");
    expect(checkProposal(role, b2!.id, "  Answered   phones.  ")).toBe("unchanged");
  });
  it("drops an over-long summary", () => {
    const cv = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, summary: "Short." } };
    expect(checkSummary(cv, "summary", "x".repeat(600))).toBe("ok");
    expect(checkSummary(cv, "summary", "x".repeat(601))).toBe("length");
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
    expect(names).not.toContain("dropped");
  });

  it("drops a repeated key as unknownBullet, but allows several new blocks", async () => {
    const events = await collect(rewriteEvents(chunks("### b1\nA.\n### b1\nB.\n### new\nC.\n### new\nD.\n### end\n"), check));
    expect(events.filter((e) => e.event === "ready").map((e) => e.data.index)).toEqual([0, 2, 3]);
    expect(events.find((e) => e.event === "dropped")!.data).toEqual({ index: 1, reason: "unknownBullet" });
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

function setup(opts: { cv: CvContent; answer: string }) {
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
    jobRepo: () => {
      throw new Error("job repo not used in these tests");
    },
    insightsRepo: (u) => memoryInsightsRepo(u.id, store),
    model: () => model,
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
    log: vi.fn(),
  });
  const ready = (async () => {
    await inner.save(opts.cv, 0);
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
    for (const part of ["Payroll Specialist", "Acme Payroll", "Beta Hotel", "Receptionist", "2017-03", "2019-12", "Ran the front desk.", 'Q: "How many?"\nA: "Under 10 a day"']) {
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
