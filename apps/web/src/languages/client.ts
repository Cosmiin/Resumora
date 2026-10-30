import type { AuthTransport } from "../auth/AuthShell";
import type {
  DocumentLanguageContext,
  LanguageProposal,
  LanguageReview,
  LanguageAccepted,
  LanguageVersionInfo,
} from "@resumora/contracts/editor/language-transport";
import type { TranslationSource } from "@resumora/contracts/editor/languages";
import type { BaseDraft } from "../base/model";
export function languageClient(transport: AuthTransport) {
  async function json<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await transport(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      signal,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    const value = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(value?.error?.code ?? "languageUnavailable");
    return value as T;
  }
  return {
    context: (jobId?: string, sourceLocale?: string, signal?: AbortSignal) =>
      json<DocumentLanguageContext>(
        "/v1/document-languages" +
          (jobId
            ? `?jobId=${encodeURIComponent(jobId)}${sourceLocale ? `&sourceLocale=${encodeURIComponent(sourceLocale)}` : ""}`
            : ""),
        undefined,
        signal,
      ),
    start: (
      input: {
        operationId: string;
        source: TranslationSource;
        sourceLocale: string;
        targetLocale: string;
        sectionIds: string[];
        glossary: unknown[];
        expectedTargetRevision: number;
      },
      signal?: AbortSignal,
    ) =>
      json<LanguageProposal>("/v1/document-languages/proposals", input, signal),
    advance: (id: string, signal?: AbortSignal) =>
      json<LanguageProposal>(
        `/v1/document-languages/proposals/${id}/advance`,
        {},
        signal,
      ),
    get: (id: string, signal?: AbortSignal) =>
      json<LanguageProposal>(
        `/v1/document-languages/proposals/${id}`,
        undefined,
        signal,
      ),
    review: (
      id: string,
      expectedRevision: number,
      review: LanguageReview,
      signal?: AbortSignal,
    ) =>
      json<LanguageProposal>(
        `/v1/document-languages/proposals/${id}/review`,
        { expectedRevision, review },
        signal,
      ),
    accept: (
      id: string,
      requestId: string,
      reviewRevision: number,
      signal?: AbortSignal,
    ) =>
      json<LanguageAccepted>(
        `/v1/document-languages/proposals/${id}/accept`,
        { requestId, reviewRevision },
        signal,
      ),
    cancel: (id: string) =>
      json<LanguageProposal>(
        `/v1/document-languages/proposals/${id}/cancel`,
        {},
      ),
    read: (
      version: LanguageVersionInfo,
      jobId?: string,
      signal?: AbortSignal,
    ) =>
      json<{ draft: BaseDraft; revision: number; id: string }>(
        jobId
          ? `/v1/jobs/${jobId}/cv?locale=${version.locale.split("-")[0]}`
          : `/v1/base-cv/languages/${version.variantId}`,
        undefined,
        signal,
      ),
  };
}
export type LanguageClient = ReturnType<typeof languageClient>;
