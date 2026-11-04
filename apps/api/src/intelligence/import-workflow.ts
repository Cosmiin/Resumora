import type {
  ImportState,
  ImportStatus,
} from "@resumora/contracts/intelligence/import-status";
export type { ImportState } from "@resumora/contracts/intelligence/import-status";
import {
  createImportTiming,
  type ImportTimingOptions,
} from "@resumora/contracts/intelligence/import-timing";
import { extractWordText } from "./word-preflight.ts";
import {
  documentFormat,
  type ImportReview,
} from "@resumora/contracts/intelligence/model";
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
  stage?: "queued" | "checking" | "extracting";
};
export interface ImportStore {
  pending?(): Promise<ImportRecord | null>;
  enqueue(operationId: string, bytes: Uint8Array): Promise<ImportRecord>;
  source?(importId: string): Promise<{
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
const publicRecord = (r: ImportRecord): ImportStatus => ({
  id: r.operationId,
  state: r.state,
  format: r.format,
  ...(r.stage ? { stage: r.stage } : {}),
  ...(r.review ? { review: r.review } : {}),
  ...(r.error ? { error: r.error } : {}),
});
const safe = new Set(["STORAGE_UPLOAD_REJECTED", "CANCELLED"]);
export function importWorkflow(options: {
  store: ImportStore;
  timing?: ImportTimingOptions;
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
      // Fail closed for a misconfigured adapter; intake never owns processing.
      if (typeof store.enqueue !== "function")
        throw new Error("IMPORT_QUEUE_UNAVAILABLE");
      const timing = createImportTiming(
        "server",
        input.operationId,
        options.timing,
      );
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
      let phase: "upload" | "enqueue" = "upload";
      let phaseDone = timing.span("upload_acknowledgement");
      try {
        await store.putObject(begun.record.objectKey, input.bytes);
        await store.complete(input.operationId, "uploaded", null, null);
        phaseDone();
        phase = "enqueue";
        phaseDone = timing.span("queue_acknowledgement");
        const queued = await store.enqueue(input.operationId, input.bytes);
        phaseDone();
        return publicRecord(queued);
      } catch (error) {
        phaseDone("unknown");
        const code = error instanceof Error ? error.message : "UNKNOWN";
        // Cancellation is fenced in storage first. Completion cannot overwrite a cancellation/deletion.
        const current = await store.get(input.operationId);
        if (current.state === "cancelled") return publicRecord(current);
        if (phase === "enqueue") {
          // The queue RPC may have committed while its response was lost. A worker
          // can already own the task: never overwrite its state or clear its bytes.
          console.warn("cv-import-outcome", {
            phase,
            code: "QUEUE_OUTCOME_UNKNOWN",
          });
          return current.state === "uploaded" && !current.stage
            ? { ...publicRecord(current), error: "QUEUE_OUTCOME_UNKNOWN" }
            : publicRecord(current);
        }
        const safeCode = safe.has(code) ? code : "STORAGE_OUTCOME_UNKNOWN";
        console.warn("cv-import-outcome", {
          phase,
          state: safe.has(code) ? "failed" : "unknown",
          code: safeCode,
        });
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
    async pending() {
      try {
        const row = await store.pending?.();
        return row ? publicRecord(row) : null;
      } catch (error) {
        if ((error as { code?: string })?.code === "ACTIVE_WORKSPACE_REQUIRED")
          return null;
        throw error;
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
      // A refreshed URL may contain the source ID rather than the operation ID.
      const current = await store.get(operationId);
      const row = await store.cancel(current.operationId); // Fence before object deletion.
      try {
        await store.deleteObject(row.objectKey);
        await store.ackPurge(row.operationId);
      } catch {
        // Cancellation is already durable. Existing expired()/list() cleanup retries
        // purge_pending objects without blocking a fresh explicit upload.
        console.warn("cv-import-cleanup", {
          state: "cancelled",
          code: "CLEANUP_PENDING",
        });
      }
      return publicRecord(row);
    },
  };
}
