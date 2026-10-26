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
import { clone, localId, type BaseDraft, type Locale } from "./base/model";
import { prepareDraft, focusField } from "./base/editing";
import { validateDraft, type Issue } from "./base/validation";
import { DocumentPreview } from "./components/DocumentPreview";
import { Editor } from "./components/Editor";
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
export function App({ adapter = sessionAdapter }: { adapter?: BaseCvAdapter }) {
  const [locale, setLocale] = useState<Locale>("ro"),
    t = (ro: string, en: string) => (locale === "ro" ? ro : en);
  const [route, setRoute] = useState<Route>(currentRoute),
    [draft, setDraft] = useState<BaseDraft | null>(null),
    [head, setHead] = useState<Snapshot | null>(null);
  const [past, setPast] = useState<BaseDraft[]>([]),
    [versions, setVersions] = useState<Snapshot[]>([]),
    [inspected, setInspected] = useState<Snapshot | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
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
  const savedRequest = useRef<{ body: string; id: string } | null>(null);
  latest.current = draft;
  headRef.current = head;
  const [asOf] = useState(() => {
    const n = new Date();
    return {
      year: String(n.getUTCFullYear()),
      month: String(n.getUTCMonth() + 1),
    };
  });
  const dirty =
    !!draft && (!head || JSON.stringify(draft) !== JSON.stringify(head.draft));
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
    void adapter
      .load()
      .then((s) => {
        if (!cancelled) {
          setHead(s);
          if (s) setDraft(prepareDraft(s.draft));
          setLoading(false);
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
  }, [adapter]);
  useEffect(() => {
    if (!draft && !head) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, head]);
  const refreshHistory = useCallback(async () => {
    try {
      setVersions(await adapter.history());
    } catch {
      setError("load");
    }
  }, [adapter]);
  useEffect(() => {
    if (route === "history") void refreshHistory();
  }, [route, refreshHistory]);
  function change(next: BaseDraft) {
    generation.current++;
    if (draft) setPast((p) => [...p.slice(-49), clone(draft)]);
    latest.current = next;
    setDraft(next);
    setIssues([]);
    setNotice("");
    if (error !== "conflict") setError(null);
  }
  function openDraft(next: BaseDraft) {
    generation.current++;
    const ready = prepareDraft(next);
    latest.current = ready;
    setDraft(ready);
    setPast([]);
    setIssues([]);
    setError(null);
    setNotice("");
    go("base");
  }
  function start(next: BaseDraft) {
    if (draft && dirty) setDialog({ kind: "replace", next });
    else openDraft(next);
  }
  function requestId(body: string) {
    if (savedRequest.current?.body !== body)
      savedRequest.current = { body, id: localId() };
    return savedRequest.current.id;
  }
  async function save(mode: "autosave" | "checkpoint" = "checkpoint") {
    const current = latest.current;
    if (!current || lock.current) return;
    if (mode === "checkpoint") {
      const found = validateDraft(current);
      setIssues(found);
      if (found.length) {
        go("base");
        setNotice(
          t(
            "Completează câmpul marcat; ciorna rămâne salvată în sesiune.",
            "Complete the marked field; your draft remains saved in session.",
          ),
        );
        focusField(found[0].field);
        return;
      }
    }
    lock.current = true;
    setBusy(true);
    const submitted = generation.current;
    try {
      const input = {
        draft: clone(current),
        expectedRevision: headRef.current?.revision ?? 0,
        mode,
      };
      const saved = await adapter.save({
        ...input,
        requestId: requestId(JSON.stringify(input)),
      });
      headRef.current = saved;
      setHead(saved);
      setError(null);
      if (submitted === generation.current)
        setNotice(
          mode === "autosave"
            ? ""
            : t("Salvat în sesiune.", "Saved in session."),
        );
    } catch (e) {
      setError(e instanceof AdapterError ? e.code : "save");
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
    if (!dirty || !draft || busy || loading || error) return;
    const timer = setTimeout(() => {
      void save("autosave");
    }, 650);
    return () => clearTimeout(timer);
  }, [draft, dirty, busy, loading, error]);
  async function reopen() {
    if (lock.current) return;
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
            "Ultima ciornă salvată în sesiune a fost redeschisă.",
            "Latest session draft reopened.",
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
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const started = generation.current;
    try {
      const input = {
        snapshotId: snapshot.id,
        expectedRevision: headRef.current?.revision ?? 0,
      };
      const s = await adapter.restore({
        ...input,
        requestId: requestId(JSON.stringify(input)),
      });
      headRef.current = s;
      setHead(s);
      if (started === generation.current) {
        openDraft(s.draft);
        setNotice(
          t(
            `Restaurat ca v${s.revision}; istoricul este păstrat.`,
            `Restored as v${s.revision}; history retained.`,
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
    } catch (e) {
      setError(e instanceof AdapterError ? e.code : "save");
    } finally {
      lock.current = false;
      setBusy(false);
      setDialog(null);
    }
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
                  ? t("Istoric în sesiune", "Session history")
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
              {error === "conflict"
                ? t(
                    "Sesiunea s-a schimbat. Ciorna ta este păstrată; inspectează istoricul înainte de redeschidere.",
                    "Session changed. Your draft is retained; inspect history before reopening.",
                  )
                : t(
                    "Acțiunea a eșuat; ciorna este păstrată.",
                    "The action failed; your draft is retained.",
                  )}
              <Button
                onClick={() =>
                  error === "conflict" ? go("history") : void save()
                }
              >
                {error === "conflict"
                  ? t("Istoric", "History")
                  : t("Reîncearcă", "Retry")}
              </Button>
            </div>
          )}
          {loading ? (
            <p role="status">{t("Deschidem sesiunea…", "Opening session…")}</p>
          ) : (
            <>
              {route === "home" && (
                <HomeScreen
                  draft={!!draft}
                  head={head}
                  go={go}
                  reopen={() =>
                    dirty ? setDialog({ kind: "reopen" }) : void reopen()
                  }
                />
              )}
              {(route === "start" ||
                (["base", "review", "enrich"].includes(route) && !draft)) && (
                <StartChooser start={start} />
              )}
              {draft && ["base", "review"].includes(route) && (
                <>
                  {!!issues.length && (
                    <p role="alert" className="notice notice-error">
                      {issueText(issues[0].code, t)}
                    </p>
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
                      onEdit={focusField}
                    />
                  </div>
                </>
              )}
              {draft && route === "enrich" && (
                <Enrichment
                  draft={draft}
                  change={change}
                  goEdit={() => go("base")}
                  asOf={asOf}
                />
              )}
              {route === "history" && (
                <HistoryScreen
                  draft={!!draft}
                  versions={versions}
                  head={head}
                  inspected={inspected}
                  setInspected={setInspected}
                  restore={(snapshot) =>
                    setDialog({ kind: "restore", snapshot })
                  }
                  go={go}
                  asOf={asOf}
                />
              )}
              {["jobs", "account", "missing"].includes(route) && (
                <section className="card empty">
                  <h2>{t("În pregătire", "In preparation")}</h2>
                  <p>
                    {route === "jobs"
                      ? t(
                          "Joburile, adaptarea și exportul nu sunt conectate.",
                          "Jobs, tailoring and export are not connected.",
                        )
                      : t(
                          "Contul și salvarea online nu sunt conectate. Poți folosi editorul local fără cont.",
                          "Account and online saving are not connected. You can use the local editor without an account.",
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
                        : t(
                            "Ciornă salvată în sesiune",
                            "Draft saved in session",
                          )}
                  {head ? ` · v${head.revision}` : ""}
                </p>
                <small>
                  {t(
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
                    latest.current = previous;
                    setDraft(previous);
                    setPast((p) => p.slice(0, -1));
                    setIssues([]);
                    setError(null);
                  }}
                >
                  <Undo2 size={17} />
                </Button>
                <Button
                  variant="primary"
                  disabled={busy}
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
              {t(
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
            {t(
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
              disabled={busy}
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
