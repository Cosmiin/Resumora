export type EnvId = "local" | "hosted";

export interface EnvConfig {
  id: EnvId;
  label: "Local" | "Hosted";
  apiUrl: string;
  webUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  configured: boolean;
}

export function environmentsFrom(
  env: Record<string, string | undefined>,
): Record<EnvId, EnvConfig> {
  const withoutTrailingSlashes = (value: string) => value.replace(/\/+$/, "");
  const apiUrl = withoutTrailingSlashes(env.VITE_HOSTED_API_URL ?? "");
  const webUrl = withoutTrailingSlashes(env.VITE_HOSTED_WEB_URL ?? "");
  const supabaseUrl = withoutTrailingSlashes(env.VITE_HOSTED_SUPABASE_URL ?? "");
  const supabaseKey = env.VITE_HOSTED_SUPABASE_ANON_KEY ?? "";
  const httpsUrl = (value: string) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  };

  return {
    local: {
      id: "local",
      label: "Local",
      apiUrl: "http://127.0.0.1:8788",
      webUrl: "http://127.0.0.1:5173",
      supabaseUrl: withoutTrailingSlashes(
        env.VITE_LOCAL_SUPABASE_URL || "http://127.0.0.1:54321",
      ),
      supabaseKey: env.VITE_LOCAL_SUPABASE_ANON_KEY ?? "",
      configured: Boolean(env.VITE_LOCAL_SUPABASE_ANON_KEY),
    },
    hosted: {
      id: "hosted",
      label: "Hosted",
      apiUrl,
      webUrl,
      supabaseUrl,
      supabaseKey,
      configured: Boolean(supabaseKey) && [apiUrl, webUrl, supabaseUrl].every(httpsUrl),
    },
  };
}
