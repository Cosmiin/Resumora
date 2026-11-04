import { processCvImport } from "../../../api/src/intelligence/import-processor";
import { webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { AuthShell, type AuthTransport } from "./AuthShell";
import { ConnectedApp } from "./ConnectedApp";
import { httpIntelligence } from "../base/intelligence";
import { configuredIntelligenceRoute } from "../../../api/src/intelligence/configured";
import type {
  ImportRecord,
  ImportStore,
} from "../../../api/src/intelligence/import-workflow";
import { SyntheticLedger } from "../../../api/fixtures/synthetic-ledger";

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

it.each(["none", "focus", "interval"] as const)(
  "connected cancellation survives %s session checks and queued save/precheck work during admission",
  async (check) => {
    let intervalTick: () => void = () => {
      throw new Error("INTERVAL_NOT_REGISTERED");
    };
    if (check === "interval") {
      const schedule = window.setInterval.bind(window);
      vi.spyOn(window, "setInterval").mockImplementation(
        (handler, delay, ...args) => {
          if (delay === 60_000 && typeof handler === "function")
            intervalTick = () => handler(...args);
          return schedule(handler, delay, ...args) as unknown as ReturnType<
            typeof window.setInterval
          >;
        },
      );
    }
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", () => {
      throw new Error("NETWORK_DENIED");
    });
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = Uint8Array.from(
      await pdf.save({ useObjectStreams: false }),
    ).buffer;
    let finishAdmission!: () => void;
    const admission = new Promise<void>((resolve) => {
      finishAdmission = resolve;
    });
    let finishSave!: () => void;
    const saving = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const events: string[] = [];
    const rows = new Map<string, ImportRecord>();
    const copy = (op: string) => structuredClone(rows.get(op)!);
    const user = {
      id: crypto.randomUUID(),
      email: "synthetic@example.invalid",
    };
    let queued: { operationId: string; bytes: Uint8Array } | null = null;
    let worker: Promise<unknown> | undefined;
    const store: ImportStore & { list(): Promise<ImportRecord[]> } = {
      enqueue: async (operationId, bytes) => {
        queued = { operationId, bytes };
        rows.get(operationId)!.stage = "queued";
        return copy(operationId);
      },
      begin: async (input) => {
        const row: ImportRecord = {
          id: crypto.randomUUID(),
          operationId: input.operationId,
          format: "pdf",
          sourceHash: input.sourceHash,
          expectedRevision: input.expectedRevision,
          state: "uploading",
          objectKey: "synthetic-private",
          review: null,
          error: null,
        };
        rows.set(input.operationId, row);
        return { created: true, record: copy(input.operationId) };
      },
      get: async (op) => {
        events.push("status");
        return copy(op);
      },
      list: async () => {
        events.push("list");
        return [...rows.values()];
      },
      expired: async () => [],
      ackPurge: async () => {},
      putObject: async () => {},
      deleteObject: async () => {},
      complete: async (op, state, review, error) => {
        if (rows.get(op)!.state === "cancelled")
          throw new Error("VERSION_CONFLICT");
        Object.assign(rows.get(op)!, { state, review, error });
        return copy(op);
      },
      cancel: async (op) => {
        events.push("cancel fenced");
        rows.get(op)!.state = "cancelled";
        return copy(op);
      },
    };
    const ledger = new SyntheticLedger();
    const gateway = {
      createImportStore: () => store,
      reserveDocumentOperation: async (input: {
        importId: string;
        stage: string;
      }) => {
        const row = [...rows.values()].find((r) => r.id === input.importId)!;
        if (row.state !== "processing") throw new Error("RESOURCE_FORBIDDEN");
        return { created: true };
      },
      beginAttempt: ledger.begin.bind(ledger),
      finishAttempt: ledger.finish.bind(ledger),
    } as unknown as Parameters<typeof configuredIntelligenceRoute>[2];
    const env = {
      AI_PAID_INFERENCE: "on",
      AI_PROCESSING_POLICY: "synthetic-policy",
      AI_WORKER_SECRET: "synthetic-worker-secret-not-real-32-bytes",
      OPENROUTER_API_KEY: "synthetic-router",
      OPENAI_API_KEY: "synthetic-direct",
      OPENROUTER_ENDPOINT: "synthetic",
      OPENROUTER_CV_ADMISSION_MODEL: "synthetic-admission",
      OPENAI_CV_ADMISSION_MODEL: "synthetic-direct-admission",
      OPENROUTER_CV_EXTRACTION_MODEL: "synthetic-extraction",
      OPENAI_CV_EXTRACTION_MODEL: "synthetic-direct-extraction",
    };
    const provider = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        events.push(body.model);
        if (body.model === "synthetic-admission") {
          await admission;
          events.push("admission completed");
        }
        return Response.json({
          id: "response-synthetic",
          model: body.model,
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  kind: "cv",
                  reason: "Synthetic CV",
                  pages: [1],
                }),
              },
            },
          ],
        });
      },
    );
    let accountTransport!: AuthTransport;
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/v1/auth/session")
          return Response.json({
            user,
            csrfToken: "synthetic-csrf",
            recovery: false,
          });
        expect(init?.credentials).toBe("same-origin");
        expect(init?.cache).toBe("no-store");
        if (path === "/v1/base-cv") return Response.json(null);
        if (path === "/v1/base-cv/history") {
          events.push("history");
          return Response.json([]);
        }
        if (path === "/v1/base-cv/save") {
          expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
            "synthetic-csrf",
          );
          events.push("save started");
          await saving;
          events.push("save completed");
          return Response.json({});
        }
        if (path === "/v1/intelligence/rewrite") {
          events.push("precheck dispatched");
          return Response.json({});
        }
        if (!path.startsWith("/v1/intelligence/"))
          throw new Error("NETWORK_DENIED");
        if (init?.method === "POST")
          expect(new Headers(init.headers).get("X-CSRF-Token")).toBe(
            "synthetic-csrf",
          );
        const uploading =
          path === "/v1/intelligence/imports" && init?.method === "POST";
        const request = new Request(`https://resumora.invalid${path}`, {
          ...init,
          body: uploading ? bytes : init?.body,
        });
        const response = await configuredIntelligenceRoute(
          request,
          env,
          gateway,
          user.id,
          provider,
        );
        if (uploading) {
          events.push("upload completed");
          // Synthetic worker execution is controlled by this test, outside intake.
          worker = processCvImport(env, {
            transport: provider,
            store: {
              claim: async () => {
                if (!queued) return null;
                const task = queued;
                queued = null;
                rows.get(task.operationId)!.state = "processing";
                return {
                  lease: task.operationId,
                  userId: user.id,
                  record: copy(task.operationId),
                  base64: Buffer.from(task.bytes).toString("base64"),
                };
              },
              finish: (lease, state, review, error) =>
                store.complete(lease, state, review, error),
              reserve: (_lease, input) =>
                gateway.reserveDocumentOperation(input),
              ledger: () => ({
                durability: "durable",
                begin: ledger.begin.bind(ledger),
                finish: ledger.finish.bind(ledger),
                report: ledger.report.bind(ledger),
              }),
            },
          }).catch((error) => {
            expect(error.message).toBe("VERSION_CONFLICT");
          });
        }
        return response;
      },
    );
    window.location.hash = "#start";
    render(
      <AuthShell fetcher={fetcher}>
        {(account, transport) => {
          accountTransport = transport;
          return <ConnectedApp account={account} transport={transport} />;
        }}
      </AuthShell>,
    );
    const file = await screen.findByLabelText("Document CV");
    fireEvent.change(file, {
      target: { files: [new File([bytes], "synthetic.pdf")] },
    });
    let pendingSave: Promise<Response> | undefined,
      pendingPrecheck: Promise<Response> | undefined;
    try {
      await waitFor(() => expect(events).toContain("synthetic-admission"));
      pendingSave = accountTransport("/v1/base-cv/save", {
        method: "POST",
        body: "{}",
      });
      await waitFor(() => expect(events).toContain("save started"));
      pendingPrecheck = accountTransport("/v1/intelligence/rewrite", {
        method: "POST",
        body: "{}",
      });
      if (check === "focus") fireEvent.focus(window);
      if (check === "interval")
        await act(async () => {
          intervalTick();
        });
      await act(async () => {});
      expect(events).not.toContain("precheck dispatched");
      const operation = [...rows.keys()][0];
      const pendingStatus =
        httpIntelligence(accountTransport).importStatus(operation);
      await waitFor(() => expect(events).toContain("status"));
      expect((await pendingStatus).state).toBe("processing");
      const listCount = events.filter((event) => event === "list").length;
      const pendingList = httpIntelligence(accountTransport).listImports();
      await waitFor(() =>
        expect(
          events.filter((event) => event === "list").length,
        ).toBeGreaterThan(listCount),
      );
      expect((await pendingList)[0].state).toBe("processing");
      fireEvent.click(
        screen.getByRole("button", { name: "Anulează importul" }),
      );
      await waitFor(() => expect(events).toContain("cancel fenced"));
      expect(events).not.toContain("admission completed");
      await screen.findByText(
        "Import anulat. Poți alege un document pentru o operațiune nouă.",
      );
    } finally {
      await act(async () => {
        finishAdmission();
        finishSave();
      });
    }
    await pendingSave;
    await pendingPrecheck;
    expect(events).toContain("precheck dispatched");
    await waitFor(() => expect(events).toContain("upload completed"));
    await worker;
    expect(provider).toHaveBeenCalledTimes(1);
    expect(events).not.toContain("synthetic-extraction");
    expect([...rows.values()][0].state).toBe("cancelled");
    expect(screen.queryByText("Deschide informațiile neconfirmate")).toBeNull();
  },
);
