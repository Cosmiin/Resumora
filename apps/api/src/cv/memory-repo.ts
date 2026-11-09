import { MAX_CV_BYTES, MAX_JOB_NOTES, emptyCv, type CvContent, type HistoryItem } from "@resumora/shared";
import { ApiError } from "../errors.ts";
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
    async addJobNotes(roleId, notes) {
      if (!row) throw new Error("role_not_found");
      const content = structuredClone(row.content);
      // Same sections as the add_job_notes function: roles, projects and volunteering.
      const role = [...content.experience, ...content.projects, ...content.volunteering].find((item) => item.id === roleId);
      if (!role) throw new Error("role_not_found");
      const all = [...role.notes, ...structuredClone(notes)];
      const newest = new Set(all.map((note, index) => ({ note, index }))
        .filter(({ note }) => note.jobId !== undefined)
        .sort((a, b) => Date.parse(b.note.askedAt) - Date.parse(a.note.askedAt) || b.index - a.index)
        .slice(0, MAX_JOB_NOTES).map(({ note }) => note));
      role.notes = all.filter((note) => note.jobId === undefined || newest.has(note));
      const version = row.version + 1;
      if (new TextEncoder().encode(JSON.stringify({ content, version })).length > MAX_CV_BYTES) {
        throw new ApiError(413, "content_too_large", "This CV is too large to save (limit 256 KB).");
      }
      row = { content, version, updatedAt: now().toISOString() };
      return { version: row.version, updatedAt: row.updatedAt };
    },
    async listHistory() {
      return history.map(({ id, reason, createdAt }) => ({ id, reason, createdAt }));
    },
    async getHistory(id) {
      const found = history.find((s) => s.id === id);
      return found ? { content: structuredClone(found.content), createdAt: found.createdAt } : null;
    },
    async restore(id, expectedVersion, content) {
      const found = history.find((s) => s.id === id);
      if (!found) return null;
      return write(structuredClone(content), expectedVersion, "restore");
    },
    async snapshot(reason) {
      if (row) snapshot(row.content, reason);
    },
  };
}
