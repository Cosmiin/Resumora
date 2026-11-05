import { useCallback, useEffect, useRef, useState } from "react";
import type { CvContent, CvResponse, SaveResponse } from "@resumora/shared";
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

const statusLabel: Record<SaveStatus, MessageKey> = {
  saved: "cv.status.saved",
  dirty: "cv.status.dirty",
  saving: "cv.status.saving",
  error: "cv.status.error",
  conflict: "cv.status.conflict",
  invalid: "cv.status.invalid",
};

export function Editor({ initial }: { initial: CvResponse }) {
  const autosave = useAutosave({ initial, save: saveCv, load: getCv });
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
  const [opened, onOpen] = useOpenedSections();
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
  const { scores, retry } = useRoleScores({ cv: content, status });
  const phone = useMediaQuery("(max-width: 899px)");
  const [sheet, setSheet] = useState<SheetState>("peek");

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
      {conflict && <ConflictBanner onLoadLatest={loadLatest} onKeepMine={keepMine} />}
    </>
  );

  const actions = (
    <>
      <span className={`save-status save-status-${status}`} aria-live="polite">
        {t(statusLabel[status])}
      </span>
      <ImportButton ref={importButton} onStarted={setImportId} />
      <button ref={historyButton} type="button" className="secondary" onClick={openHistory}>
        {t("history.open")}
      </button>
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
    />
  );

  return (
    <AppShell actions={actions} inert={importId !== null}>
      <main className="editor">
      {/* While an import is open the whole workspace is inert. While history is open only the page is,
          so a restore can't race the user's typing; the history panel stays usable. */}
      <div className="editor-workspace" inert={importId !== null}>
        <div className="stage" ref={pageRef} tabIndex={-1} onFocus={() => setSheet("peek")}>
          {restoreFailed && <p role="alert" className="form-error">{t("history.restoreError")}</p>}
          {notices}
          {historyOpen && preview && (
            <p className="history-notice" role="status">
              {t("history.previewing", { when: whenLabel(preview.createdAt) })}
            </p>
          )}
          <div className="editor-page" inert={dialogOpen}>
            {historyOpen ? (
              <CvDocument content={preview?.content ?? content} showUnsorted />
            ) : (
              <EditablePage cv={content} dispatch={dispatch} opened={opened} onOpen={onOpen} scores={scores} toolsRoleId={sectionFocus?.key === "experience" ? sectionFocus.itemId : undefined} />
            )}
          </div>
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
      {importId && (
        <ImportScreen
          importId={importId}
          canApply={status === "saved"}
          currentVersion={autosave.currentVersion}
          onClose={() => setImportId(null)}
          onApplied={(cv) => {
            autosave.reset(cv);
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
