import { Hono, type Context } from "hono";
import { PreferencesPatchSchema } from "@resumora/shared";
import type { AppEnv } from "../app.ts";
import type { AccountAdmin, AccountRepo } from "./repo.ts";

/** The signed-in user's own account: preferences, a copy of all their data, and deleting the account. */
export function accountRoutes(deps: { repoFor(c: Context<AppEnv>): AccountRepo; admin(): AccountAdmin; now(): Date }) {
  const app = new Hono<AppEnv>();

  app.get("/preferences", async (c) => c.json(await deps.repoFor(c).getPreferences()));

  app.patch("/preferences", async (c) => {
    const patch = PreferencesPatchSchema.parse(await c.req.json().catch(() => ({})));
    return c.json(await deps.repoFor(c).savePreferences(patch));
  });

  app.get("/export", async (c) => {
    const now = deps.now();
    const data = await deps.repoFor(c).exportAll(now);
    c.header("content-disposition", `attachment; filename="resumora-data-${now.toISOString().slice(0, 10)}.json"`);
    c.header("cache-control", "no-store");
    return c.json(data);
  });

  // The id comes from the verified token, never from the request, so a user can only delete themselves.
  app.delete("/", async (c) => {
    await deps.admin().deleteUser(c.get("user").id);
    return c.body(null, 204);
  });

  return app;
}
