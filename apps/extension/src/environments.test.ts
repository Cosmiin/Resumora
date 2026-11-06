import { describe, expect, it } from "vitest";
import { environmentsFrom } from "./environments";

const hostedValues = {
  VITE_HOSTED_API_URL: "https://api.example.com/v1///",
  VITE_HOSTED_WEB_URL: "https://app.example.com///",
  VITE_HOSTED_SUPABASE_URL: "https://db.example.com/",
  VITE_HOSTED_SUPABASE_ANON_KEY: "public-hosted-key",
};

describe("environmentsFrom", () => {
  it("defaults to an unconfigured Local environment", () => {
    expect(environmentsFrom({}).local).toEqual({
      id: "local",
      label: "Local",
      apiUrl: "http://127.0.0.1:8788",
      webUrl: "http://127.0.0.1:5173",
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseKey: "",
      configured: false,
    });
    expect(environmentsFrom({}).hosted.configured).toBe(false);
  });

  it("configures Local when its public key is set", () => {
    expect(environmentsFrom({
      VITE_LOCAL_SUPABASE_ANON_KEY: "public-local-key",
      VITE_LOCAL_SUPABASE_URL: "http://localhost:54321///",
    }).local).toMatchObject({
      supabaseUrl: "http://localhost:54321",
      supabaseKey: "public-local-key",
      configured: true,
    });
  });

  it("configures Hosted with all values and removes trailing slashes", () => {
    expect(environmentsFrom(hostedValues).hosted).toEqual({
      id: "hosted",
      label: "Hosted",
      apiUrl: "https://api.example.com/v1",
      webUrl: "https://app.example.com",
      supabaseUrl: "https://db.example.com",
      supabaseKey: "public-hosted-key",
      configured: true,
    });
  });

  it.each(Object.keys(hostedValues))("leaves Hosted unconfigured without %s", (key) => {
    expect(environmentsFrom({ ...hostedValues, [key]: "" }).hosted.configured).toBe(false);
    expect(environmentsFrom({ ...hostedValues, [key]: undefined }).hosted.configured).toBe(false);
  });

  it.each([
    "VITE_HOSTED_API_URL",
    "VITE_HOSTED_WEB_URL",
    "VITE_HOSTED_SUPABASE_URL",
  ])("requires a valid HTTPS URL for %s", (key) => {
    for (const value of ["http://example.com", "not a URL"]) {
      expect(environmentsFrom({ ...hostedValues, [key]: value }).hosted.configured).toBe(false);
    }
  });
});
