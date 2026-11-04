import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { AuthTransport } from "../auth/AuthShell";
import type {
  DraftKind,
  WorkspaceDraft,
} from "@resumora/contracts/editor/workspace";
import { SaveController } from "./controller";
import { DocumentController } from "./document-controller";
import { Button, useCopy } from "../components/ui";
export class WorkspaceRegistry {
  deletedJobs = new Set<string>();
  private jobDrafts = new Map<string, Set<string>>();
  trackJobDraft(jobId: string, key: string) {
    let keys = this.jobDrafts.get(jobId);
    if (!keys) {
      keys = new Set();
      this.jobDrafts.set(jobId, keys);
    }
    keys.add(key);
  }
  forgetJob(jobId: string) {
    this.deletedJobs.add(jobId);
    const keys = new Set([
      `job-review:${jobId}`,
      `job-answer:${jobId}`,
      ...(this.jobDrafts.get(jobId) ?? []),
    ]);
    for (const key of keys) {
      this.controllers.get(key)?.dispose();
      this.controllers.delete(key);
    }
    this.jobDrafts.delete(jobId);
    for (const [key, controller] of this.documents) {
      if (key.startsWith(`job:${jobId}:`)) {
        controller.dispose();
        this.documents.delete(key);
      }
    }
    this.commands.delete(`job-command:${jobId}`);
    this.commands.delete(`job-answer-command:${jobId}`);
    if (this.openedRoute.startsWith(`#/jobs/${jobId}`))
      this.openedRoute = "#/jobs";
    this.notify();
  }
  openedRoute = "";
  opened(route: string) {
    if (this.openedRoute !== route) {
      this.openedRoute = route;
      this.notify();
    }
  }
  controllers = new Map<string, SaveController<any, any>>();
  commands = new Map<string, { current: any }>();
  private listeners = new Set<() => void>();
  private version = 0;
  transport?: AuthTransport;
  documents = new Map<string, DocumentController>();
  receipt(key: string) {
    let ref = this.commands.get(key);
    if (!ref) {
      ref = { current: null };
      this.commands.set(key, ref);
    }
    return ref;
  }
  constructor(transport?: AuthTransport) {
    this.transport = transport;
  }
  notify = () => {
    this.version++;
    for (const f of this.listeners) f();
  };
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  snapshot = () => this.version;
  async json<T>(path: string, body?: unknown): Promise<T> {
    if (!this.transport) throw Error("connectionRequired");
    const r = await this.transport(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    const v = await r.json().catch(() => null);
    if (!r.ok)
      throw Error(
        v?.error?.code ?? (r.status === 409 ? "conflict" : "unavailable"),
      );
    return v as T;
  }
  draft<T extends object>(kind: DraftKind, id: string, initial: T) {
    const key = `${kind}:${id}`;
    let controller = this.controllers.get(key) as
      SaveController<T, WorkspaceDraft<T>> | undefined;
    if (!controller) {
      let memory: WorkspaceDraft<T> | null = null,
        profileGeneration = 0;
      controller = new SaveController(
        key,
        initial,
        {
          load: async () => {
            let row = memory;
            if (this.transport) {
              const response = await this.transport(
                `/v1/workspace-drafts/${kind}/${id}`,
                { method: "GET", cache: "no-store" },
              );
              const value = await response.json();
              if (!response.ok)
                throw Error(value?.error?.code ?? "unavailable");
              profileGeneration = Number(
                response.headers.get("X-Profile-Generation") ?? 0,
              );
              row = value;
            }
            return row
              ? { value: row.value, revision: row.revision, head: row }
              : null;
          },
          save: async (value, expectedRevision, requestId) => {
            const row = this.transport
              ? await this.json<WorkspaceDraft<T>>(
                  `/v1/workspace-drafts/${kind}/${id}`,
                  { requestId, expectedRevision, value, profileGeneration },
                )
              : {
                  id,
                  kind,
                  value,
                  revision: expectedRevision + 1,
                  updatedAt: new Date().toISOString(),
                };
            memory = row;
            return { value: row.value, revision: row.revision, head: row };
          },
        },
        this.notify,
      );
      this.controllers.set(key, controller);
    }
    return controller;
  }
  discardImport(id: string) {
    const key = `import-review:${id}`;
    this.controllers.get(key)?.dispose();
    this.controllers.delete(key);
    this.notify();
  }
  clearProfile() {
    for (const [key, c] of this.controllers) {
      if (!["intake", "resume", "job-review"].includes(key.split(":")[0])) {
        c.dispose();
        this.controllers.delete(key);
      }
    }
    this.commands.clear();
    this.notify();
  }
  hasUnsaved() {
    return (
      [...this.commands.values()].some((r) => !!r.current) ||
      [...this.controllers.values()].some(
        (c) => c.state.dirty || c.state.busy,
      ) ||
      [...this.documents.values()].some((d: any) => d.unsaved)
    );
  }
  dispose() {
    for (const c of this.controllers.values()) c.dispose();
    this.controllers.clear();
    for (const d of this.documents.values()) d.dispose();
    this.documents.clear();
    this.commands.clear();
    this.jobDrafts.clear();
    this.deletedJobs.clear();
  }
}
export const WorkspaceContext = createContext<WorkspaceRegistry | null>(null);
export function WorkspaceProvider({
  transport,
  children,
}: {
  transport?: AuthTransport;
  children: ReactNode;
}) {
  const [registry] = useState(() => new WorkspaceRegistry(transport));
  const lifetime = useRef(0);
  registry.transport = transport;
  useEffect(() => {
    const version = ++lifetime.current;
    const warn = (event: BeforeUnloadEvent) => {
      if (registry.hasUnsaved()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const signout = (event: Event) => {
      if (
        registry.hasUnsaved() &&
        !window.confirm(
          "Some changes have not reached your account. Sign out and discard those unsent changes?",
        )
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("resumora:before-signout", signout);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("resumora:before-signout", signout);
      queueMicrotask(() => {
        if (lifetime.current === version) registry.dispose();
      });
    };
  }, [registry]);
  return <WorkspaceContext value={registry}>{children}</WorkspaceContext>;
}
export function useWorkspaceDraft<T extends object>(
  kind: DraftKind,
  id: string | undefined,
  initial: T,
) {
  const context = useContext(WorkspaceContext);
  const fallback = useRef<WorkspaceRegistry | null>(null);
  if (!fallback.current) fallback.current = new WorkspaceRegistry();
  const registry = id ? (context ?? fallback.current) : fallback.current;
  useSyncExternalStore(
    registry.subscribe,
    registry.snapshot,
    registry.snapshot,
  );
  const controller = registry.draft(kind, id ?? `local-${kind}`, initial);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  useEffect(() => {
    void controller.load();
  }, [controller]);
  return {
    ...state,
    value: state.value,
    set: controller.set,
    flush: () => controller.flush(),
    controller,
    durable: !!registry.transport,
  };
}
export function DraftStatus({
  draft,
}: {
  draft: {
    dirty: boolean;
    busy: boolean;
    ready?: boolean;
    error: string | null;
    durable?: boolean;
    controller: SaveController<any, any>;
  };
}) {
  const t = useCopy();
  return (
    <div className="draft-status" role="status">
      {draft.ready === false && !draft.error
        ? t("Se deschide ciorna…", "Opening draft…")
        : draft.error === "profileRemoved"
          ? t(
              "Profilul a fost eliminat. Această ciornă veche nu poate fi salvată din nou.",
              "The profile was removed. This older draft cannot be saved again.",
            )
          : draft.error
            ? t(
                "Nu am putut salva. Editările sunt păstrate în pagina deschisă.",
                "Unable to save. Your edits remain in this open page.",
              )
            : draft.busy || draft.dirty
              ? t("Se salvează…", "Saving…")
              : draft.durable
                ? t("Salvat în cont", "Saved to your account")
                : t("Păstrat în această sesiune", "Kept in this session")}
      {draft.error && draft.error !== "profileRemoved" && (
        <>
          <Button onClick={() => void draft.controller.retry()}>
            {t("Reîncearcă aceeași salvare", "Retry the same save")}
          </Button>
          {/conflict|VERSION_CONFLICT/.test(draft.error) && (
            <details>
              <summary>
                {t(
                  "Rezolvă modificările concurente",
                  "Resolve changes from another tab",
                )}
              </summary>
              <p>
                {t(
                  "Poți încărca versiunea din cont sau păstra explicit editările acestei pagini peste versiunea curentă.",
                  "You can load the account version or explicitly save this page’s edits over the current version.",
                )}
              </p>
              <Button onClick={() => void draft.controller.resolve(false)}>
                {t("Încarcă versiunea salvată", "Load saved version")}
              </Button>
              <Button onClick={() => void draft.controller.resolve(true)}>
                {t("Păstrează editările mele", "Keep my edits")}
              </Button>
            </details>
          )}
        </>
      )}
    </div>
  );
}
export function WorkspaceRecovery() {
  const registry = useContext(WorkspaceContext);
  const t = useCopy();
  useSyncExternalStore(
    registry?.subscribe ?? (() => () => {}),
    registry?.snapshot ?? (() => 0),
  );
  if (!registry) return null;
  const failed = [...registry.controllers.values()].filter(
    (c) => c.state.error && c.state.dirty,
  );
  const failedDocuments = [...registry.documents.entries()].filter(
    ([, d]) => d.unsaved && d.error,
  );
  return failed.length || failedDocuments.length ? (
    <aside
      className="notice notice-error"
      aria-label={t("Recuperarea editărilor", "Recover edits")}
    >
      <p>
        {t(
          "Unele editări nu au ajuns în cont. Sunt păstrate în această pagină, inclusiv în alte secțiuni.",
          "Some edits have not reached your account. They remain in this page, including work in other sections.",
        )}
      </p>
      {failed.map((c) => (
        <DraftStatus
          key={c.key}
          draft={{ ...c.state, controller: c, durable: !!registry.transport }}
        />
      ))}
      {failedDocuments.map(([key, d]) => (
        <div key={key}>
          <span>
            {key.startsWith("job:")
              ? t("CV pentru job", "Job CV")
              : t("Profilul meu", "My Profile")}
          </span>
          <Button
            disabled={d.lock.current || !d.pending.current}
            onClick={() => {
              if (d.adapter) void d.submit(d.adapter);
            }}
          >
            {t("Reîncearcă aceeași salvare", "Retry the same save")}
          </Button>
        </div>
      ))}
    </aside>
  ) : null;
}
