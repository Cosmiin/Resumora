import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, emptyDraft, type Admit, type ImportDraft } from "@resumora/shared";
import { createApp } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import type { ModelDeps } from "../src/ai/call-model.ts";
import { memoryImports, type MemoryImports } from "../src/imports/memory-repo.ts";
import { handleImportMessage, type QueueMessage } from "../src/imports/consumer.ts";
import type { ImportMessage } from "../src/imports/repo.ts";
import { CV_LINES, makeDocx, makePdf } from "./fixtures.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (res: Response): Promise<any> => res.json();

const USERS: Record<string, string> = { "token-a": "user-a", "token-b": "user-b" };
let cvRepos: Record<string, CvRepo>;
let store: MemoryImports;
let sent: ImportMessage[];
let app: ReturnType<typeof createApp>;
let clock: Date;

beforeEach(() => {
  clock = new Date("2026-11-04T10:00:00Z");
  cvRepos = { "user-a": memoryCvRepo(), "user-b": memoryCvRepo() };
  store = memoryImports({ now: () => clock, cvRepo: (userId) => cvRepos[userId]! });
  sent = [];
  app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (USERS[token] ? { id: USERS[token], token } : null),
    cvRepo: (user) => cvRepos[user.id]!,
    importRepo: (user) => store.repoFor(user.id),
    queue: { send: async (m) => void sent.push(m) },
    now: () => clock,
    log: vi.fn(),
  });
});

function upload(bytes: Uint8Array, name = "cv.pdf", token = "token-a") {
  const form = new FormData();
  form.set("file", new File([bytes], name));
  return app.request("/v1/imports", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
}
const get = (id: string, token = "token-a") => app.request(`/v1/imports/${id}`, { headers: { authorization: `Bearer ${token}` } });
const apply = (id: string, version: number, token = "token-a") =>
  app.request(`/v1/imports/${id}/apply`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ version }),
  });

/** Uploads a file and marks it ready the way the consumer would. */
async function readyImport(fullName = "Imported") {
  const { id } = await json(await upload(makePdf(CV_LINES)));
  const content = { ...emptyCv(), basics: { ...emptyCv().basics, fullName } };
  await store.admin.start(id);
  await store.admin.finish(id, { content, warnings: [] });
  return id as string;
}

describe("import endpoints", () => {
  it("uploads a pdf and queues it", async () => {
    const res = await upload(makePdf(CV_LINES), "Ana CV.pdf");
    expect(res.status).toBe(202);
    const body = await json(res);
    expect(body).toMatchObject({ status: "queued", fileName: "Ana CV.pdf", error: null, result: null });
    expect(sent).toEqual([{ importId: body.id, userId: "user-a" }]);
    expect(store.files.size).toBe(1);
    expect([...store.files.keys()][0]).toBe(`user-a/${body.id}.pdf`);
  });

  it("accepts a docx", async () => {
    const res = await upload(await makeDocx(CV_LINES), "cv.docx");
    expect(res.status).toBe(202);
    expect([...store.files.keys()][0]).toMatch(/\.docx$/);
  });

  it("rejects a png renamed .pdf", async () => {
    const res = await upload(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "cv.pdf");
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("unsupported_file");
    expect(sent).toEqual([]);
  });

  it("rejects a request without a file", async () => {
    const res = await app.request("/v1/imports", { method: "POST", headers: { authorization: "Bearer token-a" }, body: new FormData() });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("unsupported_file");
  });

  it("rejects a 6 MB file", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(new TextEncoder().encode("%PDF-1.4"));
    const res = await upload(big);
    expect(res.status).toBe(413);
    expect((await json(res)).error.code).toBe("file_too_large");
    expect(store.files.size).toBe(0);
  });

  it("limits imports per day", async () => {
    for (let i = 0; i < 10; i++) expect((await upload(makePdf(CV_LINES))).status).toBe(202);
    const res = await upload(makePdf(CV_LINES));
    expect(res.status).toBe(429);
    expect((await json(res)).error).toMatchObject({ code: "import_limit", message: "You can import up to 10 CVs per day." });

    clock = new Date(clock.getTime() + 24 * 60 * 60_000 + 1000);
    expect((await upload(makePdf(CV_LINES))).status).toBe(202);
  });

  it("another user's import is 404", async () => {
    const id = await readyImport();
    expect((await get(id, "token-b")).status).toBe(404);
    expect((await apply(id, 0, "token-b")).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(404);
  });

  it("shows a failed import with a readable message", async () => {
    const { id } = await json(await upload(makePdf(CV_LINES)));
    await store.admin.fail(id, "not_a_cv");
    expect((await json(await get(id))).error).toEqual({ code: "not_a_cv", message: expect.stringMatching(/doesn't look like a CV/) });
  });

  it("apply returns the new version", async () => {
    const id = await readyImport("Imported Name");
    const res = await apply(id, 0);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ version: 1 });
    expect((await cvRepos["user-a"]!.get()).content.basics.fullName).toBe("Imported Name");
    expect((await json(await get(id))).status).toBe("applied");
  });

  it("apply on a stale version is 409 with current", async () => {
    await cvRepos["user-a"]!.save(emptyCv(), 0);
    const id = await readyImport();
    const res = await apply(id, 0);
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ error: { code: "version_conflict" }, current: { version: 1 } });
  });

  it("apply before ready is 409 import_not_ready", async () => {
    const { id } = await json(await upload(makePdf(CV_LINES)));
    const res = await apply(id, 0);
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("import_not_ready");
  });

  it("apply twice is 409 import_not_ready", async () => {
    const id = await readyImport();
    expect((await apply(id, 0)).status).toBe(200);
    expect((await json(await apply(id, 1))).error.code).toBe("import_not_ready");
  });
});

// ── Queue consumer ───────────────────────────────────────────────────────────

function fakeModel(answers: { cv_admit?: Admit; cv_extract?: ImportDraft; crash?: boolean }): ModelDeps {
  return {
    providers: [{ name: "openrouter", url: "https://openrouter.test/v1", apiKey: "k", model: "m" }],
    logCall: async () => {},
    fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const task = (JSON.parse(String(init?.body)) as { response_format: { json_schema: { name: "cv_admit" | "cv_extract" } } })
        .response_format.json_schema.name;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answers[task]) } }] }));
    }) as typeof fetch,
  };
}

function message(importId: string, attempts = 1) {
  const msg = { body: { importId, userId: "user-a" }, attempts, ack: vi.fn<QueueMessage["ack"]>(), retry: vi.fn<QueueMessage["retry"]>() };
  return msg satisfies QueueMessage;
}

describe("import consumer", () => {
  const organized: ImportDraft = { ...emptyDraft(), basics: { ...emptyDraft().basics, fullName: "Ana Popescu" }, technicalSkills: ["SQL"] };

  it("consumer stores the result and deletes the file", async () => {
    const { id } = await json(await upload(await makeDocx(CV_LINES), "cv.docx"));
    const msg = message(id);
    await handleImportMessage({ admin: store.admin, model: fakeModel({ cv_admit: { kind: "cv", reason: "" }, cv_extract: organized }), log: vi.fn() }, msg);

    expect(msg.ack).toHaveBeenCalled();
    const body = await json(await get(id));
    expect(body.status).toBe("ready");
    expect(body.result.content.basics.fullName).toBe("Ana Popescu");
    expect(body.result.content.technicalSkills[0].name).toBe("SQL");
    expect(store.files.size).toBe(0);
  });

  it("consumer fails a non-CV without retrying", async () => {
    const { id } = await json(await upload(await makeDocx(CV_LINES), "cv.docx"));
    const msg = message(id);
    await handleImportMessage({ admin: store.admin, model: fakeModel({ cv_admit: { kind: "not_cv", reason: "invoice" } }), log: vi.fn() }, msg);

    expect(msg.ack).toHaveBeenCalled();
    expect(msg.retry).not.toHaveBeenCalled();
    expect((await json(await get(id))).error.code).toBe("not_a_cv");
    expect(store.files.size).toBe(0);
  });

  it("consumer retries a crash, then fails on the third attempt", async () => {
    const { id } = await json(await upload(await makeDocx(CV_LINES), "cv.docx"));
    const crashing = { ...store.admin, download: async () => Promise.reject(new Error("storage hiccup")) };
    const log = vi.fn();

    const first = message(id, 1);
    await handleImportMessage({ admin: crashing, model: fakeModel({}), log }, first);
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
    expect((await json(await get(id))).status).toBe("processing");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ importId: id, error: expect.stringContaining("storage hiccup") }));

    const third = message(id, 3);
    await handleImportMessage({ admin: crashing, model: fakeModel({}), log }, third);
    expect(third.ack).toHaveBeenCalled();
    expect(third.retry).not.toHaveBeenCalled();
    expect((await json(await get(id))).error.code).toBe("internal");
    expect(store.files.size).toBe(0);
  });

  it("a message for a finished import is acknowledged and ignored", async () => {
    const id = await readyImport();
    const msg = message(id);
    await handleImportMessage({ admin: store.admin, model: fakeModel({ cv_admit: { kind: "not_cv", reason: "" } }), log: vi.fn() }, msg);
    expect(msg.ack).toHaveBeenCalled();
    expect((await json(await get(id))).status).toBe("ready");
  });
});
