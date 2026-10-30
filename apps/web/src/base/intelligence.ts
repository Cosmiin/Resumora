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
  constructor(public code: string) {
    super(code);
  }
}
export function httpIntelligence(transport: CvTransport): IntelligenceClient {
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
    rewrite: (context) => command<RoleRewrite>("/rewrite", context),
  };
}
