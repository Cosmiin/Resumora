import { emptyCv, type CvContent, type HistoryItem } from "@resumora/shared";
import { HISTORY_LIMIT, SNAPSHOT_INTERVAL_MS, type CvRepo, type SaveResult } from "./repo.ts";

type Snapshot = HistoryItem & { content: CvContent };

/** In-memory CvRepo for tests. Mirrors the rules of save_base_cv / restore_base_cv in SQL. */
export function memoryCvRepo(opts: { now?: () => Date } = {}): CvRepo {
  const now = opts.now ?? (() => new Date());
  let row: { content: CvContent; version: number; updatedAt: string } | null = null;
  let history: Snapshot[] = []; // newest first

  function snapshot(content: CvContent, reason: HistoryItem["reason"]) {
    history.unshift({ id: crypto.randomUUID(), reason, createdAt: now().toISOString(), content });
    history = history.slice(0, HISTORY_LIMIT);
  }

  function write(content: CvContent, expectedVersion: number, reason: "autosave" | "restore"): SaveResult {
    const currentVersion = row?.version ?? 0;
    if (currentVersion !== expectedVersion) {
      return { ok: false, version: currentVersion, updatedAt: row?.updatedAt ?? new Date(0).toISOString() };
    }
    if (row) {
      const newest = history[0];
      const due = !newest || now().getTime() - Date.parse(newest.createdAt) >= SNAPSHOT_INTERVAL_MS;
      if (reason === "restore" || due) snapshot(row.content, reason);
    }
    row = { content, version: currentVersion + 1, updatedAt: now().toISOString() };
    return { ok: true, version: row.version, updatedAt: row.updatedAt };
  }

  return {
    async get() {
      return row ? structuredClone(row) : { content: emptyCv(), version: 0, updatedAt: new Date(0).toISOString() };
    },
    async save(content, expectedVersion) {
      return write(structuredClone(content), expectedVersion, "autosave");
    },
    async listHistory() {
      return history.map(({ id, reason, createdAt }) => ({ id, reason, createdAt }));
    },
    async getHistory(id) {
      const found = history.find((s) => s.id === id);
      return found ? { content: structuredClone(found.content), createdAt: found.createdAt } : null;
    },
    async restore(id, expectedVersion) {
      const found = history.find((s) => s.id === id);
      if (!found) return null;
      return write(structuredClone(found.content), expectedVersion, "restore");
    },
    async snapshot(reason) {
      if (row) snapshot(row.content, reason);
    },
  };
}
