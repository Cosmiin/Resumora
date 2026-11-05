import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ImportResultSchema, ImportStatusSchema, type ImportResult } from "@resumora/shared";
import type { AuthUser, Env, SupabaseEnv } from "../env.ts";
import type { SaveResult } from "../cv/repo.ts";
import { IMPORT_FAILURES, type ImportFailureCode } from "./extract-text.ts";
import { toResponse } from "./memory-repo.ts";
import { ApiError } from "../errors.ts";
import { IMPORTS_PER_DAY, storagePath, type ImportAdmin, type ImportRepo } from "./repo.ts";

const BUCKET = "cv-imports";
const CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

type Row = {
  id: string;
  status: string;
  file_name: string;
  error: string | null;
  result: unknown;
  created_at: string;
};
const COLUMNS = "id, status, file_name, error, result, created_at";

function rowToResponse(row: Row) {
  const result = row.result === null ? null : ImportResultSchema.safeParse(row.result);
  if (result && !result.success) throw new Error(`stored import ${row.id} has an unexpected result shape`);
  const code = row.error && row.error in IMPORT_FAILURES ? (row.error as ImportFailureCode) : row.error ? "internal" : null;
  return toResponse({
    id: row.id,
    status: ImportStatusSchema.parse(row.status),
    fileName: row.file_name,
    error: code,
    result: result?.data ?? null,
    createdAt: row.created_at,
  });
}

/** The signed-in user's imports, queried as the user so RLS and Storage policies apply. */
export function supabaseImportRepo(env: SupabaseEnv, user: AuthUser): ImportRepo {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  });

  return {
    async create({ id, fileName, format, bytes }) {
      // Row first, so a file never exists without a row (the sweeper finds files through rows).
      const path = storagePath(user.id, id, format);
      const { data, error } = await db
        .from("cv_imports")
        .insert({ id, file_name: fileName, storage_path: path })
        .select(COLUMNS)
        .single();
      if (error?.message === "import_limit") {
        throw new ApiError(429, "import_limit", `You can import up to ${IMPORTS_PER_DAY} CVs per day.`);
      }
      if (error) throw new Error(`cv_imports insert failed: ${error.message}`);
      const uploaded = await db.storage.from(BUCKET).upload(path, bytes, { contentType: CONTENT_TYPES[format] });
      if (uploaded.error) throw new Error(`import upload failed: ${uploaded.error.message}`);
      return rowToResponse(data as Row);
    },

    async get(id) {
      const { data, error } = await db.from("cv_imports").select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(`cv_imports select failed: ${error.message}`);
      return data ? rowToResponse(data as Row) : null;
    },

    async countSince(iso) {
      const { count, error } = await db.from("cv_imports").select("id", { count: "exact", head: true }).gte("created_at", iso);
      if (error) throw new Error(`cv_imports count failed: ${error.message}`);
      return count ?? 0;
    },

    async apply(id, expectedVersion, content) {
      const { data, error } = await db.rpc("apply_import", { p_import_id: id, p_expected_version: expectedVersion, p_content: content ?? null });
      if (error) throw new Error(`apply_import failed: ${error.message}`);
      const row = (data as { version: number; updated_at: string; conflict: boolean }[])[0];
      return row ? ({ ok: !row.conflict, version: row.version, updatedAt: row.updated_at } satisfies SaveResult) : null;
    },
  };
}

/** The queue consumer's access, with the service role key. Never used by request handlers. */
export function supabaseImportAdmin(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">): ImportAdmin {
  const db: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const update = async (id: string, values: Record<string, unknown>) => {
    const { error } = await db.from("cv_imports").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(`cv_imports update failed: ${error.message}`);
  };

  return {
    async start(id) {
      const { data, error } = await db.from("cv_imports").select("id, user_id, storage_path, status, attempts").eq("id", id).maybeSingle();
      if (error) throw new Error(`cv_imports select failed: ${error.message}`);
      if (!data || (data.status !== "queued" && data.status !== "processing")) return null;
      await update(id, { status: "processing", attempts: data.attempts + 1 });
      return { id, userId: data.user_id as string, storagePath: data.storage_path as string };
    },
    async download(job) {
      const { data, error } = await db.storage.from(BUCKET).download(job.storagePath);
      if (error) throw new Error(`import download failed: ${error.message}`);
      return new Uint8Array(await data.arrayBuffer());
    },
    async finish(id, result: ImportResult) {
      await update(id, { status: "ready", result, error: null });
    },
    async fail(id, code) {
      await update(id, { status: "failed", error: code, result: null });
    },
    async deleteFile(job) {
      const { error } = await db.storage.from(BUCKET).remove([job.storagePath]);
      if (error) throw new Error(`import file delete failed: ${error.message}`);
    },
    async expireStale(iso) {
      const { data, error } = await db
        .from("cv_imports")
        .update({ status: "failed", error: "internal", result: null, updated_at: new Date().toISOString() })
        .in("status", ["queued", "processing"])
        .lt("created_at", iso)
        .select("id, user_id, storage_path");
      if (error) throw new Error(`cv_imports expire failed: ${error.message}`);
      return (data ?? []).map((r) => ({ id: r.id as string, userId: r.user_id as string, storagePath: r.storage_path as string }));
    },
    async logCall(e) {
      const { error } = await db.from("ai_calls").insert({
        user_id: e.userId, task: e.task, provider: e.provider, model: e.model, status: e.status,
        error: e.error ?? null, duration_ms: e.durationMs, input_tokens: e.inputTokens ?? null, output_tokens: e.outputTokens ?? null,
      });
      if (error) throw new Error(`ai_calls insert failed: ${error.message}`);
    },
  };
}
