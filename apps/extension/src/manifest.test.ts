import { describe, expect, it } from "vitest";
import { environmentsFrom } from "./environments";
import { buildManifest } from "./manifest";

const localValues = { VITE_LOCAL_SUPABASE_ANON_KEY: "public-local-key" };
const hostedValues = {
  VITE_HOSTED_API_URL: "https://api.example.com/v1/",
  VITE_HOSTED_WEB_URL: "https://app.example.com/",
  VITE_HOSTED_SUPABASE_URL: "https://db.example.com/auth/",
  VITE_HOSTED_SUPABASE_ANON_KEY: "public-hosted-key",
};

describe("buildManifest", () => {
  it("permits only configured Local API and Supabase origins", () => {
    expect(buildManifest(environmentsFrom(localValues))).toHaveProperty("host_permissions", [
      "http://127.0.0.1:54321/*",
      "http://127.0.0.1:8788/*",
    ]);
  });

  it("sorts the configured Local and Hosted origins", () => {
    expect(buildManifest(environmentsFrom({ ...localValues, ...hostedValues })))
      .toHaveProperty("host_permissions", [
        "http://127.0.0.1:54321/*",
        "http://127.0.0.1:8788/*",
        "https://api.example.com/*",
        "https://db.example.com/*",
      ]);
  });

  it("deduplicates API and Supabase permissions sharing an origin", () => {
    expect(buildManifest(environmentsFrom({
      ...hostedValues,
      VITE_HOSTED_SUPABASE_URL: "https://api.example.com/auth/",
    }))).toHaveProperty("host_permissions", ["https://api.example.com/*"]);
  });

  it("excludes unconfigured environments without broad or empty permissions", () => {
    expect(buildManifest(environmentsFrom({}))).toHaveProperty("host_permissions", []);
    expect(buildManifest(environmentsFrom({
      ...localValues,
      ...hostedValues,
      VITE_HOSTED_WEB_URL: "",
    }))).toHaveProperty("host_permissions", [
      "http://127.0.0.1:54321/*",
      "http://127.0.0.1:8788/*",
    ]);
  });

  it("uses MV3 with the module worker and only the required permissions", () => {
    const manifest = buildManifest(environmentsFrom(localValues));
    expect(manifest).toMatchObject({
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
    });
    expect(manifest).not.toHaveProperty("content_scripts");
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
  });
});
