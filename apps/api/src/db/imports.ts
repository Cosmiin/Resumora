import type {
  ImportRecord,
  ImportState,
  ImportStore,
} from "../intelligence/import-workflow.ts";
import type { ImportReview } from "@resumora/contracts/intelligence/model";
import type {
  DraftSnapshot,
  EditorWireEnvelope,
} from "@resumora/contracts/editor/transport";
type Rpc = <T>(
  name: string,
  args: Record<string, unknown>,
  maxBytes?: number,
) => Promise<T>;
export function importGateway(
  rpc: Rpc,
  storage: (key: string, bytes?: Uint8Array) => Promise<void>,
  readOriginal: (key: string) => Promise<Uint8Array>,
) {
  return {
    createImportStore(
      secret: string,
    ): ImportStore & { list(): Promise<ImportRecord[]> } {
      return {
        source: async (importId) => {
          const row = await rpc<ImportRecord>("get_cv_import_source", {
            p_source: importId,
          });
          return {
            bytes: await readOriginal(row.objectKey),
            format: row.format,
            sourceHash: row.sourceHash,
          };
        },
        begin: (input) =>
          rpc("begin_cv_import", {
            p_operation: input.operationId,
            p_format: input.format,
            p_hash: input.sourceHash,
            p_size: input.size,
            p_revision: input.expectedRevision,
          }),
        get: (operationId) =>
          rpc<ImportRecord>("get_cv_import", { p_operation: operationId }),
        list: () => rpc<ImportRecord[]>("list_cv_imports", {}),
        expired: () =>
          secret.length >= 32
            ? rpc<ImportRecord[]>("expired_cv_import_objects", {})
            : Promise.resolve([]),
        ackPurge: (operationId) =>
          rpc("ack_cv_import_purge", {
            p_operation: operationId,
            p_secret: secret,
          }).then(() => {}),
        complete: (
          operationId: string,
          state: ImportState,
          review: ImportReview | null,
          error: string | null,
        ) =>
          rpc<ImportRecord>("complete_cv_import", {
            p_operation: operationId,
            p_state: state,
            p_review: review,
            p_error: error,
            p_secret: secret,
          }),
        cancel: (operationId) =>
          rpc<ImportRecord>("cancel_cv_import", { p_operation: operationId }),
        putObject: (key, bytes) => storage(key, bytes),
        deleteObject: (key) => storage(key),
      };
    },
    reserveDocumentOperation: (input: {
      operationId: string;
      importId: string;
      stage: string;
      policy: string;
      secret: string;
    }) =>
      rpc<{ created: boolean }>("reserve_document_operation", {
        p_operation: input.operationId,
        p_import: input.importId,
        p_stage: input.stage,
        p_policy: input.policy,
        p_secret: input.secret,
      }),
    saveReviewedImport: (input: {
      requestId: string;
      expectedRevision: number;
      payload: EditorWireEnvelope;
      importId: string;
      selected: string[];
    }) =>
      rpc<DraftSnapshot>("save_import_review_draft", {
        p_key: input.requestId,
        p_expected_revision: input.expectedRevision,
        p_payload: input.payload,
        p_import: input.importId,
        p_selected: input.selected,
      }),
  };
}
