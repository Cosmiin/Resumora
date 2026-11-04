import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import { saveResponse } from "../cv/routes.ts";
import { ApiError } from "../errors.ts";
import { sniffFormat } from "./extract-text.ts";
import { IMPORTS_PER_DAY, MAX_UPLOAD_BYTES, type ImportMessage, type ImportRepo } from "./repo.ts";

const ApplyBody = z.object({ version: z.number().int().nonnegative() });
const isUuid = (id: string) => z.uuid().safeParse(id).success;
const DAY_MS = 24 * 60 * 60_000;

const unsupported = () => new ApiError(400, "unsupported_file", "Upload your CV as a PDF or Word (.docx) file.");
const tooLarge = () => new ApiError(413, "file_too_large", "This file is too large. The limit is 5 MB.");
const notFound = () => new ApiError(404, "not_found", "That import doesn't exist.");

export function importRoutes(deps: {
  repoFor(c: Context<AppEnv>): ImportRepo;
  queue: { send(message: ImportMessage): Promise<void> };
  now(): Date;
}) {
  const app = new Hono<AppEnv>();

  app.post("/", async (c) => {
    // Multipart adds a little overhead around the file itself.
    if (Number(c.req.header("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) throw tooLarge();
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw unsupported();
    if (file.size > MAX_UPLOAD_BYTES) throw tooLarge();

    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = sniffFormat(bytes);
    if (!format) throw unsupported();

    const repo = deps.repoFor(c);
    const since = new Date(deps.now().getTime() - DAY_MS).toISOString();
    if ((await repo.countSince(since)) >= IMPORTS_PER_DAY) {
      throw new ApiError(429, "import_limit", `You can import up to ${IMPORTS_PER_DAY} CVs per day.`);
    }

    const id = crypto.randomUUID();
    const created = await repo.create({ id, fileName: (file.name || "cv").slice(0, 255), format, bytes });
    await deps.queue.send({ importId: id, userId: c.get("user").id });
    return c.json(created, 202);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const found = isUuid(id) ? await deps.repoFor(c).get(id) : null;
    if (!found) throw notFound();
    return c.json(found);
  });

  app.post("/:id/apply", async (c) => {
    const id = c.req.param("id");
    const { version } = ApplyBody.parse(await c.req.json().catch(() => ({})));
    const repo = deps.repoFor(c);
    const found = isUuid(id) ? await repo.get(id) : null;
    if (!found) throw notFound();
    const notReady = () => new ApiError(409, "import_not_ready", "This import can't be used (it isn't ready, or was already used).");
    if (found.status !== "ready") throw notReady();
    const result = await repo.apply(id, version);
    if (!result) throw notReady(); // applied by another tab in the meantime
    return saveResponse(c, result);
  });

  return app;
}
