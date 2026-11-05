import { describe, expect, it, vi } from "vitest";
import { ErrorBodySchema } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "good" ? { id: "user-1", token } : null),
    cvRepo: () => {
      throw new Error("cv repo not used in these tests");
    },
    importRepo: () => {
      throw new Error("import repo not used in these tests");
    },
    insightsRepo: () => {
      throw new Error("not used");
    },
    model: () => {
      throw new Error("not used");
    },
    queue: { send: async () => {} },
    log: vi.fn(),
    ...overrides,
  };
}

describe("app", () => {
  it("health is public", async () => {
    const res = await createApp(deps()).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("v1 requires a token", async () => {
    const res = await createApp(deps()).request("/v1/cv");
    expect(res.status).toBe(401);
    const body = ErrorBodySchema.parse(await res.json());
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
  });

  it("invalid token is rejected", async () => {
    const res = await createApp(deps()).request("/v1/cv", {
      headers: { authorization: "Bearer bad" },
    });
    expect(res.status).toBe(401);
  });

  it("unexpected errors are logged", async () => {
    const log = vi.fn();
    const app = createApp(deps({ log }));
    app.get("/v1/boom", () => {
      throw new Error("boom");
    });
    const res = await app.request("/v1/boom", { headers: { authorization: "Bearer good" } });
    expect(res.status).toBe(500);
    const body = ErrorBodySchema.parse(await res.json());
    expect(body.error.code).toBe("internal");
    expect(body.error.message).not.toContain("boom");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatchObject({
      level: "error",
      requestId: body.error.requestId,
      path: "/v1/boom",
      error: "Error: boom",
    });
  });

  it("allows the app origin for CORS", async () => {
    const res = await createApp(deps()).request("/health", {
      headers: { origin: "http://127.0.0.1:5173" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    const other = await createApp(deps()).request("/health", {
      headers: { origin: "https://evil.example" },
    });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});
