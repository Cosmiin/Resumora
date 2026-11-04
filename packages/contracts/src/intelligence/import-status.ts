import { isImportReview, type ImportReview } from "./model.ts";
const states = [
  "uploading",
  "uploaded",
  "processing",
  "ready",
  "not_cv",
  "uncertain",
  "failed",
  "cancelled",
  "disabled",
  "unknown",
] as const;
export type ImportState = (typeof states)[number];
/** Public receipt only. Storage paths, queue payloads, leases and owners stay private. */
export type ImportStatus = {
  id: string;
  state: ImportState;
  format?: "pdf" | "docx" | "doc";
  stage?: "queued" | "checking" | "extracting";
  error?: string;
  review?: ImportReview;
};
/** Lists/pending discovery may return ready metadata; opening a review requires its body. */
export function isImportStatus(
  value: unknown,
  requireReview = false,
): value is ImportStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).every((key) =>
      ["id", "state", "format", "stage", "error", "review"].includes(key),
    ) &&
    typeof v.id === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(v.id) &&
    states.includes(v.state as ImportState) &&
    (v.format === undefined ||
      ["pdf", "docx", "doc"].includes(v.format as string)) &&
    (v.stage === undefined ||
      ["queued", "checking", "extracting"].includes(v.stage as string)) &&
    (v.error === undefined ||
      (typeof v.error === "string" && /^[A-Z0-9_]{1,100}$/.test(v.error))) &&
    (v.review === undefined
      ? !(requireReview && v.state === "ready")
      : isImportReview(v.review))
  );
}
