import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { emptyCv, type CvContent } from "@resumora/shared";
import { supabaseCvRepo } from "../src/cv/supabase-repo.ts";

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

  it("users cannot see each other's CV", async () => {
    const a = supabaseCvRepo(env, await signedInUser());
    const b = supabaseCvRepo(env, await signedInUser());
    await a.save(cvNamed("Private A"), 0);
    const bView = await b.get();
    expect(bView.version).toBe(0);
    expect(bView.content.basics.fullName).toBe("");
  });
});
