import type { RoleResult } from "@resumora/shared";
import type { InsightsRepo } from "./repo.ts";

/** Rows of all users, keyed by `userId/roleId`. Shared between repos in a test to show users stay apart. */
export type MemoryInsightsStore = Map<string, { userId: string; result: RoleResult }>;

/** In-memory InsightsRepo for tests, scoped to one user. */
export function memoryInsightsRepo(userId: string, store: MemoryInsightsStore = new Map()): InsightsRepo {
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
      store.set(key(roleId), { userId, result: structuredClone(result) });
    },
    async remove(roleIds) {
      for (const id of roleIds) store.delete(key(id));
    },
  };
}
