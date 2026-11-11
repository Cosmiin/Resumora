import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { moveOtherTo, SCAN_WARNING, type CvResponse, type SaveResponse, type ImportResult, type MoveTarget } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { conflictFrom, isConflict, type Conflict } from "../cv/useAutosave.ts";
import { CvDocument } from "../cv/page/CvDocument.tsx";
import { formatRange } from "../cv/page/blocks.ts";
import { saveCv } from "../cv/cv-api.ts";
import { FocusBar } from "../cv/enrich/FocusBar.tsx";
import { PathSteps } from "../cv/enrich/PathStart.tsx";
import { Skeleton } from "../ui/Page.tsx";
import { applyImport, getImport } from "./imports-api.ts";
import { ImportSummary } from "./ImportSummary.tsx";
import { ConfirmList } from "./ConfirmList.tsx";
import type { CvContent } from "@resumora/shared";

export const POLL_MS = 2000;
/**
 * After this long without a result, stop checking and tell the user. Longer than the server's own
 * worst case: the sweeper marks any import still unfinished after 15 minutes as failed.
 */
export const GIVE_UP_MS = 20 * 60_000;

/** Where the person goes once the import is their CV: straight into the questions, or to the CV page. */
export type AfterImport = "questions" | "cv";

/** The first step of the flow, full window: the CV is read, then shown as found, with the way into the questions. */
export function ImportScreen(props: {
  importId: string;
  /** False while the editor has unsaved or in-flight changes. */
  canApply: boolean;
  /** True when using this import replaces a CV that has something in it. */
  replaces: boolean;
  currentVersion(): number;
  onClose(): void;
  onApplied(cv: CvResponse, next: AfterImport): void;
  onConflict(conflict: Conflict): void;
}) {
  const { importId, canApply, replaces, currentVersion, onClose, onApplied, onConflict } = props;
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

  /** A correction made on a "thing to confirm": it goes into the CV being imported, saved when the import is used. */
  function change(fn: (cv: CvContent) => CvContent) {
    const base = edited ?? imp?.result;
    if (base) setEdited({ ...base, content: fn(base.content) });
  }

  /** If the import was already applied (a retry of the moves is pending), the editor must hear about it. */
  function close() {
    if (appliedRef.current && imp?.result) onApplied({ content: imp.result.content, ...appliedRef.current }, "cv");
    else onClose();
  }

  async function apply(next: AfterImport) {
    if (!imp?.result || !result) return;
    setApplying(true);
    setApplyFailed(false);
    setMovesFailed(false);
    try {
      const saved = appliedRef.current ?? (await applyImport(importId, currentVersion()));
      appliedRef.current = saved;
      if (!edited) return onApplied({ content: imp.result.content, ...saved }, next);
      // The server applies the import as it found it; save the moved version on top of that.
      try {
        const final = await saveCv(edited.content, saved.version);
        onApplied({ content: edited.content, ...final }, next);
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

  const cv = result?.content;
  const roles = cv?.experience ?? [];
  const name = cv?.basics.fullName.trim() ?? "";
  const confirms = result?.warnings.filter((w) => w !== SCAN_WARNING) ?? [];
  // Lines we could not place open the details without being asked; things to confirm have their own list.
  const needsLook = !!result && (result.isScan || result.unsourcedLines.length > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("import.title")}
      className={`ui-page focus-mode fm-path import-screen${result ? " is-wide" : ""}`}
      ref={screenRef}
      tabIndex={-1}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <FocusBar context={imp?.fileName} onClose={close} closeLabel={t("import.cancel")} />
      <section className="fm-path-start">
        <PathSteps current={0} />
        {query.isError && <p role="alert" className="ui-notice ui-notice--bad">{t("import.loadError")}</p>}
        {!done && !query.isError && (slow ? <p role="alert" className="ui-notice">{t("import.slow")}</p> : (
          <div aria-busy="true">
            <h2 className="fm-q is-big">{t("import.reading")}</h2>
            <p className="fm-lead" aria-live="polite">{t("import.readingLine")}</p>
            <div className="import-found import-loading">
              <Skeleton width="45%" height="30px" /><Skeleton width="70%" /><Skeleton /><Skeleton width="85%" /><Skeleton width="60%" />
            </div>
          </div>
        ))}
        {imp?.status === "failed" && <p role="alert" className="ui-notice ui-notice--bad">{imp.error?.message ?? t("import.loadError")}</p>}
        {imp?.status === "applied" && <p className="ui-notice">{t("import.alreadyUsed")}</p>}
        {result && cv && (
          <>
            <h2 className="fm-q is-big">{t(roles.length === 0 ? "import.found.none" : roles.length === 1 ? "import.found.one" : "import.found.many", { n: roles.length })}</h2>
            <p className="fm-lead">{t("import.found.line")}</p>
            <div className="import-cols">
              <div className="import-right">
                {result.isScan && <p role="alert" className="ui-notice import-gap">{t("import.scan")}</p>}
                <div inert={applying}><ConfirmList warnings={confirms} cv={cv} onChange={change} /></div>
                {roles.length > 0 && <p className="ui-coach import-next">{t("import.found.next")}</p>}
                {replaces && <p className="fm-fine">{t("import.summary.kept")}</p>}
                {applyFailed && <p role="alert" className="ui-notice ui-notice--bad">{t("import.applyError")}</p>}
                {movesFailed && <p role="alert" className="ui-notice ui-notice--bad">{t("import.movesError")}</p>}
                {!canApply && <p aria-live="polite" className="fm-fine">{t("import.waitingSave")}</p>}
                <div className="fm-foot">
                  {roles.length > 0 ? (
                    <>
                      <button type="button" className="fm-ghost" disabled={!canApply || applying} onClick={() => void apply("cv")}>{t("import.skip")}</button>
                      <button type="button" className="fm-btn" disabled={!canApply || applying} onClick={() => void apply("questions")}>{t("import.start")}</button>
                    </>
                  ) : (
                    <button type="button" className="fm-btn" disabled={!canApply || applying} onClick={() => void apply("cv")}>{t("import.apply")}</button>
                  )}
                </div>
              </div>
              <div className="import-left">
                <div className="import-found">
                  {name && <p className="import-name" lang={cv.locale}>{name}</p>}
                  {cv.basics.location.trim() && <p className="ui-muted" lang={cv.locale}>{cv.basics.location}</p>}
                  {roles.length > 0 && (
                    <ul className="import-roles" lang={cv.locale}>
                      {roles.map((r) => (
                        <li key={r.id}>
                          <span><b>{r.title.trim() || t("import.found.untitled")}</b>{r.company.trim() ? `, ${r.company.trim()}` : ""}</span>
                          <span className="ui-muted ui-small" lang="">
                            {[formatRange(r.startDate, r.endDate, r.current, cv.locale), t(r.bullets.length === 1 ? "import.found.bullet" : "import.found.bullets", { n: r.bullets.length })].filter(Boolean).join(", ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="import-found-note">{t(`import.found.lang.${cv.locale}`)}</p>
                </div>
                <details className="import-details" open={needsLook || undefined}>
                  <summary>{t("import.found.fix")}</summary>
                  <ImportSummary result={result} onMove={move} />
                  <div className="import-page"><CvDocument content={cv} showUnsorted /></div>
                </details>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
