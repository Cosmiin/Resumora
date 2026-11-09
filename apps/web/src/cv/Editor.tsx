import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { emptyCv, type CvContent, type CvResponse, type SaveResponse, type SectionKey } from "@resumora/shared";
import type { TemplateId } from "./page/templates.ts";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { getCv, restoreHistory, saveCv } from "./cv-api.ts";
import { conflictFrom, isConflict, useAutosave, useWaitForSave, type SaveStatus } from "./useAutosave.ts";
import { ConflictBanner } from "./ConflictBanner.tsx";
import { HistoryPanel } from "./HistoryPanel.tsx";
import { whenLabel } from "./historyFormat.ts";
import { AppShell } from "../layout/AppShell.tsx";
import { ImportButton } from "../imports/ImportButton.tsx";
import { ImportScreen } from "../imports/ImportScreen.tsx";
import { CvDocument } from "./page/CvDocument.tsx";
import { EditablePage } from "./edit/EditablePage.tsx";
import { cvReducer, type CvAction } from "./edit/cvReducer.ts";
import { useFocusAfterRender } from "./edit/useFocusAfterRender.ts";
import { useFocusSection } from "./edit/useFocusSection.ts";
import { useOpenedSections } from "./edit/useOpenedSections.ts";
import { HelperPanel } from "./panel/HelperPanel.tsx";
import { BottomSheet, type SheetState } from "./panel/BottomSheet.tsx";
import { useMediaQuery } from "../hooks/useMediaQuery.ts";
import { useRoleScores } from "./enrich/useRoleScores.ts";
import { FocusOpenProvider, type FocusTarget } from "./enrich/focus-context.ts";
import { FocusMode } from "./enrich/FocusMode.tsx";
import { EnrichPath } from "./enrich/EnrichPath.tsx";
import { useSearchParams } from "react-router";

const statusLabel: Record<SaveStatus, MessageKey> = {
  saved: "cv.status.saved",
  dirty: "cv.status.dirty",
  saving: "cv.status.saving",
  error: "cv.status.error",
  conflict: "cv.status.conflict",
  invalid: "cv.status.invalid",
};

export type CvSource = { load(): Promise<CvResponse>; save(content: CvContent, version: number): Promise<SaveResponse> };
const baseSource: CvSource = { load: () => getCv(), save: (content, version) => saveCv(content, version) };
/** Tailored mode keeps the role scorer away from the copy: it scores Base CV roles. */
const NO_ROLES = emptyCv();

/** What the Tailored CV adds: the Base wording, the review marks, its toolbar, and the letter tab's body. */
export type TailoredExtras = {
  original: CvContent;
  highlights: ReadonlySet<string>;
  inferred: ReadonlySet<string>;
  template?: TemplateId;
  toolbar: ReactNode;
  /** A control next to each section heading (↻), in both views. */
  sectionAction?(key: SectionKey): ReactNode;
  /** When set, the stage shows this instead of the CV (the Cover letter tab); the editor stays mounted. */
  replacePage?: ReactNode;
};

type EditorProps = { initial: CvResponse; source?: CvSource; mode?: "base" | "tailored"; tailored?: TailoredExtras };

export function Editor({ initial, source = baseSource, mode = "base", tailored }: EditorProps) {
  const isTailored = mode === "tailored";
  const autosave = useAutosave({ initial, save: source.save, load: source.load });
  const { content, setContent, status, conflict, loadLatest, keepMine } = autosave;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const dialogOpen = historyOpen || importId !== null;
  const [preview, setPreview] = useState<{ content: CvContent; createdAt: string } | null>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const importWasOpen = useRef(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const [opened, onOpen, clearOpened] = useOpenedSections();
  const focusField = useFocusAfterRender(pageRef);
  const [sectionFocus, clearFocus] = useFocusSection(pageRef);
  // One stable dispatch: rows on the page skip re-rendering unless their own data changed.
  const { waitForSave, markEdited } = useWaitForSave(status);
  const dispatch = useCallback(
    (a: CvAction) =>
      setContent((c) => {
        const next = cvReducer(c, a);
        if (next !== c) markEdited();
        return next;
      }),
    [setContent, markEdited],
  );
  const focusPage = useCallback(() => pageRef.current?.focus(), []);
  const roleScores = useRoleScores({ cv: isTailored ? NO_ROLES : content, status });
  const scores = isTailored ? undefined : roleScores.scores;
  const retry = roleScores.retry;
  // A tailored CV opens editable by clicking, like the base CV; "Show changes" is the option.
  const [showChanges, setShowChanges] = useState(false);
  const phone = useMediaQuery("(max-width: 899px)");
  const [sheet, setSheet] = useState<SheetState>("peek");
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  // 1A: the guided path. "/cv?enrich=1" (Enrich first, from a job) opens it too; the parameter is then removed.
  const [params, setParams] = useSearchParams();
  const [pathOpen, setPathOpen] = useState(() => !isTailored && params.get("enrich") === "1");
  useEffect(() => {
    if (params.has("enrich")) setParams((p) => { p.delete("enrich"); return p; }, { replace: true });
  }, [params, setParams]);
  const closePath = useCallback(() => {
    setPathOpen(false);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) focusPage();
    });
  }, [focusPage]);
  const covered = focusTarget !== null || pathOpen;
  // Focus mode hands focus back to its opener; if the opener is gone by then (the score card's
  // button disappears at 100), the page takes it, so keyboard focus is never left on <body>.
  const closeFocus = useCallback(() => {
    setFocusTarget(null);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) focusPage();
    });
  }, [focusPage]);

  // Old imports copied "Company · Location" into role descriptions: empty those once, when the base CV opens.
  // It autosaves like any edit, so the old text stays in version history.
  const cleaned = useRef(false);
  useEffect(() => {
    if (cleaned.current || isTailored) return;
    cleaned.current = true;
    dispatch({ type: "clearCopiedDescriptions" });
  }, [dispatch, isTailored]);

  // When the import screen closes (cancel, applied or conflict), focus goes back to Import CV.
  // This runs after render, once the top bar is no longer inert and can take focus.
  useEffect(() => {
    if (importWasOpen.current && importId === null) importButton.current?.focus();
    importWasOpen.current = importId !== null;
  }, [importId]);

  function openHistory() {
    clearFocus();
    setPreview(null);
    setHistoryOpen(true);
  }

  function closeHistory() {
    setHistoryOpen(false);
    setPreview(null);
    historyButton.current?.focus();
  }

  async function restore(id: string) {
    setRestoreFailed(false);
    let restored: SaveResponse;
    try {
      restored = await restoreHistory(id, autosave.currentVersion());
    } catch (err) {
      if (isConflict(err)) autosave.reportConflict(conflictFrom(err));
      else setRestoreFailed(true);
      closeHistory();
      return;
    }
    try {
      autosave.reset(await getCv());
      clearOpened();
    } catch {
      // The restore is saved, but our copy is now out of date: let the user load it.
      autosave.reportConflict(restored);
    }
    closeHistory();
  }

  // Save warnings sit above the page. Only one copy is ever rendered.
  const notices = (autosave.problem || conflict) && (
    <>
      {autosave.problem && (
        <p role="alert" className="form-error">
          {t("cv.invalid", { problem: autosave.problem })}
        </p>
      )}
      {conflict && <ConflictBanner onLoadLatest={async () => {
        await loadLatest();
        clearOpened();
      }} onKeepMine={keepMine} />}
    </>
  );

  const actions = (
    <>
      <span className={`save-status save-status-${status}`} aria-live="polite">
        {t(statusLabel[status])}
      </span>
      {!isTailored && (
        <>
          <ImportButton ref={importButton} onStarted={setImportId} />
          <button ref={historyButton} type="button" className="secondary" onClick={openHistory}>
            {t("history.open")}
          </button>
        </>
      )}
    </>
  );

  const panel = (
    <HelperPanel
      cv={content}
      dispatch={dispatch}
      focus={sectionFocus}
      onBack={clearFocus}
      onFocusField={focusField}
      onFocusPage={focusPage}
      opened={opened}
      onOpen={onOpen}
      scores={scores}
      onRetry={retry}
      waitForSave={waitForSave}
      original={tailored?.original}
      onEnrich={isTailored ? undefined : () => setPathOpen(true)}
    />
  );

  const page = historyOpen ? (
    <CvDocument content={preview?.content ?? content} showUnsorted />
  ) : tailored && showChanges ? (
    <CvDocument content={content} template={tailored.template} highlights={tailored.highlights} inferred={tailored.inferred} sectionAction={tailored.sectionAction} />
  ) : (
    <EditablePage cv={content} dispatch={dispatch} opened={opened} onOpen={onOpen} scores={scores} toolsRoleId={sectionFocus?.key === "experience" ? sectionFocus.itemId : undefined} template={tailored?.template} sectionAction={tailored?.sectionAction} />
  );

  return (
    <AppShell actions={actions} inert={importId !== null || covered}>
      <main className="editor">
      {/* While an import is open the whole workspace is inert. While history is open only the page is,
          so a restore can't race the user's typing; the history panel stays usable. */}
      {/* No focus mode on a tailored CV: without the opener, the ✨ bullet and role buttons render nothing. */}
      <FocusOpenProvider value={isTailored ? null : setFocusTarget}>
      <div className="editor-workspace" inert={importId !== null || covered}>
        <div className="stage" ref={pageRef} tabIndex={-1} onFocus={() => setSheet("peek")}>
          {restoreFailed && <p role="alert" className="form-error">{t("history.restoreError")}</p>}
          {notices}
          {historyOpen && preview && (
            <p className="history-notice" role="status">
              {t("history.previewing", { when: whenLabel(preview.createdAt) })}
            </p>
          )}
          {tailored?.toolbar}
          {tailored && !tailored.replacePage && (
            <button type="button" className="secondary tailored-view" onClick={() => {
              clearFocus();
              setShowChanges((v) => !v);
            }}>
              {t(showChanges ? "tailored.editText" : "tailored.showChanges")}
            </button>
          )}
          {tailored?.replacePage ?? <div className="editor-page" inert={dialogOpen}>{page}</div>}
        </div>
        {historyOpen ? (
          <HistoryPanel
            canRestore={status === "saved"}
            onClose={closeHistory}
            onPreview={(c, createdAt) => setPreview(c && createdAt ? { content: c, createdAt } : null)}
            onRestore={restore}
          />
        ) : phone ? (
          <BottomSheet state={sheet} onStateChange={setSheet}>
            {panel}
          </BottomSheet>
        ) : (
          panel
        )}
      </div>
      </FocusOpenProvider>
      {pathOpen && !focusTarget && !historyOpen && !isTailored && (
        <EnrichPath cv={content} dispatch={dispatch} scores={roleScores.scores} waitForSave={waitForSave} onClose={closePath} />
      )}
      {focusTarget && !historyOpen && !isTailored && (
        <FocusMode
          key={`${focusTarget.roleId}:${focusTarget.bulletId ?? ""}`}
          target={focusTarget}
          cv={content}
          dispatch={dispatch}
          scores={roleScores.scores}
          waitForSave={waitForSave}
          onClose={closeFocus}
        />
      )}
      {importId && (
        <ImportScreen
          importId={importId}
          canApply={status === "saved"}
          currentVersion={autosave.currentVersion}
          onClose={() => setImportId(null)}
          onApplied={(cv) => {
            autosave.reset(cv);
            clearOpened();
            setImportId(null);
          }}
          onConflict={(c) => {
            autosave.reportConflict(c);
            setImportId(null);
          }}
        />
      )}
      </main>
    </AppShell>
  );
}
