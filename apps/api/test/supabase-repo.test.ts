import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { emptyCv, type CvContent } from "@resumora/shared";
import { supabaseCvRepo } from "../src/cv/supabase-repo.ts";
import { supabaseImportAdmin, supabaseImportRepo } from "../src/imports/supabase-repo.ts";
import { supabaseJobAdmin, supabaseJobRepo } from "../src/jobs/supabase-repo.ts";
import { ApiError } from "../src/errors.ts";
import { CV_LINES, makePdf } from "./fixtures.ts";

// Runs against a local stack: `npm run db:start`, then
// SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY and SUPABASE_TEST_SERVICE_KEY from `supabase status`.
const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY ?? "";

const cvNamed = (fullName: string): CvContent => ({ ...emptyCv(), basics: { ...emptyCv().basics, fullName } });

describe("supabaseJobRepo error mapping", () => {
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "test-key" };
  const user = { id: "user-a", token: "test-token" };
  const input = { id: "new-job", source: "link" as const, url: "https://example.test/job", urlNormalized: "https://example.test/job", rawText: "Private text", jsonLd: null };
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  afterEach(() => vi.unstubAllGlobals());

  it("limits and orders pages, quotes cursor filters and keeps timestamp microseconds", async () => {
    const rows = [3, 2, 1].map((id) => ({
      id: `00000000-0000-4000-8000-00000000000${id}`, status: "queued", error_code: null,
      title: null, company: null, location: null, source: "link", url: input.url,
      created_at: "2026-11-05T10:00:00.123456+00:00",
    }));
    const fetch = vi.fn().mockResolvedValueOnce(response(rows)).mockResolvedValueOnce(response(rows.slice(2)));
    vi.stubGlobal("fetch", fetch);
    const repo = supabaseJobRepo(env, user);
    const first = await repo.list({ limit: 2, after: null });
    expect(first.items.map((job) => job.id)).toEqual(rows.slice(0, 2).map((job) => job.id));
    expect(first.next).toEqual({ createdAt: rows[1]!.created_at, id: rows[1]!.id });
    const params = new URL(String(fetch.mock.calls[0]?.[0])).searchParams;
    expect(params.get("order")).toBe("created_at.desc,id.desc");
    expect(params.get("limit")).toBe("3");
    expect(params.has("or")).toBe(false);
    expect(params.get("select")).not.toMatch(/raw_text|json_ld/);

    const second = await repo.list({ limit: 2, after: first.next });
    expect(second.items.map((job) => job.id)).toEqual([rows[2]!.id]);
    expect(second.next).toBeNull();
    const nextParams = new URL(String(fetch.mock.calls[1]?.[0])).searchParams;
    expect(nextParams.get("order")).toBe("created_at.desc,id.desc");
    expect(nextParams.get("limit")).toBe("3");
    expect(nextParams.get("or")).toBe(
      `(created_at.lt."${rows[1]!.created_at}",and(created_at.eq."${rows[1]!.created_at}",id.lt."${rows[1]!.id}"))`,
    );
  });

  it("maps the database job_limit message to the public 429 error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ message: "job_limit", code: "P0001" }, 400)));
    const error = await supabaseJobRepo(env, user).create(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "job_limit", message: "You can add up to 30 jobs per day." });
  });

  it("maps a unique violation to the existing job's id", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ message: "duplicate key", code: "23505" }, 409))
      .mockResolvedValueOnce(response({ id: "first-job" }));
    vi.stubGlobal("fetch", fetch);
    expect(await supabaseJobRepo(env, user).create(input)).toEqual({ id: "first-job", existing: true });
    expect(String(fetch.mock.calls[1]?.[0])).toContain("url_normalized=eq.");
  });

  it("does not treat other insert failures as a job limit or duplicate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ message: "permission denied", code: "42501" }, 403)));
    await expect(supabaseJobRepo(env, user).create(input)).rejects.toThrow("jobs insert failed: permission denied");
  });

  it("does not return an existing result when a unique violation has no matching URL", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ message: "duplicate id", code: "23505" }, 409))
      .mockResolvedValueOnce(response(null)));
    await expect(supabaseJobRepo(env, user).create(input)).rejects.toThrow("jobs insert failed: duplicate id");
  });
});

describe("supabaseJobAdmin claims", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null when another start has already raised attempts", async () => {
    const row = { id: "job", user_id: "a", raw_text: "Private page text", json_ld: null, status: "processing", attempts: 1 };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method !== "PATCH") return Response.json({ ...row });
      const expected = new URL(url).searchParams.get("attempts");
      if (expected !== null && expected !== `eq.${row.attempts}`) return Response.json(null);
      Object.assign(row, JSON.parse(String(init.body)));
      return Response.json({ id: row.id });
    }));
    const admin = supabaseJobAdmin({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" });

    const results = await Promise.all([admin.start("job"), admin.start("job")]);

    expect(results.filter((result) => result !== null)).toEqual([
      { id: "job", userId: "a", rawText: "Private page text", jsonLd: null },
    ]);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(row.attempts).toBe(2);
  });
});

async function signedInUser() {
  const admin = createClient(url!, serviceKey, { auth: { persistSession: false } });
  const email = `test-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const client = createClient(url!, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: data.user.id, token: data.session.access_token };
}

describe.skipIf(!url)("supabaseCvRepo against local Supabase", () => {
  const env = { SUPABASE_URL: url!, SUPABASE_ANON_KEY: anonKey, APP_ORIGIN: "" };

  it("save, load, conflict and restore", async () => {
    const repo = supabaseCvRepo(env, await signedInUser());
    expect((await repo.get()).version).toBe(0);

    expect(await repo.save(cvNamed("First"), 0)).toMatchObject({ ok: true, version: 1 });
    expect(await repo.save(cvNamed("Second"), 1)).toMatchObject({ ok: true, version: 2 });
    expect(await repo.save(cvNamed("Stale"), 1)).toMatchObject({ ok: false, version: 2 });
    expect((await repo.get()).content.basics.fullName).toBe("Second");

    const [item] = await repo.listHistory();
    expect(item?.reason).toBe("autosave");
    expect((await repo.getHistory(item!.id))?.content.basics.fullName).toBe("First");
    expect(await repo.restore(item!.id, 2, cvNamed("First"))).toMatchObject({ ok: true, version: 3 });
    expect((await repo.get()).content.basics.fullName).toBe("First");
  });

  it("a CV with an unexpected shape fails as a server error, not a client error", async () => {
    const user = await signedInUser();
    const direct = createClient(url!, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${user.token}` } },
    });
    const inserted = await direct.from("base_cvs").insert({ user_id: user.id, content: { foo: 1 }, version: 1 });
    expect(inserted.error).toBeNull();

    const err = await supabaseCvRepo(env, user).get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ZodError); // ZodError would become a 400 "invalid_content"
    expect(String(err)).toMatch(/stored CV/);
  });

  it("users cannot see each other's CV", async () => {
    const a = supabaseCvRepo(env, await signedInUser());
    const b = supabaseCvRepo(env, await signedInUser());
    await a.save(cvNamed("Private A"), 0);
    const bView = await b.get();
    expect(bView.version).toBe(0);
    expect(bView.content.basics.fullName).toBe("");
  });
});

describe.skipIf(!url)("supabaseImportRepo against local Supabase", () => {
  const env = { SUPABASE_URL: url!, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey };

  it("import row and file are private to the user", async () => {
    const userA = await signedInUser();
    const userB = await signedInUser();
    const a = supabaseImportRepo(env, userA);
    const id = crypto.randomUUID();
    const created = await a.create({ id, fileName: "cv.pdf", format: "pdf", bytes: makePdf(CV_LINES) });
    expect(created).toMatchObject({ id, status: "queued", error: null, result: null });
    expect(await a.countSince(new Date(Date.now() - 60_000).toISOString())).toBe(1);

    expect(await supabaseImportRepo(env, userB).get(id)).toBeNull();
    expect(await supabaseImportRepo(env, userB).apply(id, 0)).toBeNull();

    // The consumer finishes it; then A applies it.
    const admin = supabaseImportAdmin(env);
    const job = await admin.start(id);
    expect(job).toMatchObject({ id, userId: userA.id });
    expect((await admin.download(job!)).byteLength).toBeGreaterThan(100);
    await admin.finish(id, { content: cvNamed("From import"), warnings: ["check dates"], sourceHeadings: [], unsourcedLines: [], isScan: false });
    await admin.deleteFile(job!);

    expect((await a.get(id))?.result?.warnings).toEqual(["check dates"]);
    expect(await a.apply(id, 0)).toMatchObject({ ok: true, version: 1 });
    expect((await supabaseCvRepo(env, userA).get()).content.basics.fullName).toBe("From import");
    expect((await a.get(id))?.status).toBe("applied");
  });
});
