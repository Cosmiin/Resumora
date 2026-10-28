import { confirmImported } from "@resumora/contracts/editor/import";
import { ImportReview } from "./components/ImportReview";
import type { IntelligenceClient } from "./base/intelligence";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  History,
  Home,
  MessageSquare,
  Save,
  Undo2,
  BriefcaseBusiness,
  UserRound,
} from "lucide-react";
import {
  AdapterError,
  MemoryBaseCvAdapter,
  type BaseCvAdapter,
  type Snapshot,
} from "./base/adapter";
import { clone, equalValues, type BaseDraft, type Locale } from "./base/model";
import { prepareDraft, focusField } from "./base/editing";
import { validateDraft, type Issue } from "./base/validation";
import { DocumentPreview } from "./components/DocumentPreview";
import { Editor } from "./components/Editor";
import { JobsScreen } from "./components/JobsScreen";
import type { AuthTransport } from "./auth/AuthShell";
import { Enrichment } from "./components/Enrichment";
import { Review } from "./components/Review";
import { Button, Dialog, LanguageContext, issueText } from "./components/ui";
import { routes, type Route } from "./base/routes";
import {
  StartChooser,
  HomeScreen,
  HistoryScreen,
} from "./components/BaseScreens";
const sessionAdapter = new MemoryBaseCvAdapter();
function currentRoute(): Route {
  const hash = window.location.hash.slice(1) || "home";
  return routes.includes(hash as (typeof routes)[number])
    ? (hash as Route)
    : "missing";
}
const adapterKeys = new WeakMap<BaseCvAdapter, number>();
let nextAdapterKey = 0;
type PendingWrite = {
  generation: number;
  expired?: boolean;
  uncertain?: boolean;
} & (
  | { kind: "save"; input: Parameters<BaseCvAdapter["save"]>[0] }
  | { kind: "restore"; input: Parameters<BaseCvAdapter["restore"]>[0] }
);
export function App({
  adapter = sessionAdapter,
  intelligence,
  transport,
}: {
  adapter?: BaseCvAdapter;
  intelligence?: IntelligenceClient;
  transport?: AuthTransport;
}) {
  if (!adapterKeys.has(adapter)) adapterKeys.set(adapter, ++nextAdapterKey);
  return (
    <CvEditor
      key={adapterKeys.get(adapter)}
      adapter={adapter}
      transport={transport}
      intelligence={intelligence}
    />
  );
}
function CvEditor({
  adapter,
  intelligence,
  transport,
}: {
  adapter: BaseCvAdapter;
  intelligence?: IntelligenceClient;
  transport?: AuthTransport;
}) {
  const durable = adapter.capability === "durable";
  const [locale, setLocale] = useState<Locale>("ro"),
    t = (ro: string, en: string) => (locale === "ro" ? ro : en);
  const [route, setRoute] = useState<Route>(currentRoute),
    [draft, setDraft] = useState<BaseDraft | null>(null),
    [head, setHead] = useState<Snapshot | null | undefined>(undefined);
  const [past, setPast] = useState<BaseDraft[]>([]),
    [undoFrom, setUndoFrom] = useState<BaseDraft | null>(null),
    [versions, setVersions] = useState<Snapshot[]>([]),
    [inspected, setInspected] = useState<Snapshot | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [loadAttempt, setLoadAttempt] = useState(0),
    [historyAttempt, setHistoryAttempt] = useState(0),
    [historyError, setHistoryError] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<
    | { kind: "replace"; next: BaseDraft }
    | { kind: "reopen" }
    | { kind: "restore"; snapshot: Snapshot }
    | null
  >(null);
  const generation = useRef(0),
    lock = useRef(false),
    latest = useRef(draft),
    headRef = useRef(head),
    saveRef = useRef<() => void>(() => {}),
    main = useRef<HTMLElement>(null);
  const pendingWrite = useRef<PendingWrite | null>(null);
  latest.current = draft;
  headRef.current = head;
  const [asOf] = useState(() => {
    const n = new Date();
    return {
      year: String(n.getUTCFullYear()),
      month: String(n.getUTCMonth() + 1),
    };
  });
  const dirty = !!draft && (!head || !equalValues(draft, head.draft));
  const pending = pendingWrite.current;
  const uncertainDraft =
    !!pending &&
    (pending.kind === "restore" || !equalValues(draft, pending.input.draft));
  const warnOnUnload = durable
    ? dirty || uncertainDraft || error === "conflict"
    : !!(draft || head);
  const editing = !!draft && ["base", "enrich", "review"].includes(route);
  const go = useCallback((next: Route) => {
    window.location.hash = next;
    setRoute(next);
  }, []);
  useEffect(() => {
    const change = () => setRoute(currentRoute());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!draft || !["base", "enrich"].includes(route)) main.current?.focus();
  }, [route]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `Resumora · ${t("CV de bază", "Base CV")}`;
  }, [locale]);
  useEffect(() => {
    let cancelled = false;
    setLoading(!latest.current);
    void adapter
      .load()
      .then((s) => {
        if (!cancelled) {
          setHead(s);
          if (s && !latest.current) setDraft(prepareDraft(s.draft));
          setLoading(false);
          setError(
            s && latest.current && !equalValues(latest.current, s.draft)
              ? "conflict"
              : null,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setError("load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, loadAttempt]);
  useEffect(() => {
    if (!warnOnUnload) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [warnOnUnload]);
  useEffect(() => {
    if (route !== "history") return;
    let cancelled = false;
    void adapter.history().then(
      (history) => {
        if (!cancelled) {
          setVersions(history);
          setHistoryError(false);
        }
      },
      () => {
        if (!cancelled) setHistoryError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [route, head?.id, adapter, historyAttempt]);
  function change(next: BaseDraft) {
    const current = latest.current;
    if (equalValues(next, current)) return;
    generation.current++;
    if (current) setPast((p) => [...p.slice(-49), clone(current)]);
    latest.current = next;
    setDraft(next);
    setIssues([]);
    setNotice("");
    if (
      headRef.current !== undefined &&
      error !== "conflict" &&
      !pendingWrite.current
    )
      setError(null);
  }
  function openDraft(next: BaseDraft) {
    generation.current++;
    const ready = prepareDraft(next);
    latest.current = ready;
    setDraft(ready);
    setPast([]);
    setIssues([]);
    if (headRef.current !== undefined && !pendingWrite.current) setError(null);
    setNotice("");
    go("base");
  }
  function start(next: BaseDraft) {
    if (draft && dirty) setDialog({ kind: "replace", next });
    else openDraft(next);
  }
  async function save(mode: "autosave" | "checkpoint" = "checkpoint") {
    const current = latest.current;
    if (
      !current ||
      headRef.current === undefined ||
      lock.current ||
      pendingWrite.current
    )
      return;
    if (mode === "checkpoint") {
      const found = validateDraft(current);
      setIssues(found);
      if (found.length) {
        go("base");
        setNotice(
          t(
            "Completează câmpul marcat; salvarea automată păstrează și ciorne incomplete.",
            "Complete the marked field; autosave also preserves incomplete drafts.",
          ),
        );
        focusField(found[0].field);
        return;
      }
    }
    pendingWrite.current = {
      kind: "save",
      generation: generation.current,
      input: {
        draft: clone(current),
        expectedRevision: headRef.current?.revision ?? 0,
        mode,
        requestId: crypto.randomUUID(),
      },
    };
    await submitPendingWrite();
  }
  async function submitPendingWrite() {
    const operation = pendingWrite.current;
    if (!operation || operation.expired || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const saved =
        operation.kind === "save"
          ? await adapter.save(clone(operation.input))
          : await adapter.restore(clone(operation.input));
      pendingWrite.current = null;
      headRef.current = saved;
      setHead(saved);
      setError(null);
      if (operation.kind === "restore") {
        if (operation.generation === generation.current) {
          openDraft(saved.draft);
          setNotice(
            t(
              `Restaurat ca v${saved.revision}; istoricul este păstrat.`,
              `Restored as v${saved.revision}; history retained.`,
            ),
          );
        } else
          setNotice(
            t(
              "Versiune restaurată; editările mai noi rămân în ciornă.",
              "Version restored; newer edits remain in your draft.",
            ),
          );
        setInspected(null);
      } else if (operation.generation === generation.current)
        setNotice(
          operation.input.mode === "autosave"
            ? ""
            : durable
              ? t("Salvat în cont.", "Saved to your account.")
              : t("Salvat în sesiune.", "Saved in session."),
        );
    } catch (e) {
      if (e instanceof AdapterError) {
        if (e.code === "expired") operation.expired = true;
        else if (
          !operation.uncertain ||
          !["unauthenticated", "forbidden", "missing"].includes(e.code)
        )
          pendingWrite.current = null;
      } else operation.uncertain = true;
      const supersededRejection =
        !pendingWrite.current &&
        e instanceof AdapterError &&
        (e.code === "rejected" || e.code === "validation") &&
        operation.generation !== generation.current;
      setError(
        supersededRejection
          ? null
          : e instanceof AdapterError
            ? e.code
            : "save",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      if (operation.kind === "restore") setDialog(null);
    }
  }
  async function reconcilePendingWrite() {
    const operation = pendingWrite.current;
    if (!operation?.expired || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const saved = await adapter.load();
      const unchanged =
        (saved?.revision ?? 0) === operation.input.expectedRevision &&
        saved?.id === headRef.current?.id;
      const applied =
        !!saved &&
        (operation.kind === "save"
          ? equalValues(saved.draft, operation.input.draft)
          : saved.restoredFrom === operation.input.snapshotId);
      pendingWrite.current = null;
      if (!unchanged && !applied) {
        setError("conflict");
        return;
      }
      headRef.current = saved;
      setHead(saved);
      if (
        applied &&
        saved &&
        operation.kind === "restore" &&
        operation.generation === generation.current
      )
        openDraft(saved.draft);
      setError(null);
      setNotice(
        t(
          "Starea salvată a fost verificată; ciorna ta este păstrată.",
          "Saved state checked; your draft was retained.",
        ),
      );
    } catch {
      setError("expired");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  saveRef.current = () => {
    void save();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!dirty || !draft || busy || loading || error || pendingWrite.current)
      return;
    const timer = setTimeout(() => {
      void save("autosave");
    }, 650);
    return () => clearTimeout(timer);
  }, [draft, dirty, busy, loading, error]);
  async function reopen() {
    if (lock.current || pendingWrite.current) return;
    lock.current = true;
    setBusy(true);
    const started = generation.current;
    try {
      const s = await adapter.load();
      if (!s) {
        setError("missing");
        return;
      }
      headRef.current = s;
      setHead(s);
      if (started === generation.current) {
        openDraft(s.draft);
        setNotice(
          t(
            "Ultima ciornă salvată a fost redeschisă.",
            "Latest saved draft reopened.",
          ),
        );
      } else
        setNotice(
          t(
            "Ciorna mai nouă a fost păstrată.",
            "Your newer draft was retained.",
          ),
        );
    } catch {
      setError("load");
    } finally {
      lock.current = false;
      setBusy(false);
      setDialog(null);
    }
  }
  async function restore(snapshot: Snapshot) {
    if (headRef.current === undefined || lock.current || pendingWrite.current)
      return;
    pendingWrite.current = {
      kind: "restore",
      generation: generation.current,
      input: {
        snapshotId: snapshot.id,
        expectedRevision: headRef.current?.revision ?? 0,
        requestId: crypto.randomUUID(),
      },
    };
    await submitPendingWrite();
  }
  const nav = [
    { route: "home", label: t("Acasă", "Home"), Icon: Home },
    { route: "base", label: t("CV de bază", "Base CV"), Icon: FileText },
    {
      route: "enrich",
      label: t("Îmbunătățește", "Improve"),
      Icon: MessageSquare,
    },
    { route: "jobs", label: t("Joburi", "Jobs"), Icon: BriefcaseBusiness },
    { route: "account", label: t("Cont", "Account"), Icon: UserRound },
  ];
  const editingTitle =
    route === "enrich"
      ? t("Mai mult context, pas cu pas", "More context, one step at a time")
      : t("CV-ul tău de bază", "Your Base CV");
  return (
    <LanguageContext value={locale}>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        {t("Mergi la conținut", "Skip to content")}
      </a>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Resumora">
          <img
            src="/resumora-logo.svg"
            alt="Resumora"
            width="142"
            height="34"
          />
        </a>
        <div className="header-tools">
          <label>
            {t("Interfață", "Interface")}
            <select
              aria-label={t("Limba interfeței", "Interface language")}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="ro">RO</option>
              <option value="en">EN</option>
            </select>
          </label>
          {draft && (
            <label>
              {t("CV", "CV")}
              <select
                aria-label={t("Limba CV-ului", "CV language")}
                value={draft.language}
                onChange={(e) =>
                  change({
                    ...clone(draft),
                    language: e.target.value as Locale,
                  })
                }
              >
                <option value="ro">RO</option>
                <option value="en">EN</option>
              </select>
            </label>
          )}
        </div>
      </header>
      <div className="app-layout">
        <aside className="sidebar">
          <nav aria-label={t("Navigare principală", "Main navigation")}>
            {nav.map((n) => (
              <a
                key={n.route}
                href={`#${n.route}`}
                aria-current={route === n.route ? "page" : undefined}
              >
                <n.Icon size={19} />
                <span>{n.label}</span>
              </a>
            ))}
          </nav>
        </aside>
        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className={editing ? "editing-page" : ""}
        >
          <div className="page-heading">
            <h1>
              {editing
                ? editingTitle
                : route === "history"
                  ? durable
                    ? t("Istoric", "History")
                    : t("Istoric în sesiune", "Session history")
                  : "Resumora"}
            </h1>
            {editing && (
              <div className="actions">
                <Button onClick={() => go("history")}>
                  <History size={16} />
                  {t("Istoric", "History")}
                </Button>
                <Button
                  onClick={() => go(route === "enrich" ? "base" : "enrich")}
                >
                  {route === "enrich"
                    ? t("Editor", "Editor")
                    : t("Întrebări", "Questions")}
                </Button>
              </div>
            )}
          </div>
          {error && (
            <div role="alert" className="notice notice-error">
              {pendingWrite.current?.expired
                ? t(
                    "Rezultatul salvării nu mai poate fi reluat. Verifică starea salvată; editările tale vor fi păstrate.",
                    "This save can no longer be replayed. Check saved state; your edits will be retained.",
                  )
                : error === "conflict"
                  ? t(
                      "Sesiunea s-a schimbat. Ciorna ta este păstrată; inspectează istoricul înainte de redeschidere.",
                      "Session changed. Your draft is retained; inspect history before reopening.",
                    )
                  : t(
                      "Acțiunea a eșuat; ciorna este păstrată.",
                      "The action failed; your draft is retained.",
                    )}
              {(pendingWrite.current ||
                error === "conflict" ||
                error === "load") && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    pendingWrite.current
                      ? pendingWrite.current.expired
                        ? void reconcilePendingWrite()
                        : void submitPendingWrite()
                      : error === "conflict"
                        ? go("history")
                        : head === undefined || !draft
                          ? setLoadAttempt((n) => n + 1)
                          : dirty
                            ? setDialog({ kind: "reopen" })
                            : void reopen()
                  }
                >
                  {pendingWrite.current?.expired
                    ? t("Verifică starea salvată", "Check saved state")
                    : !pendingWrite.current && error === "conflict"
                      ? t("Istoric", "History")
                      : t("Reîncearcă", "Retry")}
                </Button>
              )}
            </div>
          )}
          {route === "history" && historyError && (
            <div role="alert" className="notice notice-error">
              {t(
                "Istoricul nu a putut fi încărcat.",
                "History could not be loaded.",
              )}
              <Button onClick={() => setHistoryAttempt((n) => n + 1)}>
                {t("Reîncearcă istoricul", "Retry history")}
              </Button>
            </div>
          )}
          {loading ? (
            <p role="status">{t("Deschidem sesiunea…", "Opening session…")}</p>
          ) : (
            <>
              {route === "home" && (
                <HomeScreen
                  durable={durable}
                  draft={!!draft}
                  head={head ?? null}
                  go={go}
                  reopen={() =>
                    dirty ? setDialog({ kind: "reopen" }) : void reopen()
                  }
                />
              )}
              {(route === "start" ||
                (["base", "review", "enrich"].includes(route) && !draft)) && (
                <StartChooser
                  start={start}
                  intelligence={intelligence}
                  revision={head?.revision ?? 0}
                />
              )}
              {draft && ["base", "review"].includes(route) && (
                <>
                  {!!issues.length && (
                    <p role="alert" className="notice notice-error">
                      {issueText(issues[0].code, t)}
                    </p>
                  )}
                  {draft.importReview && (
                    <ImportReview
                      key={draft.importReview.id}
                      draft={draft}
                      disabled={
                        busy || !!pendingWrite.current || head === undefined
                      }
                      confirm={(ids) => {
                        const next = confirmImported(latest.current!, ids);
                        const found = validateDraft(next);
                        if (found.length) {
                          setIssues(found);
                          go("base");
                          focusField(found[0].field);
                          return;
                        }
                        change(next);
                        void save("checkpoint");
                      }}
                    />
                  )}
                  <div className="editor-layout">
                    <div>
                      {route === "base" ? (
                        <Editor draft={draft} issues={issues} change={change} />
                      ) : (
                        <Review
                          draft={draft}
                          edit={() => go("base")}
                          enrich={() => go("enrich")}
                        />
                      )}
                    </div>
                    <DocumentPreview
                      draft={draft}
                      asOf={asOf}
                      onEdit={(id) => {
                        go("base");
                        focusField(id);
                      }}
                    />
                  </div>
                </>
              )}
              {draft && route === "enrich" && (
                <Enrichment
                  transport={transport}
                  snapshot={head ?? null}
                  ready={!dirty && !busy && !error && !pendingWrite.current}
                  durable={durable}
                  rewriteRole={
                    intelligence
                      ? async (targetId) => {
                          const saved = headRef.current;
                          if (
                            !saved ||
                            !equalValues(latest.current, saved.draft)
                          )
                            throw new Error("SAVE_REQUIRED");
                          return intelligence.rewrite({
                            snapshotId: saved.id,
                            revision: saved.revision,
                            targetId,
                            operationId: crypto.randomUUID(),
                          });
                        }
                      : undefined
                  }
                  prepareQuestions={
                    intelligence
                      ? async (targetId, goal) => {
                          const saved = headRef.current;
                          if (
                            !saved ||
                            !equalValues(latest.current, saved.draft)
                          )
                            throw new Error("SAVE_REQUIRED");
                          return intelligence.questions({
                            snapshotId: saved.id,
                            revision: saved.revision,
                            targetId,
                            goal,
                            operationId: crypto.randomUUID(),
                          });
                        }
                      : undefined
                  }
                  draft={draft}
                  undoFrom={undoFrom}
                  change={change}
                  goEdit={() => go("base")}
                  asOf={asOf}
                />
              )}
              {route === "history" && (
                <HistoryScreen
                  durable={durable}
                  draft={!!draft}
                  versions={versions}
                  head={head ?? null}
                  inspected={inspected}
                  setInspected={setInspected}
                  restore={(snapshot) =>
                    setDialog({ kind: "restore", snapshot })
                  }
                  go={go}
                  asOf={asOf}
                />
              )}
              {route === "jobs" && (
                <JobsScreen
                  transport={transport}
                  snapshot={head ?? null}
                  ready={!dirty && !busy && !error && !pendingWrite.current}
                />
              )}
              {["account", "missing"].includes(route) && (
                <section className="card empty">
                  <h2>{t("În pregătire", "In preparation")}</h2>
                  <p>
                    {t(
                      durable
                        ? "CV-ul și istoricul sunt salvate în contul tău."
                        : "Contul și salvarea online nu sunt conectate. Poți folosi editorul local fără cont.",
                      durable
                        ? "Your CV and history are saved in your account."
                        : "Account and online saving are not connected. You can use the local editor without an account.",
                    )}
                  </p>
                  <Button onClick={() => go(draft ? "base" : "start")}>
                    {t("CV de bază", "Base CV")}
                  </Button>
                </section>
              )}
            </>
          )}
          {editing && (
            <footer className="save-bar">
              <div>
                <p role="status">
                  {busy
                    ? t("Se salvează…", "Saving…")
                    : error
                      ? t(
                          "Ciornă păstrată · salvarea a eșuat",
                          "Draft retained · save failed",
                        )
                      : dirty
                        ? t("Modificări în ciornă…", "Draft changes…")
                        : durable
                          ? t(
                              "Ciornă salvată în cont",
                              "Draft saved to your account",
                            )
                          : t(
                              "Ciornă salvată în sesiune",
                              "Draft saved in session",
                            )}
                  {head ? ` · v${head.revision}` : ""}
                </p>
                <small>
                  {durable
                    ? t(
                        "Salvare online în contul tău",
                        "Saved online to your account",
                      )
                    : t(
                        "Doar memoria paginii · reîncărcarea șterge datele",
                        "Page memory only · reloading clears data",
                      )}
                </small>
                <span className="sr-only" role="status">
                  {notice}
                </span>
              </div>
              <div className="actions">
                <Button
                  aria-label={t(
                    "Anulează ultima modificare",
                    "Undo last change",
                  )}
                  disabled={!past.length}
                  onClick={() => {
                    const previous = clone(past.at(-1)!);
                    generation.current++;
                    setUndoFrom(latest.current);
                    latest.current = previous;
                    setDraft(previous);
                    setPast((p) => p.slice(0, -1));
                    setIssues([]);
                    if (
                      headRef.current !== undefined &&
                      error !== "conflict" &&
                      !pendingWrite.current
                    )
                      setError(null);
                  }}
                >
                  <Undo2 size={17} />
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    busy || head === undefined || !!pendingWrite.current
                  }
                  onClick={() => void save()}
                >
                  <Save size={16} />
                  {t("Salvează acum", "Save now")}
                  <kbd>⌘/Ctrl S</kbd>
                </Button>
              </div>
            </footer>
          )}
          {!editing && (
            <p className="session-footnote">
              {durable
                ? t(
                    "Ciornele salvate se păstrează în contul tău.",
                    "Saved drafts stay in your account.",
                  )
                : t(
                    "Sesiune locală: reîncărcarea șterge datele. Fără salvare online.",
                    "Local session: reloading clears data. No online saving.",
                  )}
            </p>
          )}
        </main>
      </div>
      {dialog && (
        <Dialog
          title={
            dialog.kind === "restore"
              ? t(
                  `Restaurezi v${dialog.snapshot.revision}?`,
                  `Restore v${dialog.snapshot.revision}?`,
                )
              : t("Înlocuiești ciorna?", "Replace draft?")
          }
          onClose={() => !busy && setDialog(null)}
        >
          <p>
            {durable
              ? t(
                  "Ciorna curentă va fi înlocuită. Versiunile anterioare rămân în istoric.",
                  "Your current draft will be replaced. Previous versions stay in history.",
                )
              : t(
                  "Ciorna curentă va fi înlocuită. Versiunile anterioare rămân în istoric până la reîncărcare.",
                  "The current draft will be replaced. Prior versions remain in history until reload.",
                )}
          </p>
          <div className="actions">
            <Button onClick={() => setDialog(null)} disabled={busy}>
              {t("Păstrează ciorna", "Keep draft")}
            </Button>
            <Button
              variant="primary"
              disabled={
                busy ||
                !!pendingWrite.current ||
                (dialog.kind === "restore" && head === undefined)
              }
              onClick={() => {
                if (dialog.kind === "replace") {
                  openDraft(dialog.next);
                  setDialog(null);
                } else if (dialog.kind === "reopen") void reopen();
                else void restore(dialog.snapshot);
              }}
            >
              {dialog.kind === "restore"
                ? t("Restaurează versiunea", "Restore version")
                : t("Înlocuiește ciorna", "Replace draft")}
            </Button>
          </div>
        </Dialog>
      )}
    </LanguageContext>
  );
}
