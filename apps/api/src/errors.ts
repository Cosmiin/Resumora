import { ZodError } from "zod";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorBody } from "@resumora/shared";

/** An error we expect and want to show to the client as-is. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type LogFn = (entry: Record<string, unknown>) => void;

export function errorBody(code: string, message: string, requestId: string): ErrorBody {
  return { error: { code, message, requestId } };
}

/**
 * Turns anything thrown by a route into the response the client sees.
 * - ApiError      → its own status / code / message
 * - ZodError      → 400 "invalid_content", message names the first failing path
 * - anything else → 500 "internal" with a generic message, and it is logged
 */
export function toErrorResponse(
  err: unknown,
  ctx: { requestId: string; path: string; log: LogFn },
): { status: ContentfulStatusCode; body: ErrorBody } {
  if (err instanceof ApiError) {
    return { status: err.status, body: errorBody(err.code, err.message, ctx.requestId) };
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return {
      status: 400,
      body: errorBody("invalid_content", `${where}${issue?.message ?? "Invalid content"}`, ctx.requestId),
    };
  }
  ctx.log({
    level: "error",
    requestId: ctx.requestId,
    path: ctx.path,
    error: String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return {
    status: 500,
    body: errorBody("internal", "Something went wrong. Please try again.", ctx.requestId),
  };
}
