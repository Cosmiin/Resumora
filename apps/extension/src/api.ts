import { ErrorBodySchema, type CreateJobBody } from "@resumora/shared";

export type ApiOutcome =
  | { kind: "saved"; id: string }
  | { kind: "existing"; id: string }
  | { kind: "unauthorized" }
  | { kind: "failed"; status: number; code: string | null; message: string | null; requestId: string | null }
  | { kind: "network" };

export async function postJob(deps: {
  fetch: typeof fetch;
  apiUrl: string;
  token: string;
  body: CreateJobBody;
  timeoutMs?: number;
}): Promise<ApiOutcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = async (): Promise<ApiOutcome> => {
    const response = await deps.fetch(`${deps.apiUrl.replace(/\/+$/, "")}/v1/jobs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(deps.body),
      signal: controller.signal,
    });
    if (response.status === 401) return { kind: "unauthorized" };
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === "object" && "id" in body && typeof body.id === "string") {
      if (response.status === 202) return { kind: "saved", id: body.id };
      if (response.status === 200 && "existing" in body && body.existing === true) {
        return { kind: "existing", id: body.id };
      }
    }
    const headerId = response.headers.get("x-request-id");
    const errorBody = body && typeof body === "object" && "error" in body
      && body.error && typeof body.error === "object"
      ? { error: { ...body.error, requestId: "requestId" in body.error ? body.error.requestId : headerId } }
      : body;
    const error = ErrorBodySchema.safeParse(errorBody);
    return {
      kind: "failed",
      status: response.status,
      code: error.success ? error.data.error.code : null,
      message: error.success ? error.data.error.message : null,
      requestId: error.success ? error.data.error.requestId : headerId,
    };
  };
  try {
    return await Promise.race([
      request(),
      new Promise<ApiOutcome>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve({ kind: "network" });
        }, deps.timeoutMs ?? 20_000);
      }),
    ]);
  } catch {
    return { kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}
