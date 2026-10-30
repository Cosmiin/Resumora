import { AdapterError, type BaseCvAdapter, type Snapshot } from "./adapter";
import type {
  BaseLifecycle,
  BaseRemoval,
} from "@resumora/contracts/editor/transport";

export type CvTransport = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

// The authenticated shell supplies transport. No identity, token or CV cache is
// retained here; remount the shell's App on account/session changes.
export class HttpBaseCvAdapter implements BaseCvAdapter {
  readonly capability = "durable" as const;
  private state: BaseLifecycle = {
    generation: 0,
    revision: 0,
    cleanupPending: false,
  };
  lifecycle() {
    return { ...this.state };
  }
  constructor(
    private readonly transport: CvTransport = (path, init) =>
      fetch(path, { ...init, credentials: "same-origin", cache: "no-store" }),
    private readonly prefix = "/v1/base-cv",
  ) {}

  async request<T>(path: string, input?: unknown): Promise<T> {
    const response = await this.transport(`${this.prefix}${path}`, {
      method: input === undefined ? "GET" : "POST",
      cache: "no-store",
      ...(input === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { code?: string; issues?: AdapterError["issues"] };
      } | null;
      const code = body?.error?.code;
      if (response.status === 409 && code === "preservationRequired")
        throw new AdapterError("preservationRequired");
      if (response.status === 410) throw new AdapterError("expired");
      if (
        (response.status === 422 && code === "validation") ||
        (response.status === 409 &&
          (code === "conflict" || code === "requestMismatch")) ||
        (response.status === 404 && code === "missing")
      )
        throw new AdapterError(code, body?.error?.issues ?? []);
      if (response.status === 401 || response.status === 403)
        throw new AdapterError(
          response.status === 401 ? "unauthenticated" : "forbidden",
        );
      if ([400, 404, 405, 413, 415, 422].includes(response.status))
        throw new AdapterError("rejected");
      throw new Error("cvRequestFailed");
    }
    if (path === "" && this.prefix === "/v1/base-cv") {
      const generation = response.headers.get("X-Base-Generation"),
        revision = response.headers.get("X-Base-Revision");
      if (generation !== null || revision !== null) {
        if (
          generation === null ||
          revision === null ||
          !/^\d+$/.test(generation) ||
          !/^\d+$/.test(revision) ||
          !Number.isSafeInteger(Number(generation)) ||
          !Number.isSafeInteger(Number(revision))
        )
          throw new Error("invalidBaseLifecycle");
        if (
          Number(generation) < this.state.generation ||
          Number(revision) < this.state.revision
        )
          throw new AdapterError("expired");
        this.state = {
          generation: Number(generation),
          revision: Number(revision),
          cleanupPending:
            response.headers.get("X-Base-Cleanup-Pending") === "true",
        };
      }
    }
    return (await response.json()) as T;
  }
  async load() {
    const snapshot = await this.request<Snapshot | null>("");
    if (snapshot) this.state.revision = snapshot.revision;
    return snapshot;
  }
  async remove(input: {
    requestId: string;
    expectedRevision: number;
    expectedGeneration: number;
  }): Promise<BaseRemoval> {
    const result = await this.request<BaseRemoval>("/remove", input);
    if (
      result.removed !== true ||
      !Number.isSafeInteger(result.generation) ||
      result.generation < 1 ||
      !Number.isSafeInteger(result.revision) ||
      result.revision < 1 ||
      typeof result.cleanupPending !== "boolean"
    )
      throw new Error("invalidBaseRemoval");
    this.state = {
      generation: result.generation,
      revision: result.revision,
      cleanupPending: result.cleanupPending,
    };
    return result;
  }
  async cleanup(): Promise<BaseLifecycle> {
    const result = await this.request<BaseLifecycle>("/removal-cleanup", {});
    if (
      !Number.isSafeInteger(result.generation) ||
      result.generation < this.state.generation ||
      !Number.isSafeInteger(result.revision) ||
      result.revision < this.state.revision ||
      typeof result.cleanupPending !== "boolean"
    )
      throw new Error("invalidBaseLifecycle");
    this.state = result;
    return { ...result };
  }
  async history(): Promise<Snapshot[]> {
    const rows: Snapshot[] = [];
    let before: number | undefined;
    while (true) {
      const page = await this.request<Snapshot[]>(
        `/history${before === undefined ? "" : `?beforeRevision=${before}`}`,
      );
      // Refuse a non-progressing cursor rather than looping or concealing versions.
      if (
        page.length > 20 ||
        page.some(
          (row, i) =>
            !Number.isSafeInteger(row.revision) ||
            row.revision < 1 ||
            (i === 0
              ? before !== undefined && row.revision >= before
              : row.revision >= page[i - 1].revision),
        )
      )
        throw new Error("invalidHistoryPage");
      rows.push(...page);
      if (page.length < 20) return rows;
      before = page.at(-1)!.revision;
    }
  }
  save(input: Parameters<BaseCvAdapter["save"]>[0]) {
    return this.request<Snapshot>("/save", input);
  }
  restore(input: Parameters<BaseCvAdapter["restore"]>[0]) {
    return this.request<Snapshot>("/restore", input);
  }
}
