import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { moveOtherTo, type CvResponse, type SaveResponse, type ImportResult, type MoveTarget } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { conflictFrom, isConflict, type Conflict } from "../cv/useAutosave.ts";
import { CvDocument } from "../cv/page/CvDocument.tsx";
import { saveCv } from "../cv/cv-api.ts";
import { applyImport, getImport } from "./imports-api.ts";
import { ImportSummary } from "./ImportSummary.tsx";

export const POLL_MS = 2000;
/**
 * After this long without a result, stop checking and tell the user. Longer than the server's own
 * worst case: the sweeper marks any import still unfinished after 15 minutes as failed.
 */
export const GIVE_UP_MS = 20 * 60_000;

/** Full-window review of an import: the organized CV on a page, a summary beside it. */
export function ImportScreen(props: {
  importId: string;
  /** False while the editor has unsaved or in-flight changes. */
  canApply: boolean;
  currentVersion(): number;
  onClose(): void;
  onApplied(cv: CvResponse): void;
  onConflict(conflict: Conflict): void;
}) {
  const { importId, canApply, currentVersion, onClose, onApplied, onConflict } = props;
  const [slow, setSlow] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);
  const [movesFailed, setMovesFailed] = useState(false);
  /** Set once the server applied the import, so a retry only saves the moves again. */
  const appliedRef = useRef<SaveResponse | null>(null);
  /** The result after any "Move to"; null until the user moves something. */
  const [edited, setEdited] = useState<ImportResult | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    screenRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [importId]);

  const query = useQuery({
    queryKey: ["import", importId],
    queryFn: () => getImport(importId),
    gcTime: 0,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return slow || status === "ready" || status === "failed" || status === "applied" ? false : POLL_MS;
    },
  });
  const imp = query.data;
  const done = imp && (imp.status === "ready" || imp.status === "failed" || imp.status === "applied");

  const result = edited ?? (imp?.status === "ready" ? imp.result : null);

  function move(customId: string, target: MoveTarget, headingIndex: number) {
    const base = edited ?? imp?.result;
    if (!base) return;
    const content = moveOtherTo(base.content, customId, target);
    const allMoved = !content.custom.some((c) => c.id === customId);
    setEdited({
      ...base,
      content,
      // Lines that did not fit stay in Other, so the row stays in Other too.
      sourceHeadings: base.sourceHeadings.map((h, i) => (i === headingIndex && allMoved ? { ...h, category: target } : h)),
    });
  }

  /** If the import was already applied (a retry of the moves is pending), the editor must hear about it. */
  function close() {
    if (appliedRef.current && imp?.result) onApplied({ content: imp.result.content, ...appliedRef.current });
    else onClose();
  }

  async function apply() {
    if (!imp?.result || !result) return;
    setApplying(true);
    setApplyFailed(false);
    setMovesFailed(false);
    try {
      const saved = appliedRef.current ?? (await applyImport(importId, currentVersion()));
      appliedRef.current = saved;
      if (!edited) return onApplied({ content: imp.result.content, ...saved });
      // The server applies the import as it found it; save the moved version on top of that.
      try {
        const final = await saveCv(edited.content, saved.version);
        onApplied({ content: edited.content, ...final });
      } catch (err) {
        if (isConflict(err)) return onConflict(conflictFrom(err));
        setMovesFailed(true);
      }
    } catch (err) {
      if (isConflict(err)) return onConflict(conflictFrom(err));
      setApplyFailed(true);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("import.title")}
      className="import-screen"
      ref={screenRef}
      tabIndex={-1}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <header className="import-bar">
        <strong className="app-brand">{t("app.name")}</strong>
        <p className="import-bar-title">{t("import.bar", { file: imp?.fileName ?? "" })}</p>
        <div className="import-bar-actions">
          <button type="button" className="secondary" onClick={close}>{t("import.cancel")}</button>
          {result && (
            <button type="button" disabled={!canApply || applying} onClick={() => void apply()}>{t("import.apply")}</button>
          )}
        </div>
      </header>

      <div className="import-body">
        <div className="import-page-area">
          {query.isError && <p role="alert" className="form-error import-state">{t("import.loadError")}</p>}
          {!done && !query.isError && (slow ? <p role="alert" className="import-state">{t("import.slow")}</p> : <p aria-live="polite" className="import-state">{t("import.reading")}</p>)}
          {imp?.status === "failed" && <p role="alert" className="form-error import-state">{imp.error?.message ?? t("import.loadError")}</p>}
          {imp?.status === "applied" && <p className="import-state">{t("import.alreadyUsed")}</p>}
          {result && <CvDocument content={result.content} showUnsorted />}
        </div>
        {result && (
          <div className="import-side">
            {applyFailed && <p role="alert" className="form-error">{t("import.applyError")}</p>}
            {movesFailed && <p role="alert" className="form-error">{t("import.movesError")}</p>}
            {!canApply && <p aria-live="polite">{t("import.waitingSave")}</p>}
            <ImportSummary result={result} canApply={canApply} applying={applying} onApply={() => void apply()} onMove={move} />
          </div>
        )}
      </div>
    </div>
  );
}
