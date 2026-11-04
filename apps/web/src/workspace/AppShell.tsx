import { contentLocale } from "@resumora/contracts/editor/content-language";
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { FileText, BriefcaseBusiness, UserRound } from "lucide-react";
import { CvEditor } from "../App";
import type { BaseCvAdapter, Snapshot } from "../base/adapter";
import type { BaseDraft, Locale } from "../base/model";
import type { IntelligenceClient } from "../base/intelligence";
import type { AuthTransport } from "../auth/AuthShell";
import { pendingImportedCandidates } from "@resumora/contracts/editor/import";
import {
  documentLocaleKey,
  workspaceLocation,
  type Route,
} from "../base/routes";
import { HttpJobCvAdapter } from "../base/job-adapter";
import { HttpLanguageCvAdapter } from "../languages/adapter";
import { languageClient } from "../languages/client";
import { Button, LanguageContext } from "../components/ui";
import { JobsWorkspace } from "../components/JobsWorkspace";
import {
  WorkspaceContext,
  WorkspaceProvider,
  WorkspaceRecovery,
} from "./context";
import {
  resumeId,
  type WorkspaceDraft,
} from "@resumora/contracts/editor/workspace";

type Props = {
  adapter: BaseCvAdapter;
  intelligence?: IntelligenceClient;
  transport?: AuthTransport;
  accountActions?: ReactNode;
};
export function WorkspaceAppShell(props: Props) {
  const parent = useContext(WorkspaceContext);
  return parent ? (
    <Shell {...props} />
  ) : (
    <WorkspaceProvider transport={props.transport}>
      <Shell {...props} />
    </WorkspaceProvider>
  );
}
function Shell({ adapter, intelligence, transport, accountActions }: Props) {
  const registry = useContext(WorkspaceContext)!;
  useSyncExternalStore(
    registry.subscribe,
    registry.snapshot,
    registry.snapshot,
  );
  const [resumeReady, setResumeReady] = useState(
    () =>
      !(
        (!window.location.hash && transport) ||
        (intelligence?.pendingImport &&
          workspaceLocation(window.location.hash).view === "profile")
      ),
  );
  const [location, setLocation] = useState(() =>
      workspaceLocation(window.location.hash),
    ),
    [uiLocale, setUiLocale] = useState<Locale>("ro");
  const [profile, setProfile] = useState<{
    draft: BaseDraft | null;
    head: Snapshot | null | undefined;
    ready: boolean;
    dirty: boolean;
    error: string | null;
  }>({ draft: null, head: undefined, ready: false, dirty: false, error: null });
  const [panes, setPanes] = useState<
      {
        key: string;
        adapter: BaseCvAdapter;
        label?: string;
        refreshKey: string;
        language?: boolean;
      }[]
    >([]),
    [message, setMessage] = useState(""),
    [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const t = (ro: string, en: string) => (uiLocale === "ro" ? ro : en);
  useEffect(() => {
    if (location.view === "job") return;
    const label =
      location.view === "intake"
        ? t("Adaugă un job", "Add a job")
        : location.destination === "jobs"
          ? t("Joburile mele", "My Jobs")
          : location.view === "history"
            ? t("Istoricul profilului", "Profile history")
            : location.view === "import"
              ? t("Importă un CV", "Import a CV")
              : t("Profilul meu", "My Profile");
    document.title = `${label} · Resumora`;
  }, [location.canonical, uiLocale]);
  useEffect(() => {
    if (profile.draft?.skillReview && location.canonical !== "#/profile/enrich/__improve_skills") {
      window.location.hash = "#/profile/enrich/__improve_skills";
      setLocation(workspaceLocation("#/profile/enrich/__improve_skills"));
    }
  }, [profile.draft?.skillReview?.operationId, location.canonical]);
  const initialHash = useRef(window.location.hash);
  const navigationVersion = useRef(0);
  const navigate = useCallback((route: string) => {
    if (registry.documents.get("profile")?.profileChangesBlocked() &&
      route !== "#/profile/enrich/__improve_skills") return;
    navigationVersion.current++;
    window.location.hash = route.replace(/^#/, "");
    setLocation(workspaceLocation(route));
  }, []);
  useEffect(() => {
    const change = () => {
      navigationVersion.current++;
      const blocked = registry.documents.get("profile")?.profileChangesBlocked();
      const next = workspaceLocation(blocked ? "#/profile/enrich/__improve_skills" : window.location.hash);
      setLocation(next);
      if (window.location.hash !== next.canonical)
        window.history.replaceState(null, "", next.canonical);
    };
    window.addEventListener("hashchange", change);
    change();
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    const rootProfile =
      workspaceLocation(initialHash.current).view === "profile";
    const checkPending = !!intelligence?.pendingImport && rootProfile;
    const checkResume = !!transport && !initialHash.current;
    if (!checkPending && !checkResume) return;
    let active = true;
    const version = navigationVersion.current,
      controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(Error("aborted")),
        { once: true },
      );
      timer = setTimeout(() => {
        reject(Error("unavailable"));
        controller.abort();
      }, 15000);
    });
    const pending = checkPending
      ? Promise.race([
          intelligence!.pendingImport!(controller.signal),
          deadline,
        ])
      : Promise.resolve(null);
    const saved = checkResume
      ? Promise.race([
          registry.json<WorkspaceDraft<{ route: string }> | null>(
            `/v1/workspace-drafts/resume/${resumeId}`,
          ),
          deadline,
        ])
      : Promise.resolve(null);
    void Promise.allSettled([pending, saved])
      .then(([review, last]) => {
        if (
          !active ||
          navigationVersion.current !== version ||
          window.location.hash !== "#/profile"
        )
          return;
        if (review.status === "fulfilled" && review.value?.state === "ready") {
          const route = workspaceLocation(
            `#/profile/import/${review.value.id}`,
          );
          if (route.importId === review.value.id) {
            navigate(route.canonical);
            return;
          }
        }
        if (checkPending && review.status === "rejected")
          setMessage(
            t(
              "Nu am putut verifica dacă ai un CV în curs de verificare. Reîncarcă pagina când conexiunea revine.",
              "We could not check for an unfinished CV review. Refresh when your connection is available.",
            ),
          );
        if (last.status === "fulfilled" && last.value?.value.route) {
          const target = workspaceLocation(last.value.value.route);
          // Server review status takes precedence over an old last-visited import URL.
          if (!(checkPending && target.view === "import" && target.importId))
            navigate(target.canonical);
        }
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setResumeReady(true);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [registry, transport, intelligence, navigate]);
  useEffect(() => {
    if (
      !transport ||
      !resumeReady ||
      location.view === "missing" ||
      registry.openedRoute !== location.canonical
    )
      return;
    const timer = setTimeout(() => {
      const controller = registry.draft("resume", resumeId, {
        route: location.canonical,
      });
      void controller
        .load()
        .then(() => controller.set({ route: location.canonical }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [
    location.canonical,
    transport,
    registry,
    registry.openedRoute,
    resumeReady,
  ]);
  useEffect(() => {
    if (
      location.destination === "profile" &&
      location.view !== "import" &&
      profile.ready
    )
      registry.opened(location.canonical);
  }, [location.canonical, profile.ready, registry]);
  const documentChanged = useCallback(
    (state: typeof profile) => setProfile(state),
    [],
  );
  const openJobDocument = useCallback(
    (jobId: string, label: string, locale: string, refreshKey: string) => {
      if(registry.deletedJobs.has(jobId))return;
      const key = `job:${jobId}:${documentLocaleKey(locale)}`;
      setPanes((old) => {
        const existing = old.find((p) => p.key === key);
        if (existing?.refreshKey === refreshKey) return old;
        if (existing)
          return old.map((p) => (p.key === key ? { ...p, refreshKey } : p));
        return [
          ...old,
          {
            key,
            label,
            adapter: new HttpJobCvAdapter(transport!, jobId, locale),
            refreshKey,
          },
        ];
      });
    },
    [transport],
  );
  const acceptedProfile = useCallback(
    (saved: Snapshot) => {
      const controller = registry.documents.get("profile");
      if (!controller) throw Error("staleIntegration");
      controller.acceptIntegration(saved);
      setProfile({
        draft: saved.draft,
        head: saved,
        ready: true,
        dirty: false,
        error: null,
      });
    },
    [registry],
  );
  const canonicalLocale = profile.draft
    ? documentLocaleKey(contentLocale(profile.draft))
    : "ro";
  useEffect(() => {
    let active = true;
    if (
      transport &&
      location.view === "profile-cv" &&
      documentLocaleKey(location.locale ?? canonicalLocale) !==
        canonicalLocale &&
      profile.head
    ) {
      void languageClient(transport)
        .context()
        .then(
          (ctx) => {
            const version = ctx.versions.find(
              (v) =>
                documentLocaleKey(v.locale) ===
                  documentLocaleKey(location.locale ?? "") && v.variantId,
            );
            if (!active) return;
            if (!version?.variantId) {
              setMessage(
                t(
                  "Nu există o versiune acceptată în această limbă.",
                  "No accepted version exists in this language.",
                ),
              );
              navigate("#/profile");
              return;
            }
            const key = `language:${version.variantId}`;
            setPanes((old) =>
              old.some((p) => p.key === key)
                ? old
                : [
                    ...old,
                    {
                      key,
                      language: true,
                      adapter: new HttpLanguageCvAdapter(
                        transport,
                        version.variantId!,
                        version.locale,
                      ),
                      refreshKey: `${version.id}:${version.revision}`,
                    },
                  ],
            );
          },
          () => {
            if (active) {
              setMessage(
                t(
                  "Versiunea de limbă nu este disponibilă.",
                  "This language version is unavailable.",
                ),
              );
              navigate("#/profile");
            }
          },
        );
    }
    return () => {
      active = false;
    };
  }, [transport, location.canonical, canonicalLocale, profile.head?.id]);
  const profileNavigate = useCallback(
    (route: Route, target?: string) => {
      if (route === "jobs") return navigate("#/jobs");
      if (route === "start") return navigate("#/profile/import");
      if (route === "history") return navigate("#/profile/history");
      if (route === "enrich") {
        const id =
          target ??
          registry.documents.get("profile")?.latest.current?.roles[0]?.id;
        return navigate(
          id ? `#/profile/enrich/${encodeURIComponent(id)}` : "#/profile",
        );
      }
      navigate("#/profile");
    },
    [navigate, registry],
  );
  useEffect(() => {
    if (
      profile.ready &&
      location.targetId &&
      location.targetId !== "__skills" &&
      location.targetId !== "__improve_skills" &&
      profile.draft &&
      !profile.draft.roles.some((r) => r.id === location.targetId) &&
      !profile.draft.optionalSections.some((s) =>
        s.entries.some((e) => e.id === location.targetId),
      )
    ) {
      setMessage(
        t(
          "Acest rol nu mai există în profil.",
          "This role no longer exists in your profile.",
        ),
      );
      navigate("#/profile");
    }
  }, [profile.ready, location.targetId, profile.draft, navigate]);
  useEffect(() => {
    const committed = profile.head?.draft;
    if (
      location.view === "import" &&
      location.importId &&
      committed?.importReview?.id === location.importId &&
      committed.importReview.confirmedIds.length &&
      !pendingImportedCandidates(committed).length
    )
      navigate("#/profile");
  }, [location.canonical, profile.head, navigate]);
  const activeJobKey = location.jobId
    ? `job:${location.jobId}:${documentLocaleKey(location.locale ?? canonicalLocale)}`
    : "";
  const baseActive =
    location.destination === "profile" &&
    (location.view !== "profile-cv" ||
      documentLocaleKey(location.locale ?? canonicalLocale) ===
        canonicalLocale);
  const legacyMode: Route =
    location.view === "history"
      ? "history"
      : location.view === "import" &&
          !(
            !!location.importId &&
            !!profile.draft &&
            location.importId === profile.draft.importReview?.id &&
            pendingImportedCandidates(profile.draft).length
          )
        ? "start"
        : "base";
  return (
    <LanguageContext value={uiLocale}>
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace-main")?.focus();
        }}
      >
        {t("Mergi la conținut", "Skip to content")}
      </a>
      <header className="topbar workspace-topbar">
        <a className="brand" href="#/profile" aria-label="Resumora">
          <img
            src="/resumora-logo.svg"
            alt="Resumora"
            width="142"
            height="34"
          />
        </a>
        <details className="account-menu">
          <summary>
            <UserRound size={18} />
            {t("Contul meu", "My account")}
          </summary>
          <div className="card stack">
            {accountActions}
            <label>
              {t("Limba interfeței", "Interface language")}
              <select
                className="native"
                aria-label={t("Limba interfeței", "Interface language")}
                value={uiLocale}
                onChange={(e) => setUiLocale(e.target.value as Locale)}
              >
                <option value="ro">Română</option>
                <option value="en">English</option>
              </select>
            </label>
            <a href="/extension">
              {t("Extensie pentru browser", "Browser extension")}
            </a>
            <a href="/extension/manage">
              {t("Gestionează extensia", "Manage extension")}
            </a>
          </div>
        </details>
      </header>
      <div className="app-layout workspace-shell">
        <aside className="sidebar">
          <nav aria-label={t("Navigare principală", "Main navigation")}>
            <a
              href="#/profile"
              aria-current={
                location.destination === "profile" ? "page" : undefined
              }
            >
              <FileText size={19} />
              {t("Profilul meu", "My Profile")}
            </a>
            <a
              href="#/jobs"
              aria-current={
                location.destination === "jobs" ? "page" : undefined
              }
            >
              <BriefcaseBusiness size={19} />
              {t("Joburile mele", "My Jobs")}
            </a>
          </nav>
        </aside>
        <main
          id="workspace-main"
          tabIndex={-1}
          className={`workspace-main mobile-${location.destination === "profile" && location.view !== "profile-cv" ? "edit" : mobileView}`}
        >
          <WorkspaceRecovery />
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          {location.destination === "profile" && (
            <div className="section-heading profile-heading">
              <h1>{t("Profilul meu", "My Profile")}</h1>
              {profile.draft && location.view !== "import" && (
                <div className="profile-header-actions">
                  <span
                    className={`profile-header-save ${profile.error ? "is-unsaved" : profile.dirty ? "is-saving" : ""}`}
                    role="status"
                  >
                    {profile.error
                      ? t("Nesalvat", "Not saved")
                      : profile.dirty
                        ? t("Se salvează…", "Saving…")
                        : adapter.capability === "durable"
                          ? t("Salvat", "Saved")
                          : t("În sesiune", "In this session")}
                  </span>
                </div>
              )}
            </div>
          )}
          {((location.destination === "jobs" && location.panel === "cv") ||
            location.view === "profile-cv") && (
            <div className="mobile-view-switch">
              <Button
                aria-pressed={mobileView === "edit"}
                onClick={() => setMobileView("edit")}
              >
                {t("Editează", "Edit")}
              </Button>
              <Button
                aria-pressed={mobileView === "preview"}
                onClick={() => setMobileView("preview")}
              >
                {t("Previzualizare", "Preview")}
              </Button>
            </div>
          )}
          {location.view === "missing" && (
            <p className="notice">
              {t(
                "Pagina nu există. Profilul tău este disponibil mai jos.",
                "This page does not exist. Your profile is available below.",
              )}
            </p>
          )}
          {location.destination === "jobs" && (
            <JobsWorkspace
              location={location}
              profile={profile.draft}
              snapshot={profile.head ?? null}
              ready={profile.ready && !!profile.draft && !!profile.head}
              navigate={navigate}
              onDocument={openJobDocument}
              onProfileAccepted={acceptedProfile}
              onJobDeleted={(id)=>setPanes(old=>old.filter(p=>!p.key.startsWith(`job:${id}:`)))}
            />
          )}
          {!resumeReady && location.view === "profile" && (
            <p role="status">
              {t(
                "Verificăm dacă ai un CV în curs de verificare…",
                "Checking for an unfinished CV review…",
              )}
            </p>
          )}
          <CvEditor
            importId={location.importId}
            onOpenImport={(id) => {
              if (!id)
                setMessage(
                  t(
                    "Importul nu mai este disponibil în cont.",
                    "This import is no longer available in your account.",
                  ),
                );
              navigate(id ? `#/profile/import/${id}` : "#/profile");
            }}
            embedded
            active={baseActive && resumeReady}
            resourceKey="profile"
            routeOverride={legacyMode}
            adapter={adapter}
            intelligence={intelligence}
            transport={transport}
            uiLocale={uiLocale}
            onUiLocaleChange={setUiLocale}
            navigate={profileNavigate}
            enrichTarget={
              location.targetId ??
              (location.view === "enrich"
                ? profile.draft?.roles[0]?.id
                : undefined)
            }
            onState={documentChanged}
            switchLanguage={(value) =>
              navigate(
                value.variantId
                  ? `#/profile/cv/${encodeURIComponent(value.locale)}`
                  : "#/profile",
              )
            }
          />
          {panes.map((pane) => {
            const active = pane.language
              ? location.view === "profile-cv" &&
                documentLocaleKey(location.locale ?? "") ===
                  documentLocaleKey(
                    (pane.adapter as HttpLanguageCvAdapter).documentLocale,
                  )
              : pane.key === activeJobKey &&
                ["cv", "appearance"].includes(location.panel ?? "details");
            return (
              <CvEditor
                key={pane.key}
                embedded
                active={active}
                resourceKey={pane.key}
                routeOverride="base"
                adapter={pane.adapter}
                transport={transport}
                uiLocale={uiLocale}
                onUiLocaleChange={setUiLocale}
                jobLabel={pane.label}
                refreshKey={pane.refreshKey}
                appearanceOnly={
                  location.panel === "appearance" || !!pane.language
                }
                navigate={profileNavigate}
                switchDocument={() => navigate("#/profile")}
                switchLanguage={(value) =>
                  navigate(
                    pane.language
                      ? `#/profile/cv/${encodeURIComponent(value.locale)}`
                      : `#/jobs/${location.jobId}/cv/${encodeURIComponent(value.locale)}?panel=appearance`,
                  )
                }
              />
            );
          })}
        </main>
      </div>
    </LanguageContext>
  );
}
