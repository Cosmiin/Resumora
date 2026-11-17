import { describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/v1/[[path]].ts";

describe("live site: /v1 requests reach the API Worker", () => {
  it("hands the browser's request to the API unchanged and returns the API's answer", async () => {
    const request = new Request("https://resumora.example/v1/cv", {
      method: "PUT",
      headers: { authorization: "Bearer token-1", "content-type": "application/json" },
      body: "{}",
    });
    const answer = new Response("saved", { status: 201 });
    const api = { fetch: vi.fn().mockResolvedValue(answer) };

    await expect(onRequest({ request, env: { API: api } })).resolves.toBe(answer);
    expect(api.fetch).toHaveBeenCalledExactlyOnceWith(request);
  });
});
