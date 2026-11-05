import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { MAX_PENDING, RoleResultSchema, type RoleResult } from "@resumora/shared";
import type { AiCallLog } from "../ai/call-model.ts";
import type { AuthUser, SupabaseEnv } from "../env.ts";
import type { InsightsRepo, PendingEntry } from "./repo.ts";

function clientFor(env: SupabaseEnv, user: AuthUser): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  });
}

/** A stored result that no longer matches the schema, or that names another role, is dropped: it is only a cache. */
function parseResult(value: unknown, roleId: string): RoleResult | null {
  const parsed = RoleResultSchema.safeParse(value);
  return parsed.success && parsed.data.roleId === roleId ? parsed.data : null;
}

const PendingEntrySchema = z.object({ fingerprint: z.string(), result: RoleResultSchema, at: z.iso.datetime() });

function parsePending(value: unknown, roleId: string): PendingEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = PendingEntrySchema.safeParse(entry);
    return parsed.success && parsed.data.result.roleId === roleId && parsed.data.fingerprint === parsed.data.result.fingerprint ? [parsed.data] : [];
  });
}

/** InsightsRepo backed by Supabase, querying as the signed-in user so RLS applies. */
export function supabaseInsightsRepo(env: SupabaseEnv, user: AuthUser): InsightsRepo {
  const db = clientFor(env, user);
  return {
    async list() {
      const { data, error } = await db.from("cv_insights").select("role_id, result");
      if (error) throw new Error(`cv_insights select failed: ${error.message}`);
      return data.flatMap((r) => parseResult(r.result, r.role_id) ?? []);
    },

    async get(roleId) {
      const { data, error } = await db.from("cv_insights").select("role_id, result").eq("role_id", roleId).maybeSingle();
      if (error) throw new Error(`cv_insights select failed: ${error.message}`);
      return data ? parseResult(data.result, data.role_id) : null;
    },

    async put(roleId, result) {
      if (result.roleId !== roleId) throw new Error("result belongs to a different role");
      const { error } = await db.from("cv_insights").upsert(
        {
          user_id: user.id,
          role_id: roleId,
          fingerprint: result.fingerprint,
          policy: result.policy,
          result,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,role_id" },
      );
      if (error) throw new Error(`cv_insights upsert failed: ${error.message}`);
    },

    async pending(roleId) {
      const { data, error } = await db.from("cv_insights").select("pending").eq("role_id", roleId).maybeSingle();
      if (error) throw new Error(`cv_insights select failed: ${error.message}`);
      return data ? parsePending(data.pending, roleId) : [];
    },

    async putPending(roleId, result) {
      const { data, error } = await db.from("cv_insights").select("pending").eq("role_id", roleId).maybeSingle();
      if (error) throw new Error(`cv_insights select failed: ${error.message}`);
      if (!data) return;
      if (result.roleId !== roleId) throw new Error("result belongs to a different role");
      const pending = parsePending(data.pending, roleId).filter((entry) => entry.fingerprint !== result.fingerprint);
      pending.push({ fingerprint: result.fingerprint, result, at: new Date().toISOString() });
      const { error: updateError } = await db.from("cv_insights")
        .update({ pending: pending.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-MAX_PENDING) }).eq("role_id", roleId);
      if (updateError) throw new Error(`cv_insights update failed: ${updateError.message}`);
    },

    async remove(roleIds) {
      if (roleIds.length === 0) return;
      const { error } = await db.from("cv_insights").delete().in("role_id", roleIds);
      if (error) throw new Error(`cv_insights delete failed: ${error.message}`);
    },

    async reserveVoiceSession(model, limit) {
      const { data, error } = await db.rpc("reserve_voice_session", { p_model: model, p_limit: limit });
      if (error) throw new Error(`reserve_voice_session failed: ${error.message}`);
      return data === true;
    },
  };
}

/**
 * Writes one `ai_calls` row from a request handler, as the signed-in user (the database takes
 * the user id from the sign-in, so `entry.userId` is not sent). Throws on failure; callModel
 * catches and logs that.
 */
export function supabaseAiCallLogger(env: SupabaseEnv, user: AuthUser): (entry: AiCallLog) => Promise<void> {
  const db = clientFor(env, user);
  return async (entry) => {
    const { error } = await db.rpc("log_ai_call", {
      p_task: entry.task,
      p_provider: entry.provider,
      p_model: entry.model,
      p_status: entry.status,
      p_error: entry.error ?? null,
      p_duration_ms: entry.durationMs,
      p_input_tokens: entry.inputTokens ?? null,
      p_output_tokens: entry.outputTokens ?? null,
    });
    if (error) throw new Error(`log_ai_call failed: ${error.message}`);
  };
}
