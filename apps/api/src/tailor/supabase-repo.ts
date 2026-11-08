import { createClient } from "@supabase/supabase-js";
import { MatchScoreSchema, TailorLanguageSchema, TailorRunSchema, ToneSchema, type MatchScore, type TailorRun } from "@resumora/shared";
import { storedCv } from "../cv/supabase-repo.ts";
import type { AuthUser, Env, SupabaseEnv } from "../env.ts";
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
    async findTailoredCvId(jobId, language) {
      const { data, error } = await db.from("tailored_cvs").select("id").eq("job_id", jobId).eq("language", language).maybeSingle();
      if (error) throw new Error(`tailored_cvs select failed: ${error.message}`);
      return data?.id ?? null;
    },
    async getSteering(tailoredCvId) {
      const { data, error } = await db.from("tailored_cvs").select("language, tone, instruction").eq("id", tailoredCvId).maybeSingle();
      if (error) throw new Error(`tailored_cvs select failed: ${error.message}`);
      return data ? { language: TailorLanguageSchema.parse(data.language), tone: ToneSchema.nullable().parse(data.tone),
        instruction: data.instruction as string | null } : null;
    },
    async createTailoredCv(input) {
      const { data, error } = await db.from("tailored_cvs").insert({
        user_id: user.id, job_id: input.jobId, language: input.language, content: input.content,
        base_snapshot: input.content, base_snapshot_at: input.baseSnapshotAt, tone: input.tone, instruction: input.instruction,
      }).select("id").single();
      if (error?.code === "23505") return "exists";
      if (error) throw new Error(`tailored_cvs insert failed: ${error.message}`);
      return data.id;
    },
    async getTailoredCv(id) {
      const { data, error } = await db.from("tailored_cvs").select("id, job_id, content, review, version").eq("id", id).maybeSingle();
      if (error) throw new Error(`tailored_cvs select failed: ${error.message}`);
      return data ? { id: data.id, jobId: data.job_id, content: storedCv(data.content), review: data.review, version: data.version } : null;
    },
    async saveTailoredCv(id, expectedVersion, changes) {
      const { data, error } = await db.from("tailored_cvs").update({
        content: changes.content, review: changes.review, score: changes.score,
        version: expectedVersion + 1, updated_at: new Date().toISOString(),
      }).eq("id", id).eq("version", expectedVersion).select("id");
      if (error) throw new Error(`tailored_cvs update failed: ${error.message}`);
      return data.length > 0 ? "ok" : "conflict";
    },
    async latestRun(tailoredCvId) {
      const { data, error } = await db.from("tailor_runs").select(RUN_COLUMNS).eq("tailored_cv_id", tailoredCvId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`tailor_runs select failed: ${error.message}`);
      return data ? toRun(data) : null;
    },
    async createRun(input) {
      const { data, error } = await db.from("tailor_runs").insert({
        user_id: user.id, job_id: input.jobId, tailored_cv_id: input.tailoredCvId, kind: input.kind,
        sections: input.sections, status: "running", current_section: input.currentSection,
      }).select(RUN_COLUMNS).single();
      if (error) throw new Error(`tailor_runs insert failed: ${error.message}`);
      return toRun(data);
    },
    async getRun(id) {
      const { data, error } = await db.from("tailor_runs").select(RUN_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(`tailor_runs select failed: ${error.message}`);
      return data ? toRun(data) : null;
    },
    async updateRun(id, changes) {
      const columns: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (changes.questions !== undefined) columns.questions = changes.questions;
      if (changes.answers !== undefined) columns.answers = changes.answers;
      if (changes.proposals !== undefined) columns.proposals = changes.proposals;
      if (changes.status !== undefined) columns.status = changes.status;
      if (changes.currentSection !== undefined) columns.current_section = changes.currentSection;
      if (changes.errorCode !== undefined) columns.error_code = changes.errorCode;
      const { data, error } = await db.from("tailor_runs").update(columns).eq("id", id).select(RUN_COLUMNS).maybeSingle();
      if (error) throw new Error(`tailor_runs update failed: ${error.message}`);
      return data ? toRun(data) : null;
    },
  };
}

const RUN_COLUMNS = "id, user_id, job_id, tailored_cv_id, kind, sections, status, current_section, questions, answers, proposals, error_code, created_at, updated_at";

function toRun(row: Record<string, unknown>): TailorRun {
  return TailorRunSchema.parse({
    id: row.id, userId: row.user_id, jobId: row.job_id, tailoredCvId: row.tailored_cv_id, kind: row.kind,
    sections: row.sections, status: row.status, currentSection: row.current_section, questions: row.questions,
    answers: row.answers, proposals: row.proposals, errorCode: row.error_code, createdAt: row.created_at, updatedAt: row.updated_at,
  });
}

/** Queue-only access to a job owner's current Base CV and base score. */
export function supabaseTailorAdmin(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">) {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async baseCv(userId: string) {
      const { data, error } = await db.from("base_cvs").select("content").eq("user_id", userId).maybeSingle();
      if (error) throw new Error(`base_cvs select failed: ${error.message}`);
      return data ? storedCv(data.content) : null;
    },
    tailorRepo(userId: string) {
      return {
        async getScore(jobId: string) {
          const { data, error } = await db.from("match_scores").select("policy, labels, parts, total, band")
            .eq("user_id", userId).eq("job_id", jobId).eq("target", "base").is("tailored_cv_id", null)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (error) throw new Error(`match_scores select failed: ${error.message}`);
          if (!data) return null;
          const { capped, ...parts } = data.parts;
          return MatchScoreSchema.parse({ ...data, parts, capped });
        },
        async saveScore(jobId: string, score: MatchScore) {
          const { error } = await db.from("match_scores").insert({
            user_id: userId, job_id: jobId, target: "base", tailored_cv_id: null,
            policy: score.policy, labels: score.labels, parts: { ...score.parts, capped: score.capped },
            total: score.total, band: score.band,
          });
          if (error) throw new Error(`match_scores insert failed: ${error.message}`);
        },
      };
    },
  };
}
