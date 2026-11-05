import { useEffect, useState } from "react";
import type { DropReason, Experience, RewriteEvent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { streamRewrite } from "./enrich-api.ts";

type Props = {
  role: Experience;
  dispatch(a: CvAction): void;
  onClose(): void;
};

export type Proposal = {
  /** Unique across retries: the run, then the stream's index. */
  key: string;
  index: number;
  replaces: string | null;
  text: string;
  state: "streaming" | "ready" | "dropped" | "used" | "kept";
  reason?: DropReason;
  /** Already applied to the CV (by "Use all"), so "Done" leaves it alone. */
  applied?: boolean;
};

type Phase = "drafting" | "streaming" | "done" | "error";

function update(list: Proposal[], key: string, change: (p: Proposal) => Proposal): Proposal[] {
  return list.map((p) => (p.key === key ? change(p) : p));
}

/** How the proposals change with one event of stream `run`. Only streaming proposals take new text. */
function onEvent(list: Proposal[], run: number, e: RewriteEvent): Proposal[] {
  if (e.event === "error" || e.event === "done") return list;
  const key = `${run}:${e.data.index}`;
  const streaming = (change: (p: Proposal) => Proposal) => update(list, key, (p) => (p.state === "streaming" ? change(p) : p));
  switch (e.event) {
    case "start":
      if (list.some((p) => p.key === key)) return list;
      return [...list, { key, index: e.data.index, replaces: e.data.replaces, text: "", state: "streaming" }];
    case "delta":
      return streaming((p) => ({ ...p, text: p.text + e.data.text }));
    case "ready":
      return streaming((p) => ({ ...p, text: e.data.text, state: "ready" }));
    case "dropped":
      return streaming((p) => ({ ...p, state: "dropped", reason: e.data.reason }));
  }
}

const toAccepted = (list: Proposal[]) => list.map((p) => ({ replaces: p.replaces, text: p.text }));

/**
 * The role's rewritten bullets as they stream in. Text shows live but muted; only proposals that
 * passed every check get "Use this". Everything accepted is applied as one action.
 */
export function RewriteReview({ role, dispatch, onClose }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [phase, setPhase] = useState<Phase>("drafting");
  const [run, setRun] = useState(0);
  const roleId = role.id;

  useEffect(() => {
    const controller = streamRewrite("/v1/enrich/rewrite-role", { roleId }, (e) => {
      if (e.event === "start") setPhase((p) => (p === "drafting" ? "streaming" : p));
      else if (e.event === "done") setPhase("done");
      else if (e.event === "error") setPhase("error");
      setProposals((list) => onEvent(list, run, e));
    });
    return () => controller.abort();
  }, [roleId, run]);

  const set = (key: string, state: "used" | "kept") =>
    setProposals((list) => update(list, key, (p) => (p.state === "ready" ? { ...p, state } : p)));

  // Starts over. Proposals already used stay; everything else comes again from the new stream.
  const retry = () => {
    setProposals((list) => list.filter((p) => p.state === "used"));
    setPhase("drafting");
    setRun((n) => n + 1);
  };

  const ready = proposals.filter((p) => p.state === "ready");

  const useAll = () => {
    if (ready.length === 0) return;
    dispatch({ type: "applyProposals", roleId, accepted: toAccepted(ready) });
    const used = new Set(ready.map((p) => p.key));
    setProposals((list) => list.map((p) => (used.has(p.key) ? { ...p, state: "used", applied: true } : p)));
  };

  const done = () => {
    const chosen = proposals.filter((p) => p.state === "used" && !p.applied);
    if (chosen.length > 0) dispatch({ type: "applyProposals", roleId, accepted: toAccepted(chosen) });
    onClose();
  };

  const finished = phase === "done" || phase === "error";
  const nothing = phase === "done" && !proposals.some((p) => p.state !== "dropped");

  return (
    <div className="rewrite-review">
      <button type="button" className="link" onClick={done}>
        {t("enrich.backToScore")}
      </button>
      {phase === "drafting" ? (
        <div className="box">
          <p className="working" role="status">
            {t("enrich.review.drafting")}
          </p>
        </div>
      ) : (
        <>
          <p className="p-sub">{t("enrich.review.title")}</p>
          {proposals.map((p) => (
            <ProposalRow key={p.key} p={p} role={role} stopped={finished} onUse={() => set(p.key, "used")} onKeep={() => set(p.key, "kept")} />
          ))}
          {nothing && <p className="review-note">{t("enrich.review.nothing")}</p>}
          {phase === "error" && (
            <p className="review-note" role="alert">
              {t(proposals.length > 0 ? "enrich.review.broken" : "enrich.review.failed")}{" "}
              <button type="button" className="link" onClick={retry}>
                {t("enrich.review.tryAgain")}
              </button>
            </p>
          )}
          <div className="row-btns">
            {ready.length > 1 && (
              <button type="button" className="btn" onClick={useAll}>
                {t("enrich.review.useAll", { n: ready.length })}
              </button>
            )}
            <button type="button" className="btn primary" onClick={done}>
              {t("enrich.review.done")}
            </button>
          </div>
          <p className="fine">{t("enrich.review.history")}</p>
        </>
      )}
    </div>
  );
}

type RowProps = { p: Proposal; role: Experience; stopped: boolean; onUse(): void; onKeep(): void };

/** One proposal: the bullet it replaces (or "New bullet"), the new text, and what can be done with it. */
function ProposalRow({ p, role, stopped, onUse, onKeep }: RowProps) {
  const original = p.replaces === null ? undefined : role.bullets.find((b) => b.id === p.replaces);
  // A half-written proposal whose stream stopped is shown as it was left, never with buttons.
  const live = p.state === "streaming" && !stopped;
  return (
    <div className={`prop ${live ? "streaming" : p.state === "streaming" ? "stopped" : p.state}`}>
      {p.state === "used" ? (
        <span className="prop-state">{t("enrich.review.used")}</span>
      ) : p.replaces === null ? (
        <span className="prop-label">{t("enrich.review.newBullet")}</span>
      ) : (
        original && <span className="prop-old">{original.text}</span>
      )}
      <span className="prop-new">{p.text}</span>
      {p.state === "dropped" && p.reason && <span className="prop-why">{t(`enrich.drop.${p.reason}`)}</span>}
      {live && <span className="prop-hint">{t("enrich.review.writing")}</span>}
      {p.state === "ready" && (
        <div className="row-btns">
          <button type="button" className="btn primary" onClick={onUse}>
            {t("enrich.review.use")}
          </button>
          <button type="button" className="btn" onClick={onKeep}>
            {t("enrich.review.keep")}
          </button>
        </div>
      )}
    </div>
  );
}
