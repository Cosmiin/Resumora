import { useContentLanguage } from "./components/useContentLanguage";
import { ContentLanguageControl } from "./components/ContentLanguageControl";
import { contentLocale } from "@resumora/contracts/editor/content-language";
import { ExperienceWorkspace } from "./components/GuidedExperience";
import { ImproveSkills } from "./components/ImproveSkills";
import { experienceTarget } from "@resumora/contracts/intelligence/experience";
import {
  ExperienceScoresContext,
  useProfileExperienceScores,
} from "./components/useProfileExperienceScores";
import { mergeExperienceScoreState } from "./base/experience";
import { WorkspaceAppShell } from "./workspace/AppShell";
import { WorkspaceContext } from "./workspace/context";
import { DocumentController } from "./workspace/document-controller";
import { ProfileOverview } from "./components/ProfileOverview";
import { ProfileStructure } from "./components/ProfileStructure";
import { LanguageVersions } from "./languages/LanguageVersions";
import { HttpLanguageCvAdapter } from "./languages/adapter";
import { AppearanceExport } from "./export/AppearanceExport";
import {
  confirmImported,
  pendingImportedCandidates,
} from "@resumora/contracts/editor/import";
import { ImportReview } from "./components/ImportReview";
import type { IntelligenceClient } from "./base/intelligence";
import type { CvPhoto } from "@resumora/contracts/editor/photo";
import { PhotoEditor } from "./photo/PhotoEditor";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  MoreHorizontal,
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
import { chooseTemplate } from "./templates/registry";
import { Editor } from "./components/Editor";
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
  accountActions,
}: {
  accountActions?: import("react").ReactNode;
  adapter?: BaseCvAdapter;
  intelligence?: IntelligenceClient;
  transport?: AuthTransport;
}) {
  return (
    <WorkspaceAppShell
      adapter={adapter}
      intelligence={intelligence}
      transport={transport}
      accountActions={accountActions}
    />
  );
}
export function CvEditor({
  uiLocale,
  onUiLocaleChange,
  switchLanguage,
  switchDocument,
  adapter,
  intelligence,
  transport,
  embedded = false,
  active = true,
  resourceKey = "profile",
  routeOverride,
  navigate,
  enrichTarget,
  onState,
  refreshKey,
  appearanceOnly = false,
  importId,
  onOpenImport,
}: {
  embedded?: boolean;
  active?: boolean;
  resourceKey?: string;
  routeOverride?: Route;
  navigate?: (route: Route, targetId?: string) => void;
  enrichTarget?: string;
  onState?: (state: {
    draft: BaseDraft | null;
    head: Snapshot | null | undefined;
    ready: boolean;
    dirty: boolean;
    error: string | null;
  }) => void;
  refreshKey?: string;
  appearanceOnly?: boolean;
  importId?: string;
  onOpenImport?: (id: string) => void;
  adapter: BaseCvAdapter;
  uiLocale: Locale;
  onUiLocaleChange: (locale: Locale) => void;
  switchLanguage?: (value: { locale: string; variantId?: string }) => void;
  switchDocument?: () => void;
  intelligence?: IntelligenceClient;
  transport?: AuthTransport;
}) {
  const registry = useContext(WorkspaceContext);
  const localController = useRef<DocumentController | null>(null);
  if (!localController.current)
    localController.current = new DocumentController();
  let controller = registry?.documents.get(resourceKey);
  if (!controller) {
    controller = localController.current;
    registry?.documents.set(resourceKey, controller);
    controller.subscribe(() => registry?.notify());
  }
  const documentController = controller;
  documentController.adapter = adapter;

  const languageMode = adapter instanceof HttpLanguageCvAdapter;
  const representationMode = languageMode;
  const durable = adapter.capability === "durable";
  const locale = uiLocale,
    setLocale = onUiLocaleChange,
    t = (ro: string, en: string) => (locale === "ro" ? ro : en);
  const [route, setRoute] = useState<Route>(
      () => routeOverride ?? (representationMode ? "base" : currentRoute()),
    ),
    [draft, setDraft] = useState<BaseDraft | null>(
      documentController.latest.current,
    ),
    [head, setHead] = useState<Snapshot | null | undefined>(
      documentController.head.current,
    );
  const [past, setPast] = useState<BaseDraft[]>([]),
    [undoFrom, setUndoFrom] = useState<BaseDraft | null>(null),
    [versions, setVersions] = useState<Snapshot[]>([]),
    [inspected, setInspected] = useState<Snapshot | null>(null);
  const [skillsImproving, setSkillsImproving] = useState(() =>
    documentController.profileChangesBlocked(),
  );
  const [skillsStartRequested, setSkillsStartRequested] = useState(false);
  const profileBlocked =
    skillsImproving || documentController.profileChangesBlocked();
  const [issues, setIssues] = useState<Issue[]>([]),
    [busy, setBusy] = useState(documentController.lock.current),
    [loading, setLoading] = useState(true),
    [loadAttempt, setLoadAttempt] = useState(0),
    [historyAttempt, setHistoryAttempt] = useState(0),
    [historyError, setHistoryError] = useState(false),
    [error, setError] = useState<string | null>(documentController.error),
    [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<
    | { kind: "replace"; next: BaseDraft }
    | { kind: "reopen" }
    | { kind: "restore"; snapshot: Snapshot }
    | { kind: "remove" }
    | null
  >(null);
  type RemovalInput = {
    requestId: string;
    expectedRevision: number;
    expectedGeneration: number;
  };
  const [removal, setRemoval] = useState<{
    input: RemovalInput;
    phase: "unknown" | "cleanup";
  } | null>(null);
  const removalBlocked = removal?.phase === "unknown";
  const documentEpoch = useRef(0),
    alive = useRef(true),
    removalChannel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      documentEpoch.current++;
    };
  }, []);
  const generation = documentController.generation,
    lock = documentController.lock,
    latest = documentController.latest,
    headRef = documentController.head,
    saveRef = useRef<() => void>(() => {}),
    main = useRef<HTMLElement>(null);
  const pendingWrite = documentController.pending;
  latest.current = draft;
  headRef.current = head;
  useEffect(() => {
    documentController.watchSkillReview();
  }, [documentController, draft?.skillReview?.operationId, draft?.skillReview?.expiresAt]);
  const [asOf] = useState(() => {
    const n = new Date();
    return {
      year: String(n.getUTCFullYear()),
      month: String(n.getUTCMonth() + 1),
    };
  });
  function matchesSavedDraft(saved: BaseDraft, current: BaseDraft) {
    return equalValues(saved, current);
  }
  const dirty = !!draft && (!head || !matchesSavedDraft(head.draft, draft));
  const pending = pendingWrite.current;
  const uncertainDraft =
    !!pending &&
    (pending.kind === "restore" || !equalValues(draft, pending.input.draft));
  const warnOnUnload = durable
    ? dirty || uncertainDraft || error === "conflict"
    : !!(draft || head);
  const profileWorkspace = embedded && !representationMode;
  const automaticScoresEnabled = !!(
    !profileBlocked &&
    active &&
    profileWorkspace &&
    draft &&
    intelligence?.experience &&
    !loading &&
    !removal &&
    !pendingImportedCandidates(draft).length &&
    ["base", "enrich"].includes(route)
  );
  const languageResolution = useContentLanguage({
    draft,
    saved: head,
    enabled: !!(
      active &&
      !loading &&
      !removal &&
      !dirty &&
      !busy &&
      !pendingWrite.current &&
      !error
    ),
    scope: documentController,
    change,
    request: intelligence?.detectLanguage,
  });
  const experienceScores = useProfileExperienceScores({
    draft,
    enabled: automaticScoresEnabled && languageResolution.ready,
    feedbackLocale: draft ? contentLocale(draft) : undefined,
    ready: !dirty && !busy && !error && !pendingWrite.current,
    priority: enrichTarget,
    change: (scored, roleId, kind) => {
      const current = latest.current;
      if (
        !current ||
        removalBlocked ||
        documentController.profileChangesBlocked()
      )
        return;
      const next = mergeExperienceScoreState(current, scored, roleId, kind);
      if (equalValues(next, current)) return;
      generation.current++;
      latest.current = next;
      setDraft(next);
    },
    request: intelligence?.experience
      ? async (context, recoverOnly) => {
          const saved = headRef.current;
          if (
            !saved ||
            (!recoverOnly && !equalValues(latest.current, saved.draft))
          )
            throw new Error("SAVE_REQUIRED");
          return intelligence.experience!(
            { ...context, snapshotId: saved.id, revision: saved.revision },
            recoverOnly,
          );
        }
      : undefined,
  });
  const PresentationSurface = profileWorkspace ? "details" : "div";
  const editing =
    !!draft && !removalBlocked && ["base", "enrich", "review"].includes(route);
  const go = useCallback(
    (next: Route) => {
      if (navigate) {
        navigate(next);
        return;
      }
      window.location.hash = next;
      setRoute(next);
    },
    [navigate],
  );
  useEffect(() => {
    if (routeOverride) setRoute(routeOverride);
  }, [routeOverride]);
  useEffect(
    () =>
      documentController.subscribe(() => {
        setDraft(documentController.latest.current);
        setHead(documentController.head.current);
        setBusy(documentController.lock.current);
        setSkillsImproving(documentController.profileChangesBlocked());
        setError(documentController.error);
      }),
    [documentController],
  );
  documentController.error = error;
  documentController.unsaved = dirty || !!pendingWrite.current;
  useEffect(() => {
    onState?.({
      draft,
      head,
      ready:
        !profileBlocked &&
        !dirty &&
        !busy &&
        !error &&
        !loading &&
        !pendingWrite.current,
      dirty,
      error,
    });
  }, [draft, head, dirty, busy, error, loading, profileBlocked]);
  useEffect(() => {
    if (embedded) return;
    const change = () => {
      const next = currentRoute();
      setRoute(
        languageMode && !["base", "history"].includes(next) ? "base" : next,
      );
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!draft || !["base", "enrich"].includes(route)) main.current?.focus();
  }, [route]);
  useEffect(() => {
    document.documentElement.lang = locale;
    if (!embedded) document.title = `Resumora · ${t("CV de bază", "Base CV")}`;
  }, [locale]);
  useEffect(() => {
    let cancelled = false;
    setLoading(!latest.current);
    void adapter
      .load()
      .then((s) => {
        if (!cancelled) {
          setHead(s);
          const cleanPrevious =
            !!latest.current &&
            !!headRef.current &&
            !pendingWrite.current &&
            matchesSavedDraft(headRef.current.draft, latest.current);
          if (s && (!latest.current || cleanPrevious))
            setDraft(
              representationMode ? clone(s.draft) : prepareDraft(s.draft),
            );

          setLoading(false);
          setError(
            s &&
              latest.current &&
              !cleanPrevious &&
              !matchesSavedDraft(s.draft, latest.current)
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
  }, [adapter, loadAttempt, refreshKey]);
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
  function change(next: BaseDraft, skillsReceipt = false) {
    if (
      removalBlocked ||
      (!skillsReceipt && documentController.profileChangesBlocked())
    )
      return;
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
  async function commitPhoto(photo: CvPhoto | null, expected: CvPhoto | null) {
    if (documentController.profileChangesBlocked()) return false;
    // Merge against the latest text/presentation, not a closure captured before upload.
    // An unresolved save must be reconciled by the existing coordinator first.
    const current = latest.current;
    if (
      !current ||
      lock.current ||
      pendingWrite.current ||
      headRef.current === undefined ||
      error === "conflict"
    )
      return false;
    if (
      !equalValues(current.presentation.photo ?? null, expected) &&
      !equalValues(current.presentation.photo ?? null, photo)
    )
      return false;
    change({ ...current, presentation: { ...current.presentation, photo } });
    await save("autosave");
    return (
      !pendingWrite.current &&
      equalValues(headRef.current?.draft.presentation.photo ?? null, photo)
    );
  }
  function openDraft(next: BaseDraft) {
    if (removalBlocked || documentController.profileChangesBlocked()) return;
    generation.current++;
    const ready = representationMode ? clone(next) : prepareDraft(next);
    latest.current = ready;
    setDraft(ready);
    setPast([]);
    setIssues([]);
    if (headRef.current !== undefined && !pendingWrite.current) setError(null);
    setNotice("");
    go("base");
  }
  function start(next: BaseDraft) {
    if (documentController.profileChangesBlocked()) return;
    if (draft && dirty) setDialog({ kind: "replace", next });
    else openDraft(next);
  }
  async function save(mode: "autosave" | "checkpoint" = "checkpoint") {
    const current = latest.current;
    if (
      !current ||
      removalBlocked ||
      headRef.current === undefined ||
      lock.current ||
      pendingWrite.current
    )
      return;
    if (mode === "checkpoint" && !representationMode) {
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
        expectedRevision:
          headRef.current?.revision ?? adapter.lifecycle?.().revision ?? 0,
        mode,
        requestId: crypto.randomUUID(),
      },
    };
    await submitPendingWrite();
  }
  async function submitPendingWrite() {
    const result = await documentController.submit(adapter);
    if (!alive.current || !result) return;
    const { operation, saved } = result;
    if (saved) {
      if (
        operation.kind === "restore" &&
        operation.generation === generation.current
      ) {
        openDraft(saved.draft);
        setInspected(null);
        setDialog(null);
      } else if (
        operation.kind === "save" &&
        operation.input.mode !== "autosave"
      )
        setNotice(t("Salvat în cont.", "Saved to your account."));
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
          ? matchesSavedDraft(saved.draft, operation.input.draft)
          : saved.restoredFrom === operation.input.snapshotId);
      if (!unchanged && !applied) {
        pendingWrite.current = null;
        setError("conflict");
        return;
      }
      if (!documentController.acceptReconciledWrite(operation, saved, applied))
        return;
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
      if (active && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active]);
  useEffect(() => {
    if (
      !dirty ||
      !draft ||
      busy ||
      loading ||
      error ||
      pendingWrite.current ||
      removalBlocked
    )
      return;
    const timer = setTimeout(() => {
      void save("autosave");
    }, 650);
    return () => clearTimeout(timer);
  }, [draft, dirty, busy, loading, error, removalBlocked]);
  function discardRemovedDraft(saved: Snapshot | null = null) {
    registry?.clearProfile();
    documentEpoch.current++;
    generation.current++;
    pendingWrite.current = null;
    latest.current = saved?.draft ?? null;
    headRef.current = saved;
    setDraft(saved?.draft ?? null);
    setHead(saved);
    setPast([]);
    setUndoFrom(null);
    setVersions([]);
    setInspected(null);
    setIssues([]);
    setHistoryError(false);
    setError(null);
    lock.current = false;
    setBusy(false);
    go("base");
  }
  async function removeBase(input?: RemovalInput) {
    if (documentController.profileChangesBlocked()) return;
    if (!adapter.remove || lock.current || pendingWrite.current) return;
    const state = adapter.lifecycle?.();
    const operation = input ?? {
      requestId: crypto.randomUUID(),
      expectedRevision: headRef.current?.revision ?? state?.revision ?? 0,
      expectedGeneration: state?.generation ?? 0,
    };
    lock.current = true;
    setBusy(true);
    const epoch = documentEpoch.current;
    try {
      const result = await adapter.remove(operation);
      if (!alive.current || epoch !== documentEpoch.current) return;
      discardRemovedDraft();
      setDialog(null);
      setRemoval(
        result.cleanupPending ? { input: operation, phase: "cleanup" } : null,
      );
      setNotice(
        result.cleanupPending
          ? t(
              "CV-ul de bază a fost eliminat. Ștergerea fișierelor nu este încă finalizată.",
              "Base CV removed. Source file deletion is not complete yet.",
            )
          : t(
              "CV-ul de bază, istoricul și contextul au fost eliminate.",
              "Base CV, history and context removed.",
            ),
      );
      removalChannel.current?.postMessage("base-state-changed");
    } catch (e) {
      if (!alive.current || epoch !== documentEpoch.current) return;
      setDialog(null);
      if (e instanceof AdapterError) {
        setRemoval(null);
        setNotice(
          t(
            "Eliminarea nu a fost efectuată. Redeschide starea salvată înainte de a reîncerca.",
            "Nothing was removed. Reopen saved state before trying again.",
          ),
        );
      } else setRemoval({ input: operation, phase: "unknown" });
    } finally {
      if (alive.current && epoch === documentEpoch.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function retryRemovedSourceCleanup() {
    if (!adapter.cleanup || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const state = await adapter.cleanup();
      if (!alive.current) return;
      if (!state.cleanupPending) setRemoval(null);
      setNotice(
        state.cleanupPending
          ? t(
              "Ștergerea fișierelor sursă nu este încă finalizată. Poți reîncerca.",
              "Source file deletion is not complete yet. You can retry.",
            )
          : t("Fișierele sursă au fost șterse.", "Source files deleted."),
      );
    } catch {
      if (alive.current)
        setNotice(
          t(
            "Ștergerea fișierelor nu este confirmată. Reîncearcă aceeași curățare.",
            "Source file deletion is unconfirmed. Retry cleanup.",
          ),
        );
    } finally {
      if (alive.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    if (!adapter.lifecycle) return;
    let disposed = false;
    const inspect = async () => {
      const before = adapter.lifecycle!().generation;
      try {
        const saved = await adapter.load();
        if (
          !disposed &&
          alive.current &&
          adapter.lifecycle!().generation > before
        ) {
          discardRemovedDraft(saved);
          setRemoval(null);
          setNotice(
            t(
              "CV-ul de bază a fost eliminat într-o altă filă. Starea curentă a fost redeschisă.",
              "Base CV was removed in another tab. Current saved state reopened.",
            ),
          );
        }
      } catch {
        /* Keep local state; server CAS remains authoritative. */
      }
    };
    const focus = () => {
      void inspect();
    };
    window.addEventListener("focus", focus);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("resumora-base-state");
      removalChannel.current = channel;
      channel.onmessage = focus; // Signal only; each tab rechecks its own authenticated scope.
    }
    return () => {
      disposed = true;
      window.removeEventListener("focus", focus);
      removalChannel.current?.close();
      removalChannel.current = null;
    };
  }, [adapter, false]);
  async function reopen() {
    if (documentController.profileChangesBlocked()) return;
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
    if (documentController.profileChangesBlocked()) return;
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
  async function ensureCheckpoint() {
    if (pendingWrite.current) await submitPendingWrite();
    if (pendingWrite.current || documentController.error)
      throw Error("unresolvedSave");
    if (!latest.current) throw Error("missingDocument");
    if (
      !headRef.current ||
      !matchesSavedDraft(headRef.current.draft, latest.current)
    )
      await save("autosave");
    if (pendingWrite.current || documentController.error || !headRef.current)
      throw Error("unresolvedSave");
    {
      const found = validateDraft(latest.current!);
      if (found.length) {
        setIssues(found);
        go("base");
        focusField(found[0].field);
        throw Error("validation");
      }
      if (headRef.current.reason === "autosave") await save("checkpoint");
    }
    if (pendingWrite.current || documentController.error || !headRef.current)
      throw Error("unresolvedSave");
    return headRef.current;
  }
  async function exportPin(): Promise<
    import("./export/AppearanceExport").ExportPin
  > {
    const saved = await ensureCheckpoint();

    return {
      kind: "base",
      ...(languageMode ? { variantId: adapter.variantId } : {}),
      versionId: saved.id,
      revision: saved.revision,
    };
  }
  const renderEnrichment = (targetId: string) =>
    draft ? (
      profileWorkspace && targetId === "__improve_skills" ? (
        <ImproveSkills
          draft={draft}
          change={(next) => change(next, true)}
          onActivityChange={documentController.setSkillsImproving}
          onTimeout={documentController.discardSkillReview}
          timedOutOperationId={documentController.skillTimeoutId}
          startRequested={skillsStartRequested}
          onStartConsumed={() => setSkillsStartRequested(false)}
          ready={
            languageResolution.ready &&
            !dirty &&
            !busy &&
            !error &&
            !pendingWrite.current
          }
          saveFailed={!!error}
          snapshot={head ?? undefined}
          request={async (context, recoverOnly, signal) => {
            if (!intelligence?.improveSkills) throw Error("AI_DISABLED");
            return intelligence.improveSkills(context, recoverOnly, signal);
          }}
          commit={(identity, inventory) =>
            documentController.commitSkillInventory(
              adapter,
              identity,
              inventory,
              { retryTransient: true },
            )
          }
          undo={() =>
            documentController.undoSkillInventory(adapter, {
              retryTransient: true,
            })
          }
          canUndo={documentController.canUndoSkillInventory()}
          retrySaveAutomatically={
            error === "save" && !busy && !!pendingWrite.current
          }
          retrySave={
            pendingWrite.current
              ? () => {
                  if (pendingWrite.current?.expired)
                    void reconcilePendingWrite();
                  else void submitPendingWrite();
                }
              : undefined
          }
        />
      ) : profileWorkspace &&
        (targetId === "__skills" ||
          (intelligence?.experience && experienceTarget(draft, targetId))) ? (
        <ExperienceWorkspace
          key={targetId}
          draft={draft}
          targetId={targetId}
          change={change}
          ready={
            languageResolution.ready &&
            !dirty &&
            !busy &&
            !error &&
            !pendingWrite.current
          }
          saveFailed={!!error}
          retrySave={
            pendingWrite.current
              ? () => {
                  if (pendingWrite.current?.expired)
                    void reconcilePendingWrite();
                  else void submitPendingWrite();
                }
              : undefined
          }
          transcribe={
            intelligence?.transcribe
              ? async (audio, signal) => {
                  const saved = headRef.current;
                  if (!saved) throw new Error("SAVE_REQUIRED");
                  return intelligence.transcribe!(
                    {
                      snapshotId: saved.id,
                      revision: saved.revision,
                      targetId,
                      operationId: crypto.randomUUID(),
                    },
                    audio,
                    signal,
                  );
                }
              : undefined
          }
          request={async (context, recoverOnly, onDraft) => {
            if (!intelligence?.experience) throw new Error("AI_DISABLED");
            const saved = headRef.current;
            if (
              !saved ||
              (!recoverOnly && !equalValues(latest.current, saved.draft))
            )
              throw new Error("SAVE_REQUIRED");
            return intelligence.experience!(
              { ...context, snapshotId: saved.id, revision: saved.revision },
              recoverOnly,
              onDraft,
            );
          }}
        />
      ) : (
        <Enrichment
          autoStart={profileWorkspace}
          embedded={embedded}
          selectedTargetId={embedded ? targetId : undefined}
          transport={transport}
          snapshot={head ?? null}
          ready={
            languageResolution.ready &&
            !dirty &&
            !busy &&
            !error &&
            !pendingWrite.current
          }
          durable={durable}
          saveFailed={!!error}
          retrySave={
            pendingWrite.current
              ? () => {
                  if (pendingWrite.current?.expired)
                    void reconcilePendingWrite();
                  else void submitPendingWrite();
                }
              : undefined
          }
          rewriteRole={
            intelligence
              ? async (targetId, purpose) => {
                  const saved = headRef.current;
                  if (!saved || !equalValues(latest.current, saved.draft))
                    throw new Error("SAVE_REQUIRED");
                  const started = generation.current;
                  const result = await intelligence.rewrite({
                    snapshotId: saved.id,
                    revision: saved.revision,
                    targetId,
                    ...(purpose ? { purpose } : {}),
                    operationId: crypto.randomUUID(),
                  });
                  if (started !== generation.current) throw new Error("STALE");
                  return result;
                }
              : undefined
          }
          prepareQuestions={
            intelligence
              ? async (targetId) => {
                  const saved = headRef.current;
                  if (!saved || !equalValues(latest.current, saved.draft))
                    throw new Error("SAVE_REQUIRED");
                  const started = generation.current;
                  const result = await intelligence.questions({
                    snapshotId: saved.id,
                    revision: saved.revision,
                    targetId,
                    operationId: crypto.randomUUID(),
                  });
                  if (started !== generation.current) throw new Error("STALE");
                  return result;
                }
              : undefined
          }
          draft={draft}
          undoFrom={undoFrom}
          change={change}
          goEdit={() => go("base")}
          asOf={asOf}
        />
      )
    ) : null;
  const nav = [
    { route: "home", label: t("Acasă", "Home"), Icon: Home },
    {
      route: "base",
      label: t("CV de bază", "Base CV"),
      Icon: FileText,
    },
    {
      route: "enrich",
      label: t("Îmbunătățește", "Improve"),
      Icon: MessageSquare,
    },
    { route: "account", label: t("Cont", "Account"), Icon: UserRound },
  ];
  const editingTitle =
    route === "enrich"
      ? t("Mai mult context, pas cu pas", "More context, one step at a time")
      : t("CV-ul tău de bază", "Your Base CV");
  const MainSurface = embedded ? "section" : "main";
  if (!active) return null;
  return (
    <LanguageContext value={locale}>
      <ExperienceScoresContext
        value={automaticScoresEnabled ? experienceScores : null}
      >
        {!embedded && (
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
        )}
        {!embedded && (
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
            </div>
          </header>
        )}
        <div
          className={`app-layout ${embedded ? "document-controller-layout" : ""}`}
        >
          {!embedded && (
            <aside className="sidebar">
              <nav aria-label={t("Navigare principală", "Main navigation")}>
                {nav
                  .filter(
                    (n) =>
                      !representationMode ||
                      n.route === "base" ||
                      (languageMode && n.route === "history"),
                  )
                  .map((n) => (
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
          )}
          <MainSurface
            id="main"
            ref={main}
            tabIndex={embedded ? undefined : -1}
            className={editing ? "editing-page" : ""}
          >
            {languageMode && (
              <section className="notice">
                <p>
                  {t(
                    "Versiune de limbă independentă. CV-ul de bază sursă rămâne neschimbat.",
                    "Independent language copy. The source Base CV remains unchanged.",
                  )}
                </p>
                <Button
                  disabled={dirty || busy || !!pendingWrite.current}
                  onClick={() => switchLanguage?.({ locale: "" })}
                >
                  {t("Înapoi la CV-ul de bază", "Return to Base CV")}
                </Button>
              </section>
            )}
            {false}
            {draft && !representationMode && (
              <ContentLanguageControl
                draft={draft}
                change={change}
                disabled={
                  profileBlocked || busy || !!removal || !!pendingWrite.current
                }
              />
            )}
            {languageResolution.error && (
              <p role="status">
                {languageResolution.error === "CONTENT_LANGUAGE_INSUFFICIENT"
                  ? t(
                      "Adaugă sau clarifică descrierea activităților tale, apoi salvează. Vom verifica din nou limba înainte de recomandări AI.",
                      "Add or clarify the description of your work, then save. We will check the language again before AI guidance.",
                    )
                  : t(
                      "Limba conținutului nu a putut fi verificată.",
                      "The content language could not be verified.",
                    )}{" "}
                {languageResolution.error !==
                  "CONTENT_LANGUAGE_INSUFFICIENT" && (
                  <Button
                    disabled={
                      !languageResolution.canRetry || languageResolution.working
                    }
                    onClick={languageResolution.retry}
                  >
                    {t(
                      "Reîncearcă verificarea limbii",
                      "Retry language detection",
                    )}
                  </Button>
                )}
              </p>
            )}
            <div className="page-heading">
              <h1 hidden={embedded && ["base", "start"].includes(route)}>
                {editing
                  ? editingTitle
                  : route === "history"
                    ? durable
                      ? t("Istoric", "History")
                      : t("Istoric în sesiune", "Session history")
                    : route === "start" && draft
                      ? t("Actualizează profilul", "Update your profile")
                      : "Resumora"}
              </h1>
              {editing && (
                <details
                  className={
                    profileWorkspace
                      ? "profile-tools-menu"
                      : "editor-tools-menu"
                  }
                >
                  <summary aria-label={t("Opțiuni profil", "Profile options")}>
                    <MoreHorizontal size={22} />
                    <span className="sr-only">
                      {t("Opțiuni profil", "Profile options")}
                    </span>
                  </summary>
                  <div className="actions">
                    {!representationMode &&
                      route === "base" &&
                      adapter.remove && (
                        <Button
                          disabled={
                            profileBlocked ||
                            busy ||
                            loading ||
                            !!pendingWrite.current
                          }
                          onClick={() => setDialog({ kind: "remove" })}
                        >
                          {t("Elimină CV-ul de bază", "Remove Base CV")}
                        </Button>
                      )}
                    {
                      <Button
                        disabled={profileBlocked}
                        onClick={() => go("history")}
                      >
                        <History size={16} />
                        {t("Istoric", "History")}
                      </Button>
                    }
                    {!representationMode && !embedded && (
                      <Button
                        onClick={() =>
                          go(route === "enrich" ? "base" : "enrich")
                        }
                      >
                        {route === "enrich"
                          ? t("Editor", "Editor")
                          : t("Întrebări", "Questions")}
                      </Button>
                    )}
                  </div>
                </details>
              )}
              {!representationMode && route === "start" && draft && (
                <Button onClick={() => go("base")}>
                  {t("Înapoi la CV-ul de bază", "Return to Base CV")}
                </Button>
              )}
            </div>
            {error &&
              !(
                profileWorkspace &&
                registry &&
                pendingWrite.current &&
                !pendingWrite.current.expired &&
                error !== "conflict"
              ) && (
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
                  {false}
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

            {removalBlocked ? (
              <section className="card" role="alert">
                <h2>
                  {t(
                    "Eliminarea nu este confirmată",
                    "Removal is not confirmed",
                  )}
                </h2>
                <p>
                  {t(
                    "Păstrăm ciorna fără a o salva din nou. Reîncearcă aceeași operațiune pentru a verifica rezultatul.",
                    "Your draft is retained without saving it again. Retry the same operation to check its outcome.",
                  )}
                </p>
                <Button
                  disabled={busy}
                  onClick={() => void removeBase(removal.input)}
                >
                  {t("Verifică eliminarea", "Check removal")}
                </Button>
              </section>
            ) : loading ? (
              <p role="status">
                {t("Deschidem sesiunea…", "Opening session…")}
              </p>
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
                    openImportId={importId}
                    onOpenImport={onOpenImport}
                    start={start}
                    intelligence={intelligence}
                    profile={draft}
                    updatesDisabled={
                      busy || dirty || !!error || !!pendingWrite.current
                    }
                    applyUpdate={(next, original) => {
                      if (
                        removalBlocked ||
                        lock.current ||
                        pendingWrite.current ||
                        error ||
                        headRef.current === undefined ||
                        !equalValues(latest.current, original)
                      )
                        return false;
                      change(prepareDraft(next));
                      go("base");
                      return true;
                    }}
                    revision={
                      head?.revision ?? adapter.lifecycle?.().revision ?? 0
                    }
                  />
                )}
                {draft && ["base", "review"].includes(route) && (
                  <>
                    {!!issues.length && (
                      <p role="alert" className="notice notice-error">
                        {issueText(issues[0].code, t)}
                      </p>
                    )}
                    {!representationMode && draft.importReview && (
                      <ImportReview
                        key={draft.importReview.id}
                        forceOverview={
                          profileWorkspace &&
                          !!pendingImportedCandidates(draft).length
                        }
                        draft={draft}
                        client={intelligence}
                        change={change}
                        disabled={
                          profileBlocked ||
                          busy ||
                          !!pendingWrite.current ||
                          head === undefined
                        }
                        confirm={(ids) => {
                          const next = confirmImported(latest.current!, ids);
                          change(next);
                          void save("autosave");
                        }}
                      />
                    )}
                    {(representationMode ||
                      !draft.importReview ||
                      !pendingImportedCandidates(draft).length) && (
                      <div
                        className={`editor-layout ${profileWorkspace ? "profile-document-layout" : ""} ${appearanceOnly ? "appearance-only" : ""}`}
                      >
                        <div className="document-edit-pane">
                          {route === "base" ? (
                            <ProfileOverviewWrapper
                              enabled={embedded && !representationMode}
                              draft={draft}
                              change={change}
                              asOf={asOf}
                              enrichTarget={enrichTarget}
                              skillsImproving={profileBlocked}
                              aiReady={
                                languageResolution.ready &&
                                !dirty &&
                                !busy &&
                                !error &&
                                !pendingWrite.current
                              }
                              summarize={
                                intelligence
                                  ? async (targetId) => {
                                      const saved = headRef.current;
                                      if (
                                        !saved ||
                                        !equalValues(
                                          latest.current,
                                          saved.draft,
                                        )
                                      )
                                        throw new Error("SAVE_REQUIRED");
                                      return intelligence.rewrite({
                                        snapshotId: saved.id,
                                        revision: saved.revision,
                                        targetId,
                                        purpose: "summary",
                                        operationId: crypto.randomUUID(),
                                      });
                                    }
                                  : undefined
                              }
                              enrich={renderEnrichment}
                              openEnrichment={(id) => {
                                if (documentController.profileChangesBlocked())
                                  return;
                                if (id === "__improve_skills") {
                                  if (
                                    !languageResolution.ready ||
                                    dirty ||
                                    busy ||
                                    error ||
                                    pendingWrite.current
                                  )
                                    return;
                                  documentController.setSkillsImproving(true);
                                  setSkillsStartRequested(true);
                                }
                                navigate?.("enrich", id);
                              }}
                              closeEnrichment={() => navigate?.("base")}
                            >
                              <Editor
                                draft={draft}
                                issues={issues}
                                change={change}
                                photoEditor={
                                  <PhotoEditor
                                    value={draft.presentation.photo}
                                    commit={commitPhoto}
                                  />
                                }
                              />
                            </ProfileOverviewWrapper>
                          ) : (
                            <Review
                              draft={draft}
                              edit={() => go("base")}
                              enrich={() => go("enrich")}
                            />
                          )}
                        </div>
                        <PresentationSurface
                          className={
                            profileWorkspace
                              ? "profile-presentation-options"
                              : "document-preview-pane"
                          }
                        >
                          {profileWorkspace && (
                            <summary>
                              {t(
                                "Aspect, limbă și export",
                                "Appearance, language & export",
                              )}
                            </summary>
                          )}
                          <fieldset
                            disabled={profileBlocked}
                            className="profile-edit-lock"
                          >
                            {profileWorkspace && (
                              <>
                                <PhotoEditor
                                  value={draft.presentation.photo}
                                  commit={commitPhoto}
                                />
                                <ProfileStructure
                                  draft={draft}
                                  change={change}
                                />
                              </>
                            )}
                            <div
                              className="document-appearance-controls"
                              hidden={
                                embedded &&
                                !appearanceOnly &&
                                representationMode
                              }
                            >
                              {transport && switchLanguage && head && (
                                <LanguageVersions
                                  transport={transport}

                                  currentLocale={contentLocale(draft)}
                                  ready={
                                    !dirty &&
                                    !busy &&
                                    !error &&
                                    !pendingWrite.current
                                  }
                                  revisionKey={`${head.id}:${head.revision}`}
                                  open={switchLanguage}
                                />
                              )}
                              <AppearanceExport
                                ensurePin={exportPin}
                                draft={draft}
                                snapshot={head ?? null}
                                ready={
                                  !dirty &&
                                  !busy &&
                                  !error &&
                                  !pendingWrite.current
                                }
                                transport={transport}
                                change={change}
                                asOf={asOf}
                                pin={
                                  head
                                    ? {
                                        kind: "base",
                                        ...(languageMode
                                          ? { variantId: adapter.variantId }
                                          : {}),
                                        versionId: head.id,
                                        revision: head.revision,
                                      }
                                    : null
                                }
                              />
                            </div>
                            <DocumentPreview
                              livePreview
                              draft={draft}
                              asOf={asOf}
                              onTemplateChange={(versionId) =>
                                change(chooseTemplate(draft, versionId))
                              }
                              onEdit={(id) => {
                                go("base");
                                focusField(id);
                              }}
                            />
                          </fieldset>
                        </PresentationSurface>
                      </div>
                    )}
                  </>
                )}
                {draft &&
                  !representationMode &&
                  route === "enrich" &&
                  renderEnrichment(enrichTarget ?? draft.roles[0]?.id ?? "")}
                {route === "history" && draft && (
                  <Button
                    disabled={profileBlocked || busy || !!pendingWrite.current}
                    onClick={() => void save("checkpoint")}
                  >
                    {t("Creează un punct de restaurare", "Create a checkpoint")}
                  </Button>
                )}
                {route === "history" && (
                  <HistoryScreen
                    durable={durable}
                    draft={!!draft}
                    versions={versions}
                    head={head ?? null}
                    inspected={inspected}
                    setInspected={setInspected}
                    restore={(snapshot) => {
                      if (!documentController.profileChangesBlocked())
                        setDialog({ kind: "restore", snapshot });
                    }}
                    go={go}
                    asOf={asOf}
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
              <footer
                className={`save-bar ${profileWorkspace ? "profile-save-status" : ""}`}
              >
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
                    {head && !profileWorkspace ? ` · v${head.revision}` : ""}
                  </p>
                  <small>
                    {durable
                      ? error || dirty || busy
                        ? t(
                            "Modificările nesalvate sunt păstrate în această pagină.",
                            "Unsaved changes remain in this tab.",
                          )
                        : t(
                            "Salvare online în contul tău",
                            "Saved online to your account",
                          )
                      : t(
                          "Doar memoria paginii · reîncărcarea șterge datele",
                          "Page memory only · reloading clears data",
                        )}
                  </small>
                </div>
                <div className="actions">
                  <Button
                    aria-label={t(
                      "Anulează ultima modificare",
                      "Undo last change",
                    )}
                    disabled={profileBlocked || !past.length}
                    onClick={() => {
                      if (documentController.profileChangesBlocked()) return;
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
                  {!embedded && (
                    <Button
                      variant="primary"
                      disabled={profileBlocked || busy}
                      onClick={() => void save()}
                    >
                      {t("Salvează acum", "Save now")}
                    </Button>
                  )}
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
            {!!notice && (
              <p role="status" className="notice">
                {notice}
              </p>
            )}
            {(removal?.phase === "cleanup" ||
              adapter.lifecycle?.().cleanupPending) &&
              adapter.cleanup && (
                <Button
                  disabled={busy}
                  onClick={() => void retryRemovedSourceCleanup()}
                >
                  {t(
                    "Reîncearcă ștergerea fișierelor sursă",
                    "Retry source file deletion",
                  )}
                </Button>
              )}
          </MainSurface>
        </div>
        {dialog && (
          <Dialog
            title={
              dialog.kind === "remove"
                ? t(
                    "Elimini definitiv CV-ul de bază?",
                    "Permanently remove Base CV?",
                  )
                : dialog.kind === "restore"
                  ? t(
                      `Restaurezi v${dialog.snapshot.revision}?`,
                      `Restore v${dialog.snapshot.revision}?`,
                    )
                  : t("Înlocuiești ciorna?", "Replace draft?")
            }
            onClose={() => !busy && setDialog(null)}
          >
            <p>
              {dialog.kind === "remove"
                ? t(
                    "CV-ul de bază, versiunile, contextul, răspunsurile, variantele de limbă, documentele încărcate, ciornele legate de profil vor fi șterse. Această acțiune nu poate fi anulată.",
                    "Your Base CV, versions, context, answers, language copies, uploaded documents, profile-linked drafts will be deleted. This cannot be undone.",
                  )
                : durable
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
                  } else if (dialog.kind === "remove") void removeBase();
                  else if (dialog.kind === "reopen") void reopen();
                  else void restore(dialog.snapshot);
                }}
              >
                {dialog.kind === "remove"
                  ? t(
                      "Elimină definitiv CV-ul de bază",
                      "Permanently remove Base CV",
                    )
                  : dialog.kind === "restore"
                    ? t("Restaurează versiunea", "Restore version")
                    : t("Înlocuiește ciorna", "Replace draft")}
              </Button>
            </div>
          </Dialog>
        )}
      </ExperienceScoresContext>
    </LanguageContext>
  );
}

function ProfileOverviewWrapper({
  enabled,
  children,
  ...props
}: { enabled: boolean; children: import("react").ReactNode } & Omit<
  Parameters<typeof ProfileOverview>[0],
  "editor"
>) {
  return enabled ? (
    <ProfileOverview {...props} editor={children} />
  ) : (
    <>{children}</>
  );
}
