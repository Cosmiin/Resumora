import type { ImportResponse, ImportResult } from "@resumora/shared";
import type { AiCallLog } from "../ai/call-model.ts";
import type { SaveResult } from "../cv/repo.ts";
import type { FileFormat, ImportFailureCode } from "./extract-text.ts";

/** Upload limit, also enforced by the Storage bucket. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const IMPORTS_PER_DAY = 10;

/** The queue message for one import. */
export type ImportMessage = { importId: string; userId: string };

/** Where an import's file lives: `<userId>/<importId>.<pdf|docx>`. */
export function storagePath(userId: string, importId: string, format: FileFormat): string {
  return `${userId}/${importId}.${format}`;
}
export function formatOf(path: string): FileFormat {
  return path.endsWith(".docx") ? "docx" : "pdf";
}

/** The signed-in user's imports (as the user, so RLS applies). */
export interface ImportRepo {
  /** Uploads the file, then records the import as queued. */
  create(input: { id: string; fileName: string; format: FileFormat; bytes: Uint8Array }): Promise<ImportResponse>;
  /** null when it doesn't exist for this user. */
  get(id: string): Promise<ImportResponse | null>;
  /** Imports created since `iso`, for the daily limit. */
  countSince(iso: string): Promise<number>;
  /** null when the import isn't this user's or isn't ready. */
  apply(id: string, expectedVersion: number): Promise<SaveResult | null>;
}

export type ImportJob = { id: string; userId: string; storagePath: string };

/** What the queue consumer needs. Uses the service role: it is never given to request handlers. */
export interface ImportAdmin {
  /** Marks the import processing and counts the attempt. null if it's missing or already finished. */
  start(id: string): Promise<ImportJob | null>;
  download(job: ImportJob): Promise<Uint8Array>;
  finish(id: string, result: ImportResult): Promise<void>;
  fail(id: string, code: ImportFailureCode): Promise<void>;
  deleteFile(job: ImportJob): Promise<void>;
  logCall(entry: AiCallLog): Promise<void>;
}
