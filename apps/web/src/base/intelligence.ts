import type {
  ImportReview,
  QuestionPlan,
  RoleRewrite,
} from "@resumora/contracts/intelligence/model";
import type { CvTransport } from "./http-adapter";
export type IntelligenceContext = {
  snapshotId: string;
  revision: number;
  targetId: string;
  operationId: string;
};
export type ImportStatus = {
  id: string;
  state:
    | "uploading"
    | "unknown"
    | "uploaded"
    | "processing"
    | "ready"
    | "not_cv"
    | "uncertain"
    | "failed"
    | "cancelled"
    | "disabled";
  format?: "pdf" | "docx" | "doc";
  error?: string;
  review?: ImportReview;
};
export interface IntelligenceClient {
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
export const uncertainRewriteCodes = new Set([
  "AI_TIMEOUT_UNKNOWN",
  "AI_REQUEST_UNKNOWN",
  "ALREADY_REQUESTED",
  "INTELLIGENCE_UNAVAILABLE",
  "PROVIDER_OUTPUT_UNAVAILABLE",
  "UNAVAILABLE",
]);
const definiteRewriteCodes = new Set([
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
  return {
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
      }),
    listImports: () => request<ImportStatus[]>("/imports", { method: "GET" }),
    importStatus: (operationId, signal) =>
      request<ImportStatus>(`/imports/${encodeURIComponent(operationId)}`, {
        method: "GET",
        signal,
      }),
    cancelImport: (operationId, signal) =>
      command<void>(
        `/imports/${encodeURIComponent(operationId)}/cancel`,
        {},
        signal,
      ),
    questions: (context) => command<QuestionPlan>("/questions", context),
    rewrite: async (context) => {
      const key = `${context.snapshotId}:${context.revision}:${context.targetId}`;
      const previous = unresolved.get(key) ?? stored(key);
      if (previous)
        throw new IntelligenceRequestError("AI_REQUEST_UNKNOWN", previous);
      retain(key, context.operationId);
      try {
        const result = await command<RoleRewrite>("/rewrite", context);
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
