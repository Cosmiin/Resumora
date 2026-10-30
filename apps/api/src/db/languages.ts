import type { LanguageGateway } from "../languages/model.ts";
type Rpc = <T>(
  name: string,
  args: Record<string, unknown>,
  maxBytes?: number,
) => Promise<T>;
export function languageGateway(
  rpc: Rpc,
): Pick<
  LanguageGateway,
  | "languageContext"
  | "loadBaseLanguage"
  | "baseLanguageHistory"
  | "writeBaseLanguage"
  | "languageCommand"
  | "acceptLanguage"
> {
  return {
    languageContext: (jobId) =>
      rpc("document_language_context", { p_job: jobId ?? null }),
    loadBaseLanguage: (variantId, snapshotId) =>
      rpc("load_base_language", {
        p_variant: variantId,
        p_snapshot: snapshotId ?? null,
      }),
    baseLanguageHistory: (variantId, before) =>
      rpc("base_language_history", {
        p_variant: variantId,
        p_before: before ?? null,
      }),
    writeBaseLanguage: (i) =>
      rpc("write_base_language", {
        p_key: i.requestId,
        p_variant: i.variantId,
        p_expected: i.expectedRevision,
        p_payload: i.payload,
        p_restore: i.restore ?? null,
      }),
    languageCommand: (action, id, input = {}, secret) =>
      rpc("language_proposal_command", {
        p_action: action,
        p_id: id,
        p_input: input,
        p_secret: secret ?? null,
      }),
    acceptLanguage: (i) =>
      rpc("accept_language_proposal", {
        p_id: i.operationId,
        p_key: i.requestId,
        p_review_revision: i.reviewRevision,
        p_payload: i.payload,
        p_variant: i.variantId,
      }),
  };
}
