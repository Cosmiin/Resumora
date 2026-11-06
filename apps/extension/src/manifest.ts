import type { EnvConfig, EnvId } from "./environments";

export function buildManifest(envs: Record<EnvId, EnvConfig>): object {
  const origins = Object.values(envs)
    .filter((env) => env.configured)
    .flatMap((env) => [env.apiUrl, env.supabaseUrl])
    .map((url) => new URL(url).origin + "/*");

  return {
    manifest_version: 3,
    name: "Resumora",
    version: "0.1.0",
    description: "Save the job ad you're looking at to Resumora.",
    action: {
      default_popup: "popup.html",
      default_title: "Save this job to Resumora",
    },
    background: { service_worker: "background.js", type: "module" },
    permissions: ["activeTab", "scripting", "storage"],
    host_permissions: [...new Set(origins)].sort(),
  };
}
