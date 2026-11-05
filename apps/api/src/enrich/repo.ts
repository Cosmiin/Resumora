import type { RoleResult } from "@resumora/shared";

/** Access to the signed-in user's cached role results (`cv_insights`). A cache: losing it costs only tokens. */
export interface InsightsRepo {
  list(): Promise<RoleResult[]>;
  get(roleId: string): Promise<RoleResult | null>;
  put(roleId: string, result: RoleResult): Promise<void>;
  remove(roleIds: string[]): Promise<void>;
  /** How many of the user's own `ai_calls` rows for `task` were created at or after `sinceIso`. */
  countAiCallsSince(task: string, sinceIso: string): Promise<number>;
}
