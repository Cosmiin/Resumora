import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CvResponse } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { conflictFrom, isConflict, type Conflict } from "../cv/useAutosave.ts";
import { applyImport, getImport } from "./imports-api.ts";
import { ImportReview } from "./ImportReview.tsx";

export const POLL_MS = 2000;
/** After this long without a result, stop checking and tell the user. */
export const GIVE_UP_MS = 3 * 60_000;

export function ImportDialog(props: {
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

  return (
    <div role="dialog" aria-modal="true" aria-label={t("import.title")} className="drawer import-dialog">
      <header className="drawer-header">
        <h2>{t("import.title")}</h2>
        <button type="button" className="link" onClick={onClose}>{t("history.close")}</button>
      </header>

      {query.isError && <p role="alert" className="form-error">{t("import.loadError")}</p>}
      {!done && !query.isError && (slow ? <p role="alert">{t("import.slow")}</p> : <p aria-live="polite">{t("import.reading")}</p>)}
      {imp?.status === "failed" && <p role="alert" className="form-error">{imp.error?.message ?? t("import.loadError")}</p>}
      {imp?.status === "applied" && <p>{t("import.alreadyUsed")}</p>}

      {imp?.status === "ready" && imp.result && (
        <>
          <ImportReview result={imp.result} />
          <p className="hint">{t("import.replaceNote")}</p>
          {applyFailed && <p role="alert" className="form-error">{t("import.applyError")}</p>}
          {!canApply && <p aria-live="polite">{t("import.waitingSave")}</p>}
          <div className="dialog-actions">
            <button type="button" disabled={!canApply || applying} onClick={() => void apply()}>{t("import.apply")}</button>
            <button type="button" className="secondary" onClick={onClose}>{t("import.cancel")}</button>
          </div>
        </>
      )}
    </div>
  );
}
