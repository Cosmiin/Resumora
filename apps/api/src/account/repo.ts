import type { Preferences, PreferencesPatch } from "@resumora/shared";

/**
 * One stored file. The export carries a download link instead of the bytes: a person can upload any
 * number of photos, and holding them all in memory would exceed what one request may use.
 */
export type ExportedFile = { bucket: string; path: string; downloadUrl: string; linkExpiresAt: string };

/** How long the download links in an export work. */
export const EXPORT_LINK_SECONDS = 3600;

/** What the login itself holds about the person. */
export type ExportedLogin = { email: string | null; createdAt: string | null; details: Record<string, unknown> };

/** Everything stored about one user: table rows as stored, plus their uploaded files. */
export type AccountExport = {
  exportedAt: string;
  userId: string;
  login: ExportedLogin;
  tables: Record<string, unknown[]>;
  files: ExportedFile[];
};

/** The signed-in user's account data, queried as that user so RLS applies. */
export type AccountRepo = {
  getPreferences(): Promise<Preferences>;
  savePreferences(patch: PreferencesPatch): Promise<Preferences>;
  exportAll(now: Date): Promise<AccountExport>;
};

/** Service role access for deleting an account. Only ever called with the signed-in user's own id. */
export type AccountAdmin = {
  /** Removes the user's uploaded files, then the login. Rows in every table go with the login (on delete cascade). */
  deleteUser(userId: string): Promise<void>;
};

/** Tables with a `user_id` column, in the order they appear in the export. */
export const USER_TABLES = [
  "user_preferences",
  "base_cvs",
  "base_cv_versions",
  "cv_imports",
  "cv_insights",
  "jobs",
  "job_runs",
  "tailored_cvs",
  "tailor_runs",
  "match_scores",
  "ai_calls",
] as const;

/** Private buckets where each user's files live under a folder named after their id. */
export const USER_BUCKETS = ["cv-imports", "cv-photos"] as const;
