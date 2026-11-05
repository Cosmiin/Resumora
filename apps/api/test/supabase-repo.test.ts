import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { emptyCv, type CvContent } from "@resumora/shared";
import { supabaseCvRepo } from "../src/cv/supabase-repo.ts";
import { supabaseImportAdmin, supabaseImportRepo } from "../src/imports/supabase-repo.ts";
import { CV_LINES, makePdf } from "./fixtures.ts";

// Runs against a local stack: `npm run db:start`, then
// SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY and SUPABASE_TEST_SERVICE_KEY from `supabase status`.
const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY ?? "";

const cvNamed = (fullName: string): CvContent => ({ ...emptyCv(), basics: { ...emptyCv().basics, fullName } });

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
    expect(await repo.restore(item!.id, 2)).toMatchObject({ ok: true, version: 3 });
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
    await admin.finish(id, { content: cvNamed("From import"), warnings: ["check dates"] });
    await admin.deleteFile(job!);

    expect((await a.get(id))?.result?.warnings).toEqual(["check dates"]);
    expect(await a.apply(id, 0)).toMatchObject({ ok: true, version: 1 });
    expect((await supabaseCvRepo(env, userA).get()).content.basics.fullName).toBe("From import");
    expect((await a.get(id))?.status).toBe("applied");
  });
});
