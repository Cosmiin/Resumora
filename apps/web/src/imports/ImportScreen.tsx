import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CvResponse } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { conflictFrom, isConflict, type Conflict } from "../cv/useAutosave.ts";
import { CvDocument } from "../cv/page/CvDocument.tsx";
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

  async function apply() {
    if (!imp?.result) return;
    setApplying(true);
    setApplyFailed(false);
    try {
      const saved = await applyImport(importId, currentVersion());
      onApplied({ content: imp.result.content, ...saved });
    } catch (err) {
      if (isConflict(err)) return onConflict(conflictFrom(err));
      setApplyFailed(true);
    } finally {
      setApplying(false);
    }
  }

  const result = imp?.status === "ready" ? imp.result : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("import.title")}
      className="import-screen"
      ref={screenRef}
      tabIndex={-1}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <header className="import-bar">
        <strong className="app-brand">{t("app.name")}</strong>
        <p className="import-bar-title">{t("import.bar", { file: imp?.fileName ?? "" })}</p>
        <div className="import-bar-actions">
          <button type="button" className="secondary" onClick={onClose}>{t("import.cancel")}</button>
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
            {!canApply && <p aria-live="polite">{t("import.waitingSave")}</p>}
            <ImportSummary result={result} canApply={canApply} applying={applying} onApply={() => void apply()} />
          </div>
        )}
      </div>
    </div>
  );
}
