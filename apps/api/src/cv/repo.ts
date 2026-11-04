import type { CvContent, CvResponse, HistoryItem } from "@resumora/shared";

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
  restore(id: string, expectedVersion: number): Promise<SaveResult>;
}
