import { useEffect, useRef, useState } from "react";
import type { CvContent, CvResponse, SaveResponse } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { getCv, restoreHistory, saveCv } from "./cv-api.ts";
import { conflictFrom, isConflict, useAutosave, type SaveStatus } from "./useAutosave.ts";
import { ConflictBanner } from "./ConflictBanner.tsx";
import { HistoryPanel } from "./HistoryPanel.tsx";
import { dayLabel, timeLabel } from "./historyFormat.ts";
import { AppShell } from "../layout/AppShell.tsx";
import { ImportButton } from "../imports/ImportButton.tsx";
import { ImportScreen } from "../imports/ImportScreen.tsx";
import { CvDocument } from "./page/CvDocument.tsx";
import { blockKey, findItem, type BlockRef } from "./page/blocks.ts";
import { SidePanel } from "./SidePanel.tsx";
import { AddSection } from "./AddSection.tsx";

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
  const [selected, setSelected] = useState<BlockRef | null>(null);
  const position = selected && findItem(content, selected);
  const pageRef = useRef<HTMLDivElement>(null);
  const lastSelected = useRef<BlockRef | null>(null);

  // The open block can disappear (removed, or replaced by Load latest / restore / import).
  useEffect(() => {
    if (selected && !position) setSelected(null);
  }, [selected, position]);

  // When the panel closes and focus was inside it, return focus to that block (or the page).
  useEffect(() => {
    const previous = lastSelected.current;
    lastSelected.current = selected;
    if (selected || !previous) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const key = blockKey(previous);
    const block = Array.from(pageRef.current?.querySelectorAll<HTMLElement>("[data-block]") ?? []).find(
      (el) => el.dataset.block === key,
    );
    (block ?? pageRef.current)?.focus();
  }, [selected]);

  function openHistory() {
    setSelected(null);
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

  const actions = (
    <>
      <span className={`save-status save-status-${status}`} aria-live="polite">
        {t(statusLabel[status])}
      </span>
      <ImportButton onStarted={setImportId} />
      <button ref={historyButton} type="button" className="secondary" onClick={openHistory}>
        {t("history.open")}
      </button>
    </>
  );

  return (
    <AppShell actions={actions}>
      <main className="editor">
      {restoreFailed && <p role="alert" className="form-error">{t("history.restoreError")}</p>}
      {autosave.problem && (
        <p role="alert" className="form-error">
          {t("cv.invalid", { problem: autosave.problem })}
        </p>
      )}
      {conflict && <ConflictBanner onLoadLatest={loadLatest} onKeepMine={keepMine} />}
      {/* While history or an import is open the CV can't be edited, so a restore can't race the user's typing.
          The history panel sits outside the inert page area so it stays usable. */}
      <div className="editor-workspace">
        <div className="editor-page-area" ref={pageRef} tabIndex={-1}>
          {historyOpen ? (
            preview && (
              <p className="history-notice" role="status">
                {t("history.previewing", { when: `${dayLabel(preview.createdAt)}, ${timeLabel(preview.createdAt)}` })}
              </p>
            )
          ) : (
            <p className="editor-hint">{t("cv.page.hint")}</p>
          )}
          <div className="editor-page" inert={dialogOpen}>
          {historyOpen ? (
            <CvDocument content={preview?.content ?? content} showUnsorted />
          ) : (
            <CvDocument content={content} selected={selected} onSelect={setSelected} showUnsorted />
          )}
          {!historyOpen && <AddSection cv={content} onChange={setContent} onAdd={setSelected} />}
          </div>
        </div>
        {historyOpen ? (
          <HistoryPanel
            canRestore={status === "saved"}
            onClose={closeHistory}
            onPreview={(c, createdAt) => setPreview(c && createdAt ? { content: c, createdAt } : null)}
            onRestore={restore}
          />
        ) : (
          selected &&
          position && <SidePanel cv={content} selected={selected} onChange={setContent} onSelect={setSelected} />
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
