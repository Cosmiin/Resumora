import type { CvContent, CvResponse, HistoryItem } from "@resumora/shared";

/** Keep at most this many history snapshots per user. */
export const HISTORY_LIMIT = 50;
/** During normal saves, take a snapshot at most this often. */
export const SNAPSHOT_INTERVAL_MS = 10 * 60_000;

/** `ok: false` means the expected version was stale; version/updatedAt are the current ones. */
export type SaveResult = { ok: boolean; version: number; updatedAt: string };

/** Access to the signed-in user's CV. Implementations: memory (tests) and Supabase. */
export interface CvRepo {
  /** Returns an empty CV with version 0 when the user has none yet. */
  get(): Promise<CvResponse>;
  save(content: CvContent, expectedVersion: number): Promise<SaveResult>;
  /** Newest first. */
  listHistory(): Promise<HistoryItem[]>;
  getHistory(id: string): Promise<{ content: CvContent; createdAt: string } | null>;
  /** null when the history id does not exist (for this user). */
  restore(id: string, expectedVersion: number): Promise<SaveResult | null>;
  /** Copies the current saved CV into History (same 50-item limit). Does nothing when the user has no saved CV. */
  snapshot(reason: "ai"): Promise<void>;
}
