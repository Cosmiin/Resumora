import { createClient } from "@supabase/supabase-js";
import { JobListItemSchema, JobSchema } from "@resumora/shared";
import type { AuthUser, Env, SupabaseEnv } from "../env.ts";
import { ApiError } from "../errors.ts";
import { JOBS_PER_DAY, type JobAdmin, type JobRepo } from "./repo.ts";

type Row = {
  id: string;
  status: string;
  error_code: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  source: string;
  url: string;
  created_at: string;
  extracted: unknown;
  edited_by_user: boolean;
  version: number;
  updated_at: string;
};
const LIST_COLUMNS = "id, status, error_code, title, company, location, source, url, created_at";
const COLUMNS = `${LIST_COLUMNS}, extracted, edited_by_user, version, updated_at`;

function toListItem(row: Row) {
  const parsed = JobListItemSchema.safeParse({
    id: row.id, status: row.status, errorCode: row.error_code,
    title: row.title, company: row.company, location: row.location,
    source: row.source, url: row.url, createdAt: row.created_at,
  });
  if (!parsed.success) throw new Error(`stored job ${row.id} has an unexpected shape`);
  return parsed.data;
}

/** Queries as the signed-in user so RLS applies. */
export function supabaseJobRepo(env: SupabaseEnv, user: AuthUser): JobRepo {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  });
  const findByUrl = async (urlNormalized: string): Promise<string | null> => {
    const { data, error } = await db.from("jobs").select("id").eq("url_normalized", urlNormalized).maybeSingle();
    if (error) throw new Error(`jobs select failed: ${error.message}`);
    return data?.id ?? null;
  };

  return {
    async create({ id, source, url, urlNormalized, rawText, jsonLd }) {
      const { error } = await db.from("jobs").insert({
        id, source, url, url_normalized: urlNormalized, raw_text: rawText, json_ld: jsonLd,
      });
      if (error?.message === "job_limit") {
        throw new ApiError(429, "job_limit", `You can add up to ${JOBS_PER_DAY} jobs per day.`);
      }
      if (error?.code === "23505") {
        const existing = await findByUrl(urlNormalized);
        if (existing) return { id: existing, existing: true };
      }
      if (error) throw new Error(`jobs insert failed: ${error.message}`);
      return { id, existing: false };
    },
    findByUrl,
    async countRunsSince(iso) {
      const { count, error } = await db.from("job_runs").select("id", { count: "exact", head: true }).gte("created_at", iso);
      if (error) throw new Error(`job_runs count failed: ${error.message}`);
      return count ?? 0;
    },
    async list() {
      const { data, error } = await db.from("jobs").select(LIST_COLUMNS).order("created_at", { ascending: false });
      if (error) throw new Error(`jobs select failed: ${error.message}`);
      return (data as Row[]).map(toListItem);
    },
    async get(id) {
      const { data, error } = await db.from("jobs").select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(`jobs select failed: ${error.message}`);
      if (!data) return null;
      const row = data as Row;
      const parsed = JobSchema.safeParse({
        ...toListItem(row), extracted: row.extracted, editedByUser: row.edited_by_user,
        version: row.version, updatedAt: row.updated_at,
      });
      if (!parsed.success) throw new Error(`stored job ${row.id} has an unexpected shape`);
      return parsed.data;
    },
    async patch(id, expectedVersion, extracted) {
      const { data, error } = await db.from("jobs").update({
        extracted, title: extracted.title, company: extracted.company, location: extracted.location,
        edited_by_user: true, version: expectedVersion + 1, updated_at: new Date().toISOString(),
      }).eq("id", id).eq("version", expectedVersion).eq("status", "ready").select("id").maybeSingle();
      if (error) throw new Error(`jobs update failed: ${error.message}`);
      if (data) return "ok";
      const current = await db.from("jobs").select("status").eq("id", id).maybeSingle();
      if (current.error) throw new Error(`jobs select failed: ${current.error.message}`);
      if (!current.data) return "not_found";
      return current.data.status === "ready" ? "conflict" : "wrong_status";
    },
    async remove(id) {
      const { data, error } = await db.from("jobs").delete().eq("id", id).select("id").maybeSingle();
      if (error) throw new Error(`jobs delete failed: ${error.message}`);
      return data !== null;
    },
  };
}

/** Service role access for the worker, following the import admin setup. */
export function supabaseJobAdmin(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">): JobAdmin {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const update = async (id: string, values: Record<string, unknown>) => {
    const { error } = await db.from("jobs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(`jobs update failed: ${error.message}`);
  };

  return {
    async start(id) {
      const { data, error } = await db.from("jobs").select("id, user_id, raw_text, json_ld, status, attempts").eq("id", id).maybeSingle();
      if (error) throw new Error(`jobs select failed: ${error.message}`);
      if (!data || (data.status !== "queued" && data.status !== "processing")) return null;
      const started = await db.from("jobs").update({
        status: "processing", attempts: data.attempts + 1, updated_at: new Date().toISOString(),
      }).eq("id", id).in("status", ["queued", "processing"]).eq("attempts", data.attempts).select("id").maybeSingle();
      if (started.error) throw new Error(`jobs update failed: ${started.error.message}`);
      if (!started.data) return null;
      return { id, userId: data.user_id as string, rawText: (data.raw_text as string | null) ?? "", jsonLd: data.json_ld as Record<string, unknown> | null };
    },
    async finish(id, extracted) {
      await update(id, { status: "ready", extracted, title: extracted.title, company: extracted.company, location: extracted.location, error_code: null });
    },
    async fail(id, code) {
      await update(id, { status: "failed", error_code: code });
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
