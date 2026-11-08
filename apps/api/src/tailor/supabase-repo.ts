import { createClient } from "@supabase/supabase-js";
import { MatchScoreSchema } from "@resumora/shared";
import type { AuthUser, SupabaseEnv } from "../env.ts";
import type { TailorRepo } from "./repo.ts";

/** Queries as the signed-in user so row-level security applies. */
export function supabaseTailorRepo(env: SupabaseEnv, user: AuthUser): TailorRepo {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  });
  return {
    async saveScore(jobId, target, tailoredCvId, score) {
      const { error } = await db.from("match_scores").insert({
        user_id: user.id, job_id: jobId, target, tailored_cv_id: tailoredCvId,
        policy: score.policy, labels: score.labels,
        // The existing table has no capped column; keep the flag with its JSON score parts.
        parts: { ...score.parts, capped: score.capped },
        total: score.total, band: score.band,
      });
      if (error) throw new Error(`match_scores insert failed: ${error.message}`);
    },
    async getScore(jobId, target, tailoredCvId) {
      let query = db.from("match_scores").select("policy, labels, parts, total, band")
        .eq("job_id", jobId).eq("target", target);
      if (tailoredCvId !== undefined) query = query.eq("tailored_cv_id", tailoredCvId);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`match_scores select failed: ${error.message}`);
      if (!data) return null;
      const { capped, ...parts } = data.parts;
      return MatchScoreSchema.parse({ ...data, parts, capped });
    },
  };
}
