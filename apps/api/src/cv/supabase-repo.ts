import { createClient } from "@supabase/supabase-js";
import { HistoryItemSchema, StoredCvSchema, emptyCv, type CvContent } from "@resumora/shared";
import type { AuthUser, SupabaseEnv } from "../env.ts";
import type { CvRepo, SaveResult } from "./repo.ts";

type SaveRow = { version: number; updated_at: string; conflict: boolean };

/** Parses a CV read from the database (v1 or v2, always returned as v2). A bad shape is a server problem (500), not the client's (400). */
export function storedCv(value: unknown): CvContent {
  const parsed = StoredCvSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`stored CV does not match the schema at ${issue?.path.join(".") ?? "?"}: ${issue?.message}`);
  }
  return parsed.data;
}

/** CvRepo backed by Supabase, querying as the signed-in user so RLS applies. */
export function supabaseCvRepo(env: SupabaseEnv, user: AuthUser): CvRepo {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  });

  function toSaveResult(rows: SaveRow[] | null): SaveResult {
    const row = rows?.[0];
    if (!row) throw new Error("save function returned no row");
    return { ok: !row.conflict, version: row.version, updatedAt: row.updated_at };
  }

  return {
    async get() {
      const { data, error } = await db
        .from("base_cvs")
        .select("content, version, updated_at")
        .maybeSingle();
      if (error) throw new Error(`base_cvs select failed: ${error.message}`);
      if (!data) return { content: emptyCv(), version: 0, updatedAt: new Date(0).toISOString() };
      return {
        content: storedCv(data.content),
        version: data.version,
        updatedAt: data.updated_at,
      };
    },

    async save(content, expectedVersion) {
      const { data, error } = await db.rpc("save_base_cv", {
        p_content: content,
        p_expected_version: expectedVersion,
      });
      if (error) throw new Error(`save_base_cv failed: ${error.message}`);
      return toSaveResult(data as SaveRow[]);
    },

    async listHistory() {
      const { data, error } = await db
        .from("base_cv_versions")
        .select("id, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(`base_cv_versions select failed: ${error.message}`);
      return data.map((r) =>
        HistoryItemSchema.parse({ id: r.id, reason: r.reason, createdAt: r.created_at }),
      );
    },

    async getHistory(id) {
      const { data, error } = await db
        .from("base_cv_versions")
        .select("content, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`base_cv_versions select failed: ${error.message}`);
      return data ? { content: storedCv(data.content), createdAt: data.created_at } : null;
    },

    async restore(id, expectedVersion, content) {
      const { data, error } = await db.rpc("restore_base_cv", {
        p_version_id: id,
        p_expected_version: expectedVersion,
        p_content: content,
      });
      if (error) throw new Error(`restore_base_cv failed: ${error.message}`);
      const rows = data as SaveRow[];
      return rows.length ? toSaveResult(rows) : null;
    },

    async snapshot(reason) {
      const { error } = await db.rpc("snapshot_base_cv", { p_reason: reason });
      if (error) throw new Error(`snapshot_base_cv failed: ${error.message}`);
    },
  };
}
