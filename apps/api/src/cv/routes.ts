import { Hono, type Context } from "hono";
import { z } from "zod";
import { CvContentSchema, MAX_CV_BYTES } from "@resumora/shared";
import type { AppEnv } from "../app.ts";
import { ApiError, errorBody } from "../errors.ts";
import type { CvRepo, SaveResult } from "./repo.ts";

const SaveBody = z.object({ content: CvContentSchema, version: z.number().int().nonnegative() });
const RestoreBody = z.object({ version: z.number().int().nonnegative() });

/** Reads a JSON body, enforcing the size limit before parsing. */
async function readJson(c: Context<AppEnv>): Promise<unknown> {
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > MAX_CV_BYTES) throw tooLarge();
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > MAX_CV_BYTES) throw tooLarge();
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
  }
}

function tooLarge() {
  return new ApiError(413, "content_too_large", "This CV is too large to save (limit 256 KB).");
}

export function saveResponse(c: Context<AppEnv>, result: SaveResult) {
  if (result.ok) return c.json({ version: result.version, updatedAt: result.updatedAt });
  return c.json(
    {
      ...errorBody("version_conflict", "This CV was saved somewhere else first.", c.get("requestId")),
      current: { version: result.version, updatedAt: result.updatedAt },
    },
    409,
  );
}

export function cvRoutes(repoFor: (c: Context<AppEnv>) => CvRepo) {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => c.json(await repoFor(c).get()));

  app.put("/", async (c) => {
    const { content, version } = SaveBody.parse(await readJson(c));
    return saveResponse(c, await repoFor(c).save(content, version));
  });

  app.get("/history", async (c) => c.json({ items: await repoFor(c).listHistory() }));

  app.get("/history/:id", async (c) => {
    const found = await repoFor(c).getHistory(c.req.param("id"));
    if (!found) throw new ApiError(404, "not_found", "That version no longer exists.");
    return c.json(found);
  });

  app.post("/history/:id/restore", async (c) => {
    const { version } = RestoreBody.parse(await readJson(c));
    const result = await repoFor(c).restore(c.req.param("id"), version);
    if (!result) throw new ApiError(404, "not_found", "That version no longer exists.");
    return saveResponse(c, result);
  });

  return app;
}
