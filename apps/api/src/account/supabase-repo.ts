import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PREFERENCES, PreferencesSchema, type Preferences } from "@resumora/shared";
import type { AuthUser, Env, SupabaseEnv } from "../env.ts";
import { EXPORT_LINK_SECONDS, USER_BUCKETS, USER_TABLES, type AccountAdmin, type AccountRepo, type ExportedFile } from "./repo.ts";

const PAGE = 1000;
const PREFERENCE_COLUMNS = "display_name, default_template, tailoring_language";

type PreferenceRow = { display_name: string | null; default_template: string; tailoring_language: string };

function toPreferences(row: PreferenceRow | null): Preferences {
  if (!row) return DEFAULT_PREFERENCES;
  return PreferencesSchema.parse({
    displayName: row.display_name,
    defaultTemplate: row.default_template,
    tailoringLanguage: row.tailoring_language,
  });
}

/** Every file path under `<userId>/` in one bucket, including files in subfolders. */
async function listFiles(db: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: PAGE, offset });
    if (error) throw new Error(`${bucket} list failed: ${error.message}`);
    for (const entry of data) {
      const path = `${folder}/${entry.name}`;
      // Storage lists a subfolder as an entry without an id.
      if (entry.id === null) paths.push(...(await listFiles(db, bucket, path)));
      else paths.push(path);
    }
    if (data.length < PAGE) return paths;
  }
}

/** Queries as the signed-in user so RLS applies. */
export function supabaseAccountRepo(env: SupabaseEnv, user: AuthUser): AccountRepo {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  });

  const getPreferences = async (): Promise<Preferences> => {
    const { data, error } = await db.from("user_preferences").select(PREFERENCE_COLUMNS).maybeSingle();
    if (error) throw new Error(`user_preferences select failed: ${error.message}`);
    return toPreferences(data);
  };

  return {
    getPreferences,
    async savePreferences(patch) {
      const values: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
      if (patch.displayName !== undefined) values.display_name = patch.displayName;
      if (patch.defaultTemplate !== undefined) values.default_template = patch.defaultTemplate;
      if (patch.tailoringLanguage !== undefined) values.tailoring_language = patch.tailoringLanguage;
      const { data, error } = await db.from("user_preferences").upsert(values, { onConflict: "user_id" }).select(PREFERENCE_COLUMNS).single();
      if (error) throw new Error(`user_preferences upsert failed: ${error.message}`);
      return toPreferences(data);
    },
    async exportAll(now) {
      const login = await db.auth.getUser(user.token);
      if (login.error) throw new Error(`login export failed: ${login.error.message}`);
      const tables: Record<string, unknown[]> = {};
      for (const table of USER_TABLES) {
        const rows: unknown[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await db.from(table).select("*").eq("user_id", user.id).range(from, from + PAGE - 1);
          if (error) throw new Error(`${table} export failed: ${error.message}`);
          rows.push(...data);
          if (data.length < PAGE) break;
        }
        tables[table] = rows;
      }
      const files: ExportedFile[] = [];
      const linkExpiresAt = new Date(now.getTime() + EXPORT_LINK_SECONDS * 1000).toISOString();
      for (const bucket of USER_BUCKETS) {
        const paths = await listFiles(db, bucket, user.id);
        for (let i = 0; i < paths.length; i += PAGE) {
          const batch = paths.slice(i, i + PAGE);
          const { data, error } = await db.storage.from(bucket).createSignedUrls(batch, EXPORT_LINK_SECONDS);
          if (error) throw new Error(`${bucket} links failed: ${error.message}`);
          // Links come back in the order the paths were sent.
          batch.forEach((path, k) => {
            const link = data[k];
            if (!link || link.error || !link.signedUrl) throw new Error(`${bucket} link failed: ${link?.error ?? "no link"}`);
            files.push({ bucket, path, downloadUrl: link.signedUrl, linkExpiresAt });
          });
        }
      }
      const { email, created_at, user_metadata } = login.data.user;
      return {
        exportedAt: now.toISOString(),
        userId: user.id,
        login: { email: email ?? null, createdAt: created_at ?? null, details: user_metadata ?? {} },
        tables,
        files,
      };
    },
  };
}

/** Service role access for deleting an account, following the import admin setup. */
export function supabaseAccountAdmin(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">): AccountAdmin {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async deleteUser(userId) {
      // Files first: if the login went first and a file removal failed, personal files would be left with no owner.
      for (const bucket of USER_BUCKETS) {
        const paths = await listFiles(db, bucket, userId);
        for (let i = 0; i < paths.length; i += PAGE) {
          const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + PAGE));
          if (error) throw new Error(`${bucket} remove failed: ${error.message}`);
        }
      }
      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) throw new Error(`delete user failed: ${error.message}`);
    },
  };
}
