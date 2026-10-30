import { extractWordText } from "./word-preflight.ts";
import {
  documentFormat,
  documentLimits,
  validatePages,
  type ImportReview,
  type ProcessedDocument,
} from "@resumora/contracts/intelligence/model";
import type { intelligenceOperations } from "./operations.ts";
export type ImportState =
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "not_cv"
  | "uncertain"
  | "failed"
  | "cancelled"
  | "disabled"
  | "unknown";
export type ImportRecord = {
  id: string;
  operationId: string;
  state: ImportState;
  objectKey: string;
  format: "pdf" | "docx" | "doc";
  sourceHash: string;
  expectedRevision: number;
  review: ImportReview | null;
  error: string | null;
};
export interface ImportStore {
  source?(
    importId: string,
  ): Promise<{
    bytes: Uint8Array;
    format: "pdf" | "docx" | "doc";
    sourceHash: string;
  }>;
  begin(input: {
    operationId: string;
    format: string;
    sourceHash: string;
    size: number;
    expectedRevision: number;
  }): Promise<{ created: boolean; record: ImportRecord }>;
  get(operationId: string): Promise<ImportRecord>;
  list(): Promise<ImportRecord[]>;
  expired(): Promise<ImportRecord[]>;
  ackPurge(operationId: string): Promise<void>;
  complete(
    operationId: string,
    state: ImportState,
    review: ImportReview | null,
    error: string | null,
  ): Promise<ImportRecord>;
  cancel(operationId: string): Promise<ImportRecord>;
  putObject(key: string, bytes: Uint8Array): Promise<void>;
  deleteObject(key: string): Promise<void>;
}
export type DocumentProcessor = (input: {
  format: string;
  bytes: Uint8Array;
  signal: AbortSignal;
}) => Promise<ProcessedDocument>;
const publicRecord = (r: ImportRecord) => ({
  id: r.operationId,
  state: r.state,
  format: r.format,
  ...(r.review ? { review: r.review } : {}),
  ...(r.error ? { error: r.error } : {}),
});
const safe = new Set([
  "STORAGE_UPLOAD_REJECTED",
  "WORD_CONVERTER_UNAVAILABLE",
  "PROCESSOR_UNAVAILABLE",
  "PROCESSOR_TIMEOUT",
  "DOCUMENT_TYPE",
  "DOCUMENT_SIZE",
  "DOCUMENT_PAGES",
  "DOCUMENT_ENCRYPTED",
  "DOCUMENT_MALFORMED",
  "DOCUMENT_TEXT_LIMIT",
  "DOCUMENT_PAGE_DIMENSIONS",
  "DOCUMENT_PAGE_TREE",
  "DOCUMENT_COMPLEXITY",
  "DOCUMENT_MALFORMED_OR_ENCRYPTED",
  "AI_UNCONFIGURED",
  "ACTIVE_DOCUMENT_CONTENT",
  "NOT_CV",
  "ADMISSION_UNCERTAIN",
  "AI_DISABLED",
  "OPERATION_REPLAY",
  "CANCELLED",
]);
export function importWorkflow(options: {
  store: ImportStore;
  processor: DocumentProcessor;
  operations: ReturnType<typeof intelligenceOperations>;
  aiEnabled: boolean;
  userId: string;
}) {
  const { store } = options;
  return {
    async start(input: {
      operationId: string;
      format: string;
      bytes: Uint8Array;
      expectedRevision: number;
      signal: AbortSignal;
    }) {
      const format = documentFormat(`upload.${input.format}`, input.bytes);
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            input.bytes as Uint8Array<ArrayBuffer>,
          ),
        ),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      const begun = await store.begin({
        operationId: input.operationId,
        format,
        sourceHash: hash,
        size: input.bytes.length,
        expectedRevision: input.expectedRevision,
      });
      if (!begun.created)
        return publicRecord(await store.get(input.operationId)); // NEVER redispatch on HTTP retry.
      let phase: "upload" | "preflight" | "processing" = "upload";
      try {
        await store.putObject(begun.record.objectKey, input.bytes);
        await store.complete(input.operationId, "uploaded", null, null);
        phase = "preflight";
        const doc = validatePages(
          await options.processor({
            format,
            bytes: input.bytes,
            signal: input.signal,
          }),
        );
        if (
          doc.sha256 !== hash ||
          doc.format !== format ||
          doc.pages.length > documentLimits.pages
        )
          throw new Error("PROCESSOR_OUTPUT");
        if (input.signal.aborted) throw new Error("CANCELLED");
        if (!options.aiEnabled)
          return publicRecord(
            await store.complete(
              input.operationId,
              "disabled",
              null,
              "AI_DISABLED",
            ),
          );
        await store.complete(input.operationId, "processing", null, null);
        phase = "processing";
        const result = await options.operations.extract({
          operationId: input.operationId,
          userId: options.userId,
          document: doc,
          importId: begun.record.id,
        });
        if (input.signal.aborted) throw new Error("CANCELLED");
        if (!result.extraction)
          return publicRecord(
            await store.complete(
              input.operationId,
              result.admission.kind === "not_cv" ? "not_cv" : "uncertain",
              null,
              result.admission.kind === "not_cv"
                ? "NOT_CV"
                : "ADMISSION_UNCERTAIN",
            ),
          );
        const review: ImportReview = {
          id: begun.record.id,
          sourceHash: hash,
          format,
          parserVersion: doc.parserVersion,
          pages: format === "pdf" ? doc.pages.length : null,
          admission: result.admission,
          extraction: result.extraction,
          confirmedIds: [],
        };
        return publicRecord(
          await store.complete(input.operationId, "ready", review, null),
        );
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN";
        // Cancellation is fenced in storage first. Completion cannot overwrite a cancellation/deletion.
        const current = await store.get(input.operationId);
        if (current.state === "cancelled") return publicRecord(current);
        const safeCode = safe.has(code) ? code : phase === "upload" ? "STORAGE_OUTCOME_UNKNOWN" : "PROCESSING_OUTCOME_UNKNOWN";
        console.warn("cv-import-outcome", { phase, state: safe.has(code) ? "failed" : "unknown", code: safeCode });
        return publicRecord(
          await store.complete(
            input.operationId,
            safe.has(code) ? "failed" : "unknown",
            null,
            safeCode,
          ),
        );
      }
    },
    async list() {
      for (const row of await store.expired()) {
        try {
          await store.deleteObject(row.objectKey);
          await store.ackPurge(row.operationId);
        } catch {
          /* Keep purge_pending for bounded idempotent retry. */
        }
      }
      return (await store.list()).map(publicRecord);
    },
    async source(importId: string) {
      if (!store.source) throw new Error("SOURCE_UNAVAILABLE");
      const source = await store.source(importId);
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            source.bytes as Uint8Array<ArrayBuffer>,
          ),
        ),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== source.sourceHash) throw new Error("SOURCE_MISMATCH");
      if (source.format === "pdf") return source;
      return {
        importId,
        format: source.format,
        sourceHash: hash,
        text: extractWordText(source.format, source.bytes),
      };
    },
    async status(operationId: string) {
      return publicRecord(await store.get(operationId));
    },
    async cancel(operationId: string) {
      const row = await store.cancel(operationId); // Fence before attempting nontransactional object deletion.
      await store.deleteObject(row.objectKey);
      await store.ackPurge(operationId);
      return publicRecord(row);
    },
  };
}
