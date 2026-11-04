import { canonicalContentLocale, contentLanguagePolicyVersion, isContentLanguageDecision, type ContentLanguageDecision } from '@resumora/contracts/editor/content-language';
import { skillInventoryPolicy } from "@resumora/contracts/intelligence/skill-keywords";
import { isSkillsImprovementResult, type SkillsImprovementResult } from '@resumora/contracts/intelligence/skills-improvement';
import {
  isImportStatus,
  type ImportStatus,
} from "@resumora/contracts/intelligence/import-status";
export type { ImportStatus } from "@resumora/contracts/intelligence/import-status";
import {
  isExperienceResult,
  type ExperienceRequest,
  type ExperienceResult,
} from "@resumora/contracts/intelligence/experience";
import { equalValues } from "@resumora/contracts/editor/model";
import { sseData } from '@resumora/contracts/intelligence/stream';
import type {
  QuestionPlan,
  RoleRewrite,
} from "@resumora/contracts/intelligence/model";
import type { CvTransport } from "./http-adapter";
export type IntelligenceContext = {
  purpose?: "summary";
  /** Bounded explicit retry for language detection only; uncertain work retains its ID. */
  languageAttempt?: number;
  snapshotId: string;
  revision: number;
  targetId: string;
  operationId: string;
};
export interface IntelligenceClient {
  improveSkills?(context: IntelligenceContext & { fingerprint:string }, recoverOnly?:boolean): Promise<SkillsImprovementResult>;
  detectLanguage?(context: IntelligenceContext, recoverOnly?: boolean): Promise<ContentLanguageDecision>;
  transcribe?(context: IntelligenceContext, audio: Blob, signal: AbortSignal): Promise<string>;
  /** Stable, opaque lifetime of the authenticated transport; contains no account data. */
  sessionIdentity?: object;
  experience?(
    context: IntelligenceContext & { experience: ExperienceRequest },
    recoverOnly?: boolean,
    onDraft?: (text: string) => void,
  ): Promise<ExperienceResult>;
  original?(importId: string, signal?: AbortSignal): Promise<Uint8Array>;
  sourceText?(
    importId: string,
    signal?: AbortSignal,
  ): Promise<import("@resumora/contracts/intelligence/model").WordSourceText>;
  importDocument(
    file: File,
    operationId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<ImportStatus>;
  listImports(): Promise<ImportStatus[]>;
  pendingImport?(signal?: AbortSignal): Promise<ImportStatus | null>;
  importStatus(
    operationId: string,
    signal?: AbortSignal,
  ): Promise<ImportStatus>;
  cancelImport(operationId: string, signal?: AbortSignal): Promise<void>;
  questions(context: IntelligenceContext): Promise<QuestionPlan>;
  rewrite(context: IntelligenceContext): Promise<RoleRewrite>;
}
export class IntelligenceRequestError extends Error {
  constructor(
    public code: string,
    public operationId?: string,
  ) {
    super(code);
  }
}
export function checkedImportStatus(
  value: unknown,
  requireReview = true,
): ImportStatus {
  if (!isImportStatus(value, requireReview))
    throw new IntelligenceRequestError("IMPORT_STATUS_UNAVAILABLE");
  return value;
}
export const uncertainRewriteCodes = new Set([
  "AI_TIMEOUT_UNKNOWN",
  "AI_REQUEST_UNKNOWN",
  "ALREADY_REQUESTED",
  "INTELLIGENCE_UNAVAILABLE",
  "PROVIDER_OUTPUT_UNAVAILABLE",
  "UNAVAILABLE",
]);
const definiteRewriteCodes = new Set([
  "AI_REQUEST_FAILED",
  "AI_OUTPUT_TRUNCATED",
  "AI_OUTPUT_INVALID",
  "AI_PROVIDER_REJECTED",
  "AI_DISABLED",
  "AI_UNCONFIGURED",
  "STALE_INPUT",
  "VERSION_CONFLICT",
  "INVALID_TARGET",
  "INVALID_REQUEST",
  "INVALID_SCOPED_CONTEXT",
  "REWRITE_OUTPUT",
  "OUTPUT_UNSUPPORTED",
  "QUESTION_OUTPUT",
  "QUESTION_REPEATED",
  "CONTENT_LANGUAGE_UNAVAILABLE",
  "CONTENT_LANGUAGE_REQUIRED",
  "CONTENT_LANGUAGE_STALE",
  "CONTENT_LANGUAGE_RETRY_BLOCKED",
]);
export function httpIntelligence(transport: CvTransport): IntelligenceClient {
  // Only request identity is retained, never draft, answer, provider output or credentials.
  const unresolved = new Map<string, string>();
  const prefix = "resumora:rewrite:uncertain:";
  const stored = (key: string) => {
    try {
      return sessionStorage.getItem(prefix + key);
    } catch {
      return null;
    }
  };
  const retain = (key: string, id: string | null) => {
    if (id) unresolved.set(key, id);
    else unresolved.delete(key);
    try {
      if (id) sessionStorage.setItem(prefix + key, id);
      else sessionStorage.removeItem(prefix + key);
    } catch {
      /* In-memory receipt still fences this client. */
    }
  };
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await transport(`/v1/intelligence${path}`, {
      cache: "no-store",
      ...init,
    });
    const value = await response.json().catch(() => null);
    if (!response.ok)
      throw new IntelligenceRequestError(value?.error?.code ?? "UNAVAILABLE");
    return value as T;
  }
  const command = <T>(path: string, input: unknown, signal?: AbortSignal) =>
    request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  const currentLanguageReceipt = (
    operation: import('@resumora/contracts/editor/workspace').CareerOperation,
    context: IntelligenceContext,
  ) => operation.input.snapshotId === context.snapshotId && operation.input.revision === context.revision &&
    operation.input.targetId === context.targetId && typeof operation.input.contentLocale === "string" && operation.input.languagePolicyVersion === contentLanguagePolicyVersion &&
    canonicalContentLocale(operation.input.contentLocale) === operation.input.contentLocale;
  return {
    sessionIdentity: transport,
    improveSkills: async (context, recoverOnly = false) => {
      const validate = (value:unknown) => {
        if (!isSkillsImprovementResult(value) || value.fingerprint !== context.fingerprint)
          throw new IntelligenceRequestError('AI_OUTPUT_INVALID', context.operationId);
        return value;
      };
      const readReceipt = async () => {
        const operation = await request<import('@resumora/contracts/editor/workspace').CareerOperation>(
          `/operations/${encodeURIComponent(context.operationId)}`, {method:'GET',signal:AbortSignal.timeout(10000)});
        if (operation.kind !== 'rewrite' || operation.input.skillsImprovement !== true || operation.input.targetId !== context.targetId || operation.input.fingerprint !== context.fingerprint)
          throw new IntelligenceRequestError('IDEMPOTENCY_BODY_MISMATCH', context.operationId);
        if (operation.state === 'ready') return validate(operation.result);
        throw new IntelligenceRequestError(operation.state === 'failed' ? 'AI_OUTPUT_INVALID' : operation.state === 'processing' ? 'AI_REQUEST_PENDING' : 'AI_RESULT_UNAVAILABLE', context.operationId);
      };
      const delays = [1000, 2000, 4000];
      const recoverable = new Set(['MISSING','ALREADY_REQUESTED','AI_REQUEST_PENDING','AI_RESULT_UNAVAILABLE','AI_REQUEST_UNKNOWN','AI_TIMEOUT_UNKNOWN','INTELLIGENCE_UNAVAILABLE','UNAVAILABLE']);
      let resumeMissing = false, resumed = false;
      for (let attempt = 0; ; attempt++) {
        try {
          if ((!recoverOnly && attempt === 0) || resumeMissing) {
            if (resumeMissing) { resumed = true; resumeMissing = false; }
            return validate(await command('/skills',context,AbortSignal.timeout(185000)));
          }
          return await readReceipt();
        } catch (error) {
          const code = error instanceof IntelligenceRequestError ? error.code : 'AI_REQUEST_UNKNOWN';
          if (!recoverable.has(code) || attempt >= delays.length)
            throw new IntelligenceRequestError(code, context.operationId);
          // Missing receipts may resume the SAME saved request. Unknown/processing
          // receipts only poll, so a transport retry cannot duplicate paid inference.
          resumeMissing = code === 'MISSING' && !resumed && (recoverOnly || attempt > 0);
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        }
      }
    },
    detectLanguage: async (context, recoverOnly = false) => {
      const validate = (value: unknown) => {
        if (!isContentLanguageDecision(value)) throw new IntelligenceRequestError('AI_OUTPUT_INVALID', context.operationId);
        return value;
      };
      try {
        if (!recoverOnly) return validate(await command('/language', context, AbortSignal.timeout(35000)));
        const operation = await request<import('@resumora/contracts/editor/workspace').CareerOperation>(
          `/operations/${encodeURIComponent(context.operationId)}`, { method: 'GET', signal: AbortSignal.timeout(10000) });
        if (operation.kind !== 'rewrite' || operation.input.languageDetection !== true || operation.input.targetId !== context.targetId)
          throw new IntelligenceRequestError('IDEMPOTENCY_BODY_MISMATCH', context.operationId);
        if (operation.state === 'ready') return validate(operation.result);
        throw new IntelligenceRequestError(operation.state === 'failed' ? 'AI_OUTPUT_INVALID' :
          operation.state === 'processing' ? 'AI_REQUEST_PENDING' : 'AI_RESULT_UNAVAILABLE', context.operationId);
      } catch (error) {
        if (error instanceof IntelligenceRequestError) throw error;
        throw new IntelligenceRequestError('AI_REQUEST_UNKNOWN', context.operationId);
      }
    },
    transcribe: async (context, audio, signal) => {
      const value = await request<{ text: string }>("/transcriptions", {
        method: "POST",
        headers: {
          "Content-Type": audio.type,
          "X-Operation-Id": context.operationId,
          "X-Snapshot-Id": context.snapshotId,
          "X-Snapshot-Revision": String(context.revision),
          "X-Target-Id": context.targetId,
        },
        body: audio,
        signal: AbortSignal.any([signal, AbortSignal.timeout(50000)]),
      });
      if (typeof value?.text !== "string" || !value.text.trim() || value.text.length > 12000)
        throw new IntelligenceRequestError("VOICE_OUTPUT_INVALID");
      return value.text;
    },
    experience: async (context, recoverOnly = false, onDraft) => {
      const validate = (value: unknown) => {
        if (
          !isExperienceResult(value) ||
          value.targetId !== context.targetId ||
          value.fingerprint !== context.experience.fingerprint ||
          value.intent !== context.experience.intent ||
          (value.intent === 'preview' && value.candidate !== context.experience.candidate) ||
          ((value.intent === "point" || value.intent === "questions") &&
            !equalValues(value.point, context.experience.point))
        )
          throw new IntelligenceRequestError(
            "AI_OUTPUT_INVALID",
            context.operationId,
          );
        return value;
      };
      if (recoverOnly) {
        const operation = await request<
          import("@resumora/contracts/editor/workspace").CareerOperation
        >(`/operations/${encodeURIComponent(context.operationId)}`, {
          method: "GET",signal:AbortSignal.timeout(10000),
        });
        if (
          operation.kind !==
            (context.experience.intent === "questions"
              ? "questions"
              : "rewrite") ||
          !equalValues(operation.input.experience, context.experience) ||
          operation.input.targetId !== context.targetId
        )
          throw new IntelligenceRequestError(
            "IDEMPOTENCY_BODY_MISMATCH",
            context.operationId,
          );
        if (operation.state === "ready") return validate(operation.result);
        if (operation.state === "failed") {
          const code=(operation.result as {error?:{code?:string}} | null)?.error?.code;
          throw new IntelligenceRequestError(code && definiteRewriteCodes.has(code) ? code : "AI_OUTPUT_INVALID",context.operationId);
        }
        if(operation.state === "unknown") throw new IntelligenceRequestError("AI_RESULT_UNAVAILABLE",context.operationId);
        if(operation.state === "processing") throw new IntelligenceRequestError("AI_REQUEST_PENDING",context.operationId);
        throw new IntelligenceRequestError(
          "AI_REQUEST_UNKNOWN",
          context.operationId,
        );
      }
      // The durable draft owns the request ID. A refresh reads this receipt, never starts a replacement.
      try {
        if (!onDraft) return validate(await command('/experience',context,AbortSignal.timeout(
          context.experience.intent === "skills" ? skillInventoryPolicy.totalMs + 5000 : 45000,
        )));
        const signal = AbortSignal.timeout(45000);
        const response = await transport('/v1/intelligence/experience', { method: 'POST', cache: 'no-store', signal,
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(context) });
        if (!response.headers.get('content-type')?.includes('text/event-stream')) {
          const value = await response.json();
          if (!response.ok) throw new IntelligenceRequestError(value?.error?.code ?? 'AI_REQUEST_UNKNOWN', context.operationId);
          return validate(value);
        }
        let seq = -1, draftText = '';
        for await (const event of sseData(response, 4_000_000, signal)) {
          const value = JSON.parse(event);
          if (value.operationId !== context.operationId || !Number.isSafeInteger(value.seq) || value.seq <= seq)
            throw new IntelligenceRequestError('AI_OUTPUT_INVALID', context.operationId);
          seq = value.seq;
          if (['draft','draft_delta','draft_reset'].includes(value.kind) && typeof value.text === 'string' && value.text.length <= 12000) {
            draftText = value.kind === 'draft_delta' ? draftText + value.text : value.text;
            if (draftText.length > 12000) throw new IntelligenceRequestError('AI_OUTPUT_INVALID', context.operationId);
            try { onDraft(draftText); } catch { /* Display cannot change result recovery. */ }
          } else if (value.kind === 'ready') return validate(value.result);
          else if (value.kind === 'failed' && typeof value.code === 'string') throw new IntelligenceRequestError(value.code, context.operationId);
          else throw new IntelligenceRequestError('AI_OUTPUT_INVALID', context.operationId);
        }
        throw new IntelligenceRequestError('AI_REQUEST_UNKNOWN', context.operationId);
      }
      catch(error){ if(error instanceof IntelligenceRequestError) throw error;throw new IntelligenceRequestError("AI_REQUEST_UNKNOWN",context.operationId); }
    },
    original: async (importId, signal) => {
      const response = await transport(
        `/v1/intelligence/imports/${encodeURIComponent(importId)}/source`,
        { method: "GET", cache: "no-store", signal },
      );
      if (!response.ok)
        throw new IntelligenceRequestError("SOURCE_UNAVAILABLE");
      return new Uint8Array(await response.arrayBuffer());
    },
    sourceText: (importId, signal) =>
      request(`/imports/${encodeURIComponent(importId)}/source`, {
        method: "GET",
        cache: "no-store",
        signal,
      }),
    importDocument: (file, operationId, expectedRevision, signal) =>
      request<ImportStatus>("/imports", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Document-Format": file.name.split(".").at(-1)?.toLowerCase() ?? "",
          "X-Operation-Id": operationId,
          "X-Expected-Revision": String(expectedRevision),
        },
        body: file,
        signal,
      }).then((value) => checkedImportStatus(value)),
    listImports: () =>
      request<unknown>("/imports", { method: "GET" }).then((rows) => {
        if (!Array.isArray(rows))
          throw new IntelligenceRequestError("IMPORT_STATUS_UNAVAILABLE");
        return rows.map((row) => checkedImportStatus(row, false));
      }),
    pendingImport: (signal) =>
      request<ImportStatus | null>("/imports/pending", {
        method: "GET",
        signal,
      }).then((value) =>
        value === null ? null : checkedImportStatus(value, false),
      ),
    importStatus: (operationId, signal) =>
      request<ImportStatus>(`/imports/${encodeURIComponent(operationId)}`, {
        method: "GET",
        signal,
      }).then((value) => checkedImportStatus(value)),
    cancelImport: (operationId, signal) =>
      command<void>(
        `/imports/${encodeURIComponent(operationId)}/cancel`,
        {},
        signal,
      ),
    questions: async (context) => {
      const key = `questions:${context.snapshotId}:${context.revision}:${context.targetId}`;
      const previous = unresolved.get(key) ?? stored(key);
      if (previous) {
        const operation = await request<
          import("@resumora/contracts/editor/workspace").CareerOperation
        >(`/operations/${previous}`, { method: "GET", signal: AbortSignal.timeout(10000) });
        if (operation.state === "ready") {
          retain(key, null);
          if (operation.kind !== 'questions' || !currentLanguageReceipt(operation, context))
            throw new IntelligenceRequestError('CONTENT_LANGUAGE_STALE', previous);
          return operation.result as QuestionPlan;
        }
        if (operation.state === "failed") {
          retain(key, null);
          throw new IntelligenceRequestError("AI_OUTPUT_INVALID", previous);
        }
        throw new IntelligenceRequestError("AI_REQUEST_UNKNOWN", previous);
      }
      retain(key, context.operationId);
      try {
        const plan = await command<QuestionPlan>("/questions", context);
        retain(key, null);
        return plan;
      } catch (error) {
        if (
          error instanceof IntelligenceRequestError &&
          definiteRewriteCodes.has(error.code)
        )
          retain(key, null);
        throw error;
      }
    },
    rewrite: async (context) => {
      const key = `${context.snapshotId}:${context.revision}:${context.targetId}${context.purpose === "summary" ? ":summary" : ""}`;
      const previous = unresolved.get(key) ?? stored(key);
      if (previous) {
        let operation:
          | import("@resumora/contracts/editor/workspace").CareerOperation
          | undefined;
        try {
          operation = await request<
            import("@resumora/contracts/editor/workspace").CareerOperation
          >(`/operations/${previous}`, { method: "GET", signal: AbortSignal.timeout(10000) });
        } catch {
          /* An older unknown request is never replaced by another generation. */
        }
        if (operation?.state === "ready") {
          retain(key, null);
          if (operation.kind !== 'rewrite' || operation.input?.purpose !== context.purpose || !currentLanguageReceipt(operation, context))
            throw new IntelligenceRequestError('CONTENT_LANGUAGE_STALE', previous);
          return operation.result as RoleRewrite;
        }
        if (operation?.state === "failed") {
          retain(key, null);
          throw new IntelligenceRequestError("AI_OUTPUT_INVALID", previous);
        }
        throw new IntelligenceRequestError("AI_REQUEST_UNKNOWN", previous);
      }
      retain(key, context.operationId);
      try {
        const result = await command<RoleRewrite>("/rewrite", context, AbortSignal.timeout(45000));
        if (
          !result ||
          typeof result !== "object" ||
          result.schemaVersion !== "career-role-rewrite/1"
        )
          throw new IntelligenceRequestError("AI_REQUEST_UNKNOWN");
        retain(key, null);
        return result;
      } catch (error) {
        const code =
          error instanceof IntelligenceRequestError
            ? error.code
            : "AI_REQUEST_UNKNOWN";
        if (definiteRewriteCodes.has(code)) retain(key, null);
        throw new IntelligenceRequestError(
          definiteRewriteCodes.has(code) || uncertainRewriteCodes.has(code)
            ? code
            : "AI_REQUEST_UNKNOWN",
          context.operationId,
        );
      }
    },
  };
}
