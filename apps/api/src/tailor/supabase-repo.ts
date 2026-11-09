import { createClient } from "@supabase/supabase-js";
import { MatchScoreSchema, TailoredCvSchema, TailorLanguageSchema, TailorRunSchema, ToneSchema, type MatchScore, type TailorRun } from "@resumora/shared";
import { storedCv } from "../cv/supabase-repo.ts";
import { ApiError } from "../errors.ts";
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
    async listTailoredCvs(jobId) {
      const { data, error } = await db.from("tailored_cvs").select("id, language, translated_from, updated_at")
        .eq("job_id", jobId).order("created_at", { ascending: true });
      if (error) throw new Error(`tailored_cvs select failed: ${error.message}`);
      return data.map((row) => ({ id: row.id, language: TailorLanguageSchema.parse(row.language),
        translatedFrom: row.translated_from, updatedAt: row.updated_at }));
    },
    async readTailoredCv(id) {
      const { data, error } = await db.from("tailored_cvs").select(TAILORED_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(`tailored_cvs select failed: ${error.message}`);
      if (!data) return null;
      return TailoredCvSchema.parse({
        id: data.id, userId: data.user_id, jobId: data.job_id, language: data.language, translatedFrom: data.translated_from,
        content: storedCv(data.content), baseSnapshot: storedCv(data.base_snapshot), baseSnapshotAt: data.base_snapshot_at,
        template: data.template, tone: data.tone, instruction: data.instruction, review: data.review, score: data.score,
        coverLetter: data.cover_letter, version: data.version, createdAt: data.created_at, updatedAt: data.updated_at,
      });
    },
    async saveTailoredContent(id, expectedVersion, content) {
      const updatedAt = new Date().toISOString();
      const { data, error } = await db.from("tailored_cvs").update({ content, version: expectedVersion + 1, updated_at: updatedAt })
        .eq("id", id).eq("version", expectedVersion).select("version, updated_at");
      if (error) throw new Error(`tailored_cvs update failed: ${error.message}`);
      if (data[0]) return { ok: true, version: data[0].version, updatedAt: data[0].updated_at };
      const current = await db.from("tailored_cvs").select("version, updated_at").eq("id", id).maybeSingle();
      if (current.error) throw new Error(`tailored_cvs select failed: ${current.error.message}`);
      return current.data ? { ok: false, version: current.data.version, updatedAt: current.data.updated_at } : null;
    },
    async saveTranslation(input) {
      const fields = {
        translated_from: input.translatedFrom, content: input.content, base_snapshot: input.content, base_snapshot_at: input.at,
        cover_letter: input.coverLetter, template: input.template, tone: input.tone, instruction: input.instruction,
        review: null, score: null, updated_at: input.at,
      };
      // Two tries: a copy created by a concurrent call between the read and the insert is refreshed instead.
      for (let attempt = 0; attempt < 2; attempt++) {
        const found = await db.from("tailored_cvs").select("id, translated_from, version")
          .eq("job_id", input.jobId).eq("language", input.language).maybeSingle();
        if (found.error) throw new Error(`tailored_cvs select failed: ${found.error.message}`);
        if (found.data) {
          if (found.data.translated_from === null) return "language_taken";
          const { data, error } = await db.from("tailored_cvs").update({ ...fields, version: found.data.version + 1 })
            .eq("id", found.data.id).eq("version", found.data.version).select("id");
          if (error) throw new Error(`tailored_cvs update failed: ${error.message}`);
          if (data.length > 0) return found.data.id;
          continue;
        }
        const { data, error } = await db.from("tailored_cvs").insert({
          user_id: user.id, job_id: input.jobId, language: input.language, ...fields, created_at: input.at,
        }).select("id").single();
        if (error?.code === "23505") continue;
        if (error) throw new Error(`tailored_cvs insert failed: ${error.message}`);
        return data.id;
      }
      throw new ApiError(409, "version_conflict", "This copy was changed at the same moment. Try again.");
    },
    async setTemplate(id, template) {
      const { data, error } = await db.from("tailored_cvs").update({ template, updated_at: new Date().toISOString() })
        .eq("id", id).select("id");
      if (error) throw new Error(`tailored_cvs update failed: ${error.message}`);
      return data.length > 0;
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

const TAILORED_COLUMNS = "id, user_id, job_id, language, translated_from, content, base_snapshot, base_snapshot_at, template, tone, instruction, review, score, cover_letter, version, created_at, updated_at";
const RUN_COLUMNS ="id, user_id, job_id, tailored_cv_id, kind, sections, status, current_section, questions, answers, proposals, error_code, created_at, updated_at";

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
