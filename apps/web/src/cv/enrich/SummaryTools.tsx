import { useEffect, useRef, useState } from "react";
import { summaryChecklist, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/en.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { Checklist } from "./Checklist.tsx";
import { streamRewrite } from "./enrich-api.ts";
import { onEvent, type Proposal } from "./RewriteReview.tsx";

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  /** Resolves once autosave has saved the latest edits (the rewrite reads the saved CV). */
  waitForSave(): Promise<void>;
};

type Phase = "drafting" | "streaming" | "done" | "error";

/** The summary rewrite as it streams: muted until it passes every check, then "Use this" / "Keep mine". */
function SummaryRewrite({ summary, started, dispatch, onClose, onRestart }: { summary: string; started: string; dispatch(a: CvAction): void; onClose(): void; onRestart(): void }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [phase, setPhase] = useState<Phase>("drafting");
  const [run, setRun] = useState(0);

  useEffect(() => {
    const controller = streamRewrite("/v1/enrich/rewrite-summary", {}, (e) => {
      if (e.event === "start") setPhase((p) => (p === "drafting" ? "streaming" : p));
      else if (e.event === "done") setPhase("done");
      else if (e.event === "error") setPhase("error");
      setProposals((list) => onEvent(list, run, e));
    });
    return () => controller.abort();
  }, [run]);

  const use = (p: Proposal) => {
    dispatch({ type: "setSummary", value: p.text });
    setProposals((list) => list.map((x) => (x.key === p.key ? { ...x, state: "used" } : x)));
  };
  // Starts over. A rewrite already used stays.
  const retry = () => {
    setProposals((list) => list.filter((p) => p.state === "used"));
    setPhase("drafting");
    setRun((n) => n + 1);
  };

  if (phase === "drafting") {
    return (
      <p className="working" role="status">
        {t("enrich.summary.drafting")}
      </p>
    );
  }
  const changed = summary !== started;
  const finished = phase === "done" || phase === "error";
  const shown = proposals.filter((p) => p.state !== "kept");
  const nothing = phase === "done" && !proposals.some((p) => p.state !== "dropped");
  return (
    <div className="rewrite-review">
      {shown.map((p) => {
        const live = p.state === "streaming" && !finished;
        return (
          <div key={p.key} className={`prop ${live ? "streaming" : p.state === "streaming" ? "stopped" : p.state}`}>
            {p.state === "used" ? <span className="prop-state">{t("enrich.review.used")}</span> : <span className="prop-old">{summary}</span>}
            <span className="prop-new">{p.text}</span>
            {p.state === "dropped" && p.reason && <span className="prop-why">{t(`enrich.drop.${p.reason}` as MessageKey)}</span>}
            {live && <span className="prop-hint">{t("enrich.review.writing")}</span>}
            {p.state === "ready" && (
              <>
                {changed ? (
                  <span className="prop-why">
                    {t("enrich.summary.changed")}{" "}
                    <button type="button" className="link" onClick={onRestart}>
                      {t("enrich.review.tryAgain")}
                    </button>
                  </span>
                ) : (
                  <span className="prop-hint">{t("enrich.summary.source")}</span>
                )}
                <div className="row-btns">
                  <button type="button" className="btn small primary" disabled={changed} onClick={() => use(p)}>
                    {t("enrich.review.use")}
                  </button>
                  <button type="button" className="btn small" onClick={onClose}>
                    {t("enrich.review.keep")}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
      {shown.some((p) => p.state === "used") && (
        <p className="saved-note" role="status">
          {t("enrich.summary.used")}
        </p>
      )}
      {nothing && <p className="review-note">{t("enrich.review.nothing")}</p>}
      {phase === "error" && (
        <p className="review-note" role="alert">
          {t(proposals.length > 0 ? "enrich.review.broken" : "enrich.review.failed")}{" "}
          <button type="button" className="link" onClick={retry}>
            {t("enrich.review.tryAgain")}
          </button>
        </p>
      )}
      {finished && (
        <div className="row-btns">
          <button type="button" className="btn small" onClick={onClose}>
            {t("enrich.review.done")}
          </button>
        </div>
      )}
    </div>
  );
}

const FIX: Record<string, { label: MessageKey; fix: MessageKey }> = {
  sentences: { label: "enrich.summary.sentences", fix: "enrich.summary.sentencesFix" },
  firstPerson: { label: "enrich.summary.firstPerson", fix: "enrich.summary.firstPersonFix" },
  length: { label: "enrich.summary.length", fix: "enrich.summary.lengthFix" },
  mentionsRole: { label: "enrich.summary.mentionsRole", fix: "enrich.summary.mentionsRoleFix" },
  mentionsNumber: { label: "enrich.summary.mentionsNumber", fix: "enrich.summary.mentionsNumberFix" },
};

/** The Summary section's checklist, and "Rewrite my summary". */
export function SummaryTools({ cv, dispatch, waitForSave }: Props) {
  const [step, setStep] = useState<"idle" | "drafting" | "review">("idle");
  const [started, setStarted] = useState("");
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const start = async () => {
    setFailed(false);
    setStarted(cv.basics.summary);
    setStep("drafting");
    try {
      await waitForSave();
    } catch {
      if (alive.current) {
        setFailed(true);
        setStep("idle");
      }
      return;
    }
    if (alive.current) setStep((s) => (s === "drafting" ? "review" : s));
  };

  const items = summaryChecklist(cv).map((c) => ({ key: c.key, ok: c.ok, label: t(FIX[c.key]!.label), fix: t(FIX[c.key]!.fix) }));
  return (
    <div className="box">
      <p className="p-sub">{t("enrich.checklist")}</p>
      <Checklist items={items} />
      {failed && (
        <p className="review-note" role="alert">
          {t("enrich.summary.saveFailed")}
        </p>
      )}
      {step === "idle" && (
        <div className="row-btns">
          <button type="button" className="btn small primary" onClick={() => void start()}>
            {t("enrich.summary.rewrite")}
          </button>
        </div>
      )}
      {step === "drafting" && (
        <p className="working" role="status">
          {t("enrich.summary.drafting")}
        </p>
      )}
      {step === "review" && <SummaryRewrite summary={cv.basics.summary} started={started} dispatch={dispatch} onClose={() => setStep("idle")} onRestart={() => void start()} />}
    </div>
  );
}
