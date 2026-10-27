import { AdapterError, type BaseCvAdapter, type Snapshot } from "./adapter";

export type CvTransport = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

// The authenticated shell supplies transport. No identity, token or CV cache is
// retained here; remount the shell's App on account/session changes.
export class HttpBaseCvAdapter implements BaseCvAdapter {
  readonly capability = "durable" as const;
  constructor(
    private readonly transport: CvTransport = (path, init) =>
      fetch(path, { ...init, credentials: "same-origin", cache: "no-store" }),
  ) {}

  private async request<T>(path: string, input?: unknown): Promise<T> {
    const response = await this.transport(`/v1/base-cv${path}`, {
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
    return (await response.json()) as T;
  }
  load() {
    return this.request<Snapshot | null>("");
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
