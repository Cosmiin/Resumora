import type { RoleResult } from "@resumora/shared";
import { VOICE_TASK } from "../ai/voice-session.ts";
import type { InsightsRepo } from "./repo.ts";

/** Rows of all users, keyed by `userId/roleId`. Shared between repos in a test to show users stay apart. */
export type MemoryInsightsStore = Map<string, { userId: string; result: RoleResult }>;

/** `ai_calls` rows of all users, for counting in tests. */
export type MemoryAiCalls = { userId: string; task: string; status: "ok" | "error"; createdAt: string }[];

/** In-memory InsightsRepo for tests, scoped to one user. */
export function memoryInsightsRepo(userId: string, store: MemoryInsightsStore = new Map(), aiCalls: MemoryAiCalls = []): InsightsRepo {
  const key = (roleId: string) => `${userId}/${roleId}`;
  return {
    async list() {
      return [...store.values()].filter((r) => r.userId === userId).map((r) => structuredClone(r.result));
    },
    async get(roleId) {
      const row = store.get(key(roleId));
      return row ? structuredClone(row.result) : null;
    },
    async put(roleId, result) {
      if (result.roleId !== roleId) throw new Error("result belongs to a different role");
      store.set(key(roleId), { userId, result: structuredClone(result) });
    },
    async remove(roleIds) {
      for (const id of roleIds) store.delete(key(id));
    },
    // No await before the push, so the count and the new row cannot interleave with another call.
    async reserveVoiceSession(_model, limit) {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const used = aiCalls.filter((c) => c.userId === userId && c.task === VOICE_TASK && c.status === "ok" && c.createdAt >= since).length;
      if (used >= limit) return false;
      aiCalls.push({ userId, task: VOICE_TASK, status: "ok", createdAt: new Date().toISOString() });
      return true;
    },
  };
}
