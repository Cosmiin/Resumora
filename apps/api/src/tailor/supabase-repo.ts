import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  MatchScoreSchema, SteeringSchema, TailoredCvSchema, TailorLanguageSchema, TailorRunSchema, ToneSchema, type MatchScore, type TailorRun,
} from "@resumora/shared";
import { storedCv } from "../cv/supabase-repo.ts";
import { ApiError } from "../errors.ts";
import type { AuthUser, Env, SupabaseEnv } from "../env.ts";
import { sameCv, TAILORING_KINDS, type TailorRepo } from "./repo.ts";
import { withColumns } from "./steering.ts";

const ToneExamplesSchema = z.object({ bullet: z.string(), examples: z.record(ToneSchema, z.string()) });

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
        // Keep score metadata with the existing JSON parts, without adding columns.
        parts: { ...score.parts, capped: score.capped, cappedBy: score.cappedBy, requirementTexts: score.requirementTexts },
        total: score.total, band: score.band,
      });
      if (error) throw new Error(`match_scores insert failed: ${error.message}`);
      if (target !== "tailored" || !tailoredCvId) return;
      const copy = await db.from("tailored_cvs").update({ score, score_stale: false }).eq("id", tailoredCvId);
      if (copy.error) throw new Error(`tailored_cvs update failed: ${copy.error.message}`);
    },
    async scoreCopies(jobId) {
      const { data, error } = await db.from("tailored_cvs").select("id, score, score_stale")
        .eq("job_id", jobId).order("updated_at", { ascending: false });
      if (error) throw new Error(`tailored_cvs select failed: ${error.message}`);
      return data.map((row) => ({ id: row.id, score: MatchScoreSchema.nullable().parse(row.score), scoreStale: row.score_stale === true }));
    },
    async hasTailoredCv(jobId) {
      const { data, error } = await db.from("tailor_runs").select("id")
        .eq("job_id", jobId).eq("status", "done").in("kind", TAILORING_KINDS).limit(1);
      if (error) throw new Error(`tailor_runs select failed: ${error.message}`);
      return data.length > 0;
    },
    async getScore(jobId, target, tailoredCvId) {
      let query = db.from("match_scores").select("policy, labels, parts, total, band")
        .eq("job_id", jobId).eq("target", target);
      if (tailoredCvId !== undefined) query = query.eq("tailored_cv_id", tailoredCvId);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`match_scores select failed: ${error.message}`);
      if (!data) return null;
      const { capped, cappedBy, requirementTexts, ...parts } = data.parts;
      return MatchScoreSchema.parse({ ...data, parts, capped, cappedBy, requirementTexts });
    },
    async findTailoredCvId(jobId, language) {
      const { data, error } = await db.from("tailored_cvs").select("id").eq("job_id", jobId).eq("language", language).maybeSingle();
      if (error) throw new Error(`tailored_cvs select failed: ${error.message}`);
      return data?.id ?? null;
    },
    async getSteering(tailoredCvId) {
      const { data, error } = await db.from("tailored_cvs").select("language, tone, instruction, steering").eq("id", tailoredCvId).maybeSingle();
      if (error) throw new Error(`tailored_cvs select failed: ${error.message}`);
      if (!data) return null;
      const tone = ToneSchema.nullable().parse(data.tone);
      const instruction = data.instruction as string | null;
      const stored = SteeringSchema.safeParse(data.steering);
      return { language: TailorLanguageSchema.parse(data.language), tone, instruction,
        steering: withColumns(stored.success ? stored.data : {}, tone, instruction) };
    },
    async setSteering(tailoredCvId, steering) {
      const { data, error } = await db.from("tailored_cvs")
        .update({ tone: steering.tone ?? "neutral", instruction: steering.instruction ?? null, steering })
        .eq("id", tailoredCvId).select("id");
      if (error) throw new Error(`tailored_cvs update failed: ${error.message}`);
      return (data ?? []).length > 0;
    },
    async createTailoredCv(input) {
      const { data, error } = await db.from("tailored_cvs").insert({
        user_id: user.id, job_id: input.jobId, language: input.language, content: input.content,
        base_snapshot: input.content, base_snapshot_at: input.baseSnapshotAt, tone: input.tone, instruction: input.instruction,
        steering: input.steering, template: input.template ?? "classic",
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
    async listAllTailoredCvs() {
      // One query: each CV with only its newest run, so the list never depends on how many runs or CVs there are.
      const { data, error } = await db.from("tailored_cvs")
        .select("id, job_id, language, template, translated_from, updated_at, tailor_runs(status, created_at)")
        .order("updated_at", { ascending: false })
        .order("created_at", { referencedTable: "tailor_runs", ascending: false })
        .limit(1, { referencedTable: "tailor_runs" });
      if (error) throw new Error(`tailored_cvs select failed: ${error.message}`);
      return data.map((row) => {
        const newest = (row.tailor_runs as { status: string }[] | null)?.[0];
        return { id: row.id, jobId: row.job_id, language: TailorLanguageSchema.parse(row.language),
          template: TailoredCvSchema.shape.template.parse(row.template), translatedFrom: row.translated_from, updatedAt: row.updated_at,
          inProgress: !!newest && newest.status !== "done" };
      });
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
      // A hand edit makes the score out of date; saving the same content again doesn't.
      const before = await db.from("tailored_cvs").select("content").eq("id", id).maybeSingle();
      if (before.error) throw new Error(`tailored_cvs select failed: ${before.error.message}`);
      const edited = !!before.data && !sameCv(before.data.content, content);
      const { data, error } = await db.from("tailored_cvs")
        .update({ content, version: expectedVersion + 1, updated_at: updatedAt, ...(edited ? { score_stale: true } : {}) })
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
        // The new wording has no score yet, whatever the copy's score history says.
        review: null, score: null, score_stale: true, updated_at: input.at,
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
    async setCoverLetter(id, letter) {
      const { data, error } = await db.from("tailored_cvs").update({ cover_letter: letter, updated_at: new Date().toISOString() })
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
        role_order: input.roleOrder ?? [], current_role_id: input.currentRoleId !== undefined ? input.currentRoleId : input.roleOrder?.[0] ?? null,
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
      if (changes.currentRoleId !== undefined) columns.current_role_id = changes.currentRoleId;
      if (changes.errorCode !== undefined) columns.error_code = changes.errorCode;
      const { data, error } = await db.from("tailor_runs").update(columns).eq("id", id).select(RUN_COLUMNS).maybeSingle();
      if (error) throw new Error(`tailor_runs update failed: ${error.message}`);
      return data ? toRun(data) : null;
    },
    async getToneExamples(jobId) {
      const { data, error } = await db.from("jobs").select("tone_examples").eq("id", jobId).maybeSingle();
      if (error) throw new Error(`jobs select failed: ${error.message}`);
      const parsed = ToneExamplesSchema.safeParse(data?.tone_examples);
      return parsed.success ? parsed.data : null;
    },
    async saveToneExamples(jobId, examples) {
      const { error } = await db.from("jobs").update({ tone_examples: examples }).eq("id", jobId);
      if (error) throw new Error(`jobs update failed: ${error.message}`);
    },
  };
}

const TAILORED_COLUMNS = "id, user_id, job_id, language, translated_from, content, base_snapshot, base_snapshot_at, template, tone, instruction, review, score, cover_letter, version, created_at, updated_at";
const RUN_COLUMNS ="id, user_id, job_id, tailored_cv_id, kind, sections, status, current_section, role_order, current_role_id, questions, answers, proposals, error_code, created_at, updated_at";

function toRun(row: Record<string, unknown>): TailorRun {
  return TailorRunSchema.parse({
    id: row.id, userId: row.user_id, jobId: row.job_id, tailoredCvId: row.tailored_cv_id, kind: row.kind,
    sections: row.sections, status: row.status, currentSection: row.current_section, questions: row.questions,
    answers: row.answers, proposals: row.proposals, errorCode: row.error_code,
    roleOrder: row.role_order ?? [], currentRoleId: row.current_role_id ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
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
          const { capped, cappedBy, requirementTexts, ...parts } = data.parts;
          return MatchScoreSchema.parse({ ...data, parts, capped, cappedBy, requirementTexts });
        },
        async saveScore(jobId: string, score: MatchScore) {
          const { error } = await db.from("match_scores").insert({
            user_id: userId, job_id: jobId, target: "base", tailored_cv_id: null,
            policy: score.policy, labels: score.labels,
            parts: { ...score.parts, capped: score.capped, cappedBy: score.cappedBy, requirementTexts: score.requirementTexts },
            total: score.total, band: score.band,
          });
          if (error) throw new Error(`match_scores insert failed: ${error.message}`);
        },
      };
    },
  };
}
