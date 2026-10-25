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
  Check,
} from "lucide-react";
import {
  AdapterError,
  MemoryBaseCvAdapter,
  type BaseCvAdapter,
  type Snapshot,
} from "./base/adapter";
import { clone, localId, type BaseDraft, type Locale } from "./base/model";
import { validateDraft, type Issue } from "./base/validation";
import { DocumentPreview } from "./components/DocumentPreview";
import { Editor } from "./components/Editor";
import { Enrichment } from "./components/Enrichment";
import { Review } from "./components/Review";
import {
  Button,
  Dialog,
  LanguageContext,
  Pill,
  issueText,
} from "./components/ui";
import { routes, type Route } from "./base/routes";
import {
  StartChooser,
  Sources,
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
    [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<
      | "saved"
      | "restored"
      | "reopened"
      | "undone"
      | "noChange"
      | "savedDraftKept"
      | "newerDraftKept"
      | null
    >(null),
    [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: "replace"; next: BaseDraft }
    | { kind: "reopen" }
    | { kind: "restore"; snapshot: Snapshot }
    | null
  >(null);
  const generation = useRef(0);
  const failedAction = useRef<
    "load" | "save" | "history" | { restore: Snapshot }
  >("load");
  const main = useRef<HTMLElement>(null),
    errors = useRef<HTMLDivElement>(null),
    savedRequest = useRef<{ body: string; id: string } | null>(null);
  const [asOf] = useState(() => {
    const now = new Date();
    return {
      year: String(now.getUTCFullYear()),
      month: String(now.getUTCMonth() + 1),
    };
  });
  const dirty =
    !!draft && (!head || JSON.stringify(draft) !== JSON.stringify(head.draft));
  const go = useCallback((next: Route) => {
    window.location.hash = next;
    setRoute(next);
    setError(null);
  }, []);
  useEffect(() => {
    const change = () => setRoute(currentRoute());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    main.current?.focus();
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
          if (s) setDraft(clone(s.draft));
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
      failedAction.current = "history";
      setError("load");
    }
  }, [adapter]);
  useEffect(() => {
    if (route === "history") void refreshHistory();
  }, [route, refreshHistory]);
  function change(next: BaseDraft) {
    generation.current++;
    if (draft) setPast((p) => [...p.slice(-29), clone(draft)]);
    setDraft(next);
    setAcknowledged(false);
    setIssues([]);
    setNotice(null);
    setError(null);
  }
  function start(next: BaseDraft) {
    if (draft && dirty) {
      setDialog({ kind: "replace", next });
      return;
    }
    openDraft(next);
  }
  function openDraft(next: BaseDraft) {
    generation.current++;
    setDraft(clone(next));
    setPast([]);
    setIssues([]);
    setAcknowledged(false);
    setNotice(null);
    go("base");
  }
  function focusIssue(found: Issue[]) {
    setTimeout(() => {
      const f = document.getElementById(found[0]?.field);
      if (f) f.focus();
      else errors.current?.focus();
    }, 0);
  }
  function requestId(body: string) {
    if (savedRequest.current?.body !== body)
      savedRequest.current = { body, id: localId() };
    return savedRequest.current.id;
  }
  async function save() {
    if (!draft || busy) return;
    const found = validateDraft(draft, acknowledged);
    setIssues(found);
    setNotice(null);
    setError(null);
    if (found.length) {
      if (route !== "base") go("base");
      focusIssue(found);
      return;
    }
    setBusy(true);
    const submittedGeneration = generation.current,
      submittedHash = window.location.hash;
    try {
      const input = {
        draft,
        expectedRevision: head?.revision ?? 0,
        acknowledged,
      };
      const saved = await adapter.save({
        ...input,
        requestId: requestId(JSON.stringify(input)),
      });
      setHead(saved);
      if (generation.current === submittedGeneration) {
        setNotice(saved.revision === head?.revision ? "noChange" : "saved");
        setDraft(clone(saved.draft));
        setPast([]);
        setAcknowledged(false);
        if (window.location.hash === submittedHash) go("review");
      } else setNotice("savedDraftKept");
    } catch (e) {
      failedAction.current = "save";
      setError(e instanceof AdapterError ? e.code : "save");
      if (
        e instanceof AdapterError &&
        generation.current === submittedGeneration
      ) {
        setIssues(e.issues);
        if (e.issues.length) focusIssue(e.issues);
      }
    } finally {
      setBusy(false);
    }
  }
  async function reopen() {
    setBusy(true);
    const requestedGeneration = generation.current;
    try {
      const saved = await adapter.load();
      if (!saved) {
        setError("missing");
        return;
      }
      setHead(saved);
      if (generation.current === requestedGeneration) {
        openDraft(saved.draft);
        setNotice("reopened");
      } else setNotice("newerDraftKept");
      setDialog(null);
    } catch {
      failedAction.current = "load";
      setError("load");
      setDialog(null);
    } finally {
      setBusy(false);
    }
  }
  async function restore(snapshot: Snapshot) {
    setBusy(true);
    try {
      const input = {
        snapshotId: snapshot.id,
        expectedRevision: head?.revision ?? 0,
      };
      const saved = await adapter.restore({
        ...input,
        requestId: requestId(JSON.stringify(input)),
      });
      setHead(saved);
      openDraft(saved.draft);
      setNotice("restored");
      setInspected(null);
      setDialog(null);
    } catch (e) {
      failedAction.current = { restore: snapshot };
      setError(e instanceof AdapterError ? e.code : "save");
      setDialog(null);
    } finally {
      setBusy(false);
    }
  }
  function retryFailure() {
    const action = failedAction.current;
    if (typeof action === "object")
      setDialog({ kind: "restore", snapshot: action.restore });
    else if (action === "history") void refreshHistory();
    else if (action === "load") {
      if (dirty) setDialog({ kind: "reopen" });
      else void reopen();
    } else void save();
  }
  const noticeText =
    notice &&
    {
      saved: t(
        `CV de bază v${head?.revision} salvat în memoria acestei pagini.`,
        `Base CV v${head?.revision} saved in this page’s memory.`,
      ),
      savedDraftKept: t(
        `Versiunea v${head?.revision} a fost salvată. Modificările mai noi rămân în ciornă, nesalvate.`,
        `Version v${head?.revision} was saved. Newer edits remain in the unsaved draft.`,
      ),
      newerDraftKept: t(
        "Ultima versiune a fost găsită. Ciorna mai nouă a fost păstrată.",
        "The latest version was found. Your newer draft was preserved.",
      ),
      restored: t(
        `Restaurat ca v${head?.revision}. Versiunile anterioare sunt păstrate în această sesiune.`,
        `Restored as v${head?.revision}. Earlier versions are preserved in this session.`,
      ),
      reopened: t(
        "Ultima versiune salvată în această sesiune a fost redeschisă.",
        "The latest version saved in this session has been reopened.",
      ),
      undone: t(
        "Ultima modificare din ciornă a fost anulată.",
        "The last draft change was undone.",
      ),
      noChange: t(
        "Conținut neschimbat. Nu s-a creat o versiune nouă.",
        "Content unchanged. No new version was created.",
      ),
    }[notice];
  const errorText =
    error &&
    (error === "conflict"
      ? t(
          "Versiunea salvată s-a schimbat. Ciorna ta este păstrată. Inspectează istoricul sau redeschide explicit ultima versiune.",
          "The saved version changed. Your draft is preserved. Inspect history or explicitly reopen the latest version.",
        )
      : error === "validation"
        ? t("Verifică informațiile marcate.", "Review the marked fields.")
        : t(
            "Acțiunea nu a reușit. Ciorna este păstrată. Reîncearcă sau revino în editor.",
            "The action failed. Your draft is preserved. Retry or return to the editor.",
          ));
  const nav = [
    { route: "home" as Route, label: t("Acasă", "Home"), Icon: Home },
    {
      route: "base" as Route,
      label: t("CV de bază", "Base CV"),
      Icon: FileText,
    },
    {
      route: "enrich" as Route,
      label: t("Îmbunătățește", "Improve"),
      Icon: MessageSquare,
    },
    {
      route: "jobs" as Route,
      label: t("Joburi", "Jobs"),
      Icon: BriefcaseBusiness,
    },
    { route: "account" as Route, label: t("Cont", "Account"), Icon: UserRound },
  ];
  const title = {
    home: t("Fiecare pas începe cu tine.", "Every next step starts with you."),
    start: t("Cum vrei să începi?", "How would you like to start?"),
    base: t("CV de bază", "Base CV"),
    review: t(
      "O bază mai clară pentru următorul pas",
      "A clearer Base for your next step",
    ),
    enrich: t("Povestește despre munca ta", "Tell us about your work"),
    history: t("Istoricul CV-ului de bază", "Base CV history"),
    jobs: t("Un CV potrivit fiecărui job", "A CV for each job"),
    account: t("Cont și salvare online", "Account and online saving"),
    missing: t("Pagina nu a fost găsită", "Page not found"),
  }[route];
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
            width="166"
            height="38"
          />
        </a>
        <div className="header-tools">
          <Pill>{t("Sesiune locală", "Local session")}</Pill>
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
        </div>
      </header>
      <div className="app-layout">
        <aside className="sidebar">
          <nav aria-label={t("Navigare principală", "Main navigation")}>
            {nav.map((n) => (
              <a
                key={n.route}
                href={`#${n.route}`}
                aria-current={
                  route === n.route ||
                  (n.route === "base" &&
                    ["review", "history", "start"].includes(route))
                    ? "page"
                    : undefined
                }
              >
                <n.Icon size={20} aria-hidden="true" />
                <span>{n.label}</span>
              </a>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="icon-tile">
              <Check size={20} />
            </span>
            <b>
              {t(
                "Experiența ta. În cuvintele tale.",
                "Your experience. Your words.",
              )}
            </b>
            <p>
              {t(
                "Nicio informație inventată. Tu alegi ce confirmi.",
                "No invented facts. You choose what to confirm.",
              )}
            </p>
          </div>
        </aside>
        <main id="main" ref={main} tabIndex={-1}>
          <div className="session-banner">
            {t(
              "Salvarea funcționează doar în memoria acestei pagini. Reîncărcarea sau închiderea șterge ciornele și versiunile. Folosește date fictive pentru această revizuire.",
              "Saving works only in this page’s memory. Reloading or closing clears drafts and versions. Use synthetic data for this review.",
            )}
          </div>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {t("Spațiul tău de lucru", "Your workspace")}
              </p>
              <h1>{title}</h1>
              {draft && ["base", "review", "enrich"].includes(route) && (
                <div className="pills">
                  <Pill>
                    {head
                      ? `v${head.revision} · ${t("salvat în sesiune", "saved in session")}`
                      : t("Ciornă nouă", "New draft")}
                  </Pill>
                  {dirty && (
                    <Pill tone="warn">
                      {t("Modificări nesalvate", "Unsaved changes")}
                    </Pill>
                  )}
                </div>
              )}
            </div>
            {draft && ["base", "review", "enrich"].includes(route) && (
              <div className="actions">
                <Button onClick={() => go("history")}>
                  <History size={16} />
                  {t("Istoric", "History")}
                </Button>
                <Button
                  onClick={() => go(route === "enrich" ? "base" : "enrich")}
                >
                  <MessageSquare size={16} />
                  {route === "enrich"
                    ? t("Editor", "Editor")
                    : t("Întrebări", "Questions")}
                </Button>
              </div>
            )}
          </div>
          <div role="status" className={noticeText ? "notice notice-good" : ""}>
            {noticeText}
          </div>
          {errorText && (
            <div role="alert" className="notice notice-error">
              {errorText}
              {error === "conflict" ? (
                <div className="actions">
                  <Button onClick={() => go("history")}>
                    {t("Inspectează istoricul", "Inspect history")}
                  </Button>
                  <Button onClick={() => setDialog({ kind: "reopen" })}>
                    {t("Redeschide ultima versiune", "Reopen latest version")}
                  </Button>
                </div>
              ) : (
                <Button onClick={retryFailure} disabled={busy}>
                  {t("Reîncearcă", "Retry")}
                </Button>
              )}
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
                  <div className="editor-toolbar">
                    <div className="segments">
                      <Button
                        aria-pressed={route === "base"}
                        onClick={() => go("base")}
                      >
                        {t("Editează", "Edit")}
                      </Button>
                      <Button
                        aria-pressed={route === "review"}
                        onClick={() => go("review")}
                      >
                        {t("Verificări", "Review")}
                      </Button>
                    </div>
                    <label>
                      {t("Limba CV-ului", "CV language")}
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
                        <option value="ro">Română</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                  </div>
                  <p className="small muted">
                    {t(
                      "Limba CV-ului schimbă etichetele documentului. Textul tău nu este tradus automat; revizuiește-l separat.",
                      "CV language changes document labels. Your text is not translated automatically; review it separately.",
                    )}
                  </p>
                  {issues.length > 0 && (
                    <div
                      className="notice notice-error"
                      role="alert"
                      ref={errors}
                      tabIndex={-1}
                    >
                      <b>
                        {t(
                          "Mai sunt informații de verificat.",
                          "Some facts still need review.",
                        )}
                      </b>
                      <p>{issueText(issues[0].code, t)}</p>
                      <Button onClick={() => focusIssue(issues)}>
                        {t("Mergi la primul câmp", "Go to first field")}
                      </Button>
                    </div>
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
                      <Sources draft={draft} />
                    </div>
                    <DocumentPreview draft={draft} asOf={asOf} />
                  </div>
                </>
              )}
              {draft && route === "enrich" && (
                <Enrichment
                  draft={draft}
                  change={change}
                  goEdit={() => go("base")}
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
                  <span className="icon-tile">
                    {route === "jobs" ? <BriefcaseBusiness /> : <UserRound />}
                  </span>
                  <h2>
                    {route === "missing"
                      ? t("Revino la spațiul tău", "Return to your workspace")
                      : t("În pregătire", "In preparation")}
                  </h2>
                  <p>
                    {route === "jobs"
                      ? t(
                          "Capturarea joburilor, adaptarea, scorurile și exportul nu sunt conectate. Poți continua construirea CV-ului de bază.",
                          "Job capture, tailoring, scores, and export are not connected. You can continue building your Base CV.",
                        )
                      : route === "account"
                        ? t(
                            "Autentificarea și baza de date nu sunt conectate. Nu există salvare în cloud sau sincronizare. Revizuirea locală nu necesită un cont.",
                            "Authentication and the database are not connected. Cloud saving and sync are unavailable. Local review requires no account.",
                          )
                        : t(
                            "Linkul nu corespunde unei pagini disponibile.",
                            "This link does not match an available page.",
                          )}
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => go(draft ? "base" : "start")}
                  >
                    {t("Continuă cu CV-ul de bază", "Continue with Base CV")}
                  </Button>
                </section>
              )}
              {draft && ["base", "review", "enrich"].includes(route) && (
                <footer className="save-bar">
                  <div>
                    <label className="check">
                      <input
                        id="truth"
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                      />
                      {t(
                        "Am verificat informațiile introduse și confirm exactitatea lor.",
                        "I reviewed the entered facts and confirm their accuracy.",
                      )}
                    </label>
                    <small>
                      {t(
                        "Salvarea păstrează o copie doar până la reîncărcarea paginii.",
                        "Saving keeps a copy only until this page reloads.",
                      )}
                    </small>
                  </div>
                  <div className="actions">
                    <Button
                      disabled={!past.length || busy}
                      onClick={() => {
                        generation.current++;
                        setDraft(clone(past.at(-1)!));
                        setPast((p) => p.slice(0, -1));
                        setAcknowledged(false);
                        setIssues([]);
                        setNotice("undone");
                      }}
                    >
                      <Undo2 size={16} />
                      {t("Anulează ultima modificare", "Undo last change")}
                    </Button>
                    <Button
                      variant="primary"
                      disabled={busy}
                      aria-busy={busy}
                      onClick={() => void save()}
                    >
                      <Save size={16} />
                      {busy
                        ? t("Se salvează…", "Saving…")
                        : t("Salvează în sesiune", "Save in session")}
                    </Button>
                  </div>
                </footer>
              )}
            </>
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
              : t("Înlocuiești ciorna deschisă?", "Replace the open draft?")
          }
          onClose={() => !busy && setDialog(null)}
        >
          <p>
            {dialog.kind === "restore"
              ? t(
                  "Se va crea o versiune nouă din această copie. Modificările nesalvate vor fi înlocuite. Istoricul rămâne intact în sesiune.",
                  "A new version will be created from this copy. Unsaved changes will be replaced. Session history stays intact.",
                )
              : t(
                  "Modificările nesalvate din ciorna curentă vor fi pierdute. Versiunile salvate în sesiune rămân în istoric.",
                  "Unsaved changes in the current draft will be lost. Session-saved versions stay in history.",
                )}
          </p>
          <div className="actions">
            <Button autoFocus disabled={busy} onClick={() => setDialog(null)}>
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
                ? t("Confirmă restaurarea", "Confirm restore")
                : t("Înlocuiește ciorna", "Replace draft")}
            </Button>
          </div>
        </Dialog>
      )}
    </LanguageContext>
  );
}
