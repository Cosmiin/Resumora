import type { RoleResult } from "@resumora/shared";

/** Access to the signed-in user's cached role results (`cv_insights`). A cache: losing it costs only tokens. */
export interface InsightsRepo {
  list(): Promise<RoleResult[]>;
  get(roleId: string): Promise<RoleResult | null>;
  put(roleId: string, result: RoleResult): Promise<void>;
  remove(roleIds: string[]): Promise<void>;
  /**
   * Records one voice session for the user unless `limit` ok sessions already exist in the last
   * 24 hours. Count and record happen as one step, so parallel calls cannot pass the limit together.
   * Returns false when the limit is reached.
   */
  reserveVoiceSession(model: string, limit: number): Promise<boolean>;
}
