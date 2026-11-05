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
};

type Phase = "drafting" | "streaming" | "done" | "error";

/** Ready or used: a proposal that a retry keeps, and that a new one for the same bullet would repeat. */
const settled = (p: Proposal) => p.state === "ready" || p.state === "used";

function update(list: Proposal[], key: string, change: (p: Proposal) => Proposal): Proposal[] {
  return list.map((p) => (p.key === key ? change(p) : p));
}

/** How the proposals change with one event of stream `run`. Only streaming proposals take new text. */
export function onEvent(list: Proposal[], run: number, e: RewriteEvent): Proposal[] {
  if (e.event === "error" || e.event === "done") return list;
  const key = `${run}:${e.data.index}`;
  const streaming = (change: (p: Proposal) => Proposal) => update(list, key, (p) => (p.state === "streaming" ? change(p) : p));
  switch (e.event) {
    case "start": {
      const { replaces } = e.data;
      if (list.some((p) => p.key === key)) return list;
      // After a retry, a bullet that already has a ready or used proposal keeps it.
      if (replaces !== null && list.some((p) => p.replaces === replaces && settled(p))) return list;
      return [...list, { key, index: e.data.index, replaces, text: "", state: "streaming" }];
    }
    case "delta":
      return streaming((p) => ({ ...p, text: p.text + e.data.text }));
    case "ready": {
      const { text } = e.data;
      const own = list.find((p) => p.key === key);
      // A new bullet that repeats one already offered is left out.
      const repeat = own?.replaces === null && list.some((p) => p.key !== key && p.replaces === null && settled(p) && p.text === text);
      if (repeat) return list.filter((p) => p.key !== key);
      return streaming((p) => ({ ...p, text, state: "ready" }));
    }
    case "dropped":
      return streaming((p) => ({ ...p, state: "dropped", reason: e.data.reason }));
  }
}

/**
 * The role's rewritten bullets as they stream in. Text shows live but muted; only proposals that
 * passed every check get "Use this", which applies it at once. "Use all" applies the rest as one action.
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

  const exists = (p: Proposal) => p.replaces === null || role.bullets.some((b) => b.id === p.replaces);
  const usable = proposals.filter((p) => p.state === "ready" && exists(p));

  const apply = (list: Proposal[]) => {
    if (list.length === 0) return;
    dispatch({ type: "applyProposals", roleId, accepted: list.map((p) => ({ replaces: p.replaces, text: p.text })) });
    const used = new Set(list.map((p) => p.key));
    setProposals((all) => all.map((p) => (used.has(p.key) ? { ...p, state: "used" } : p)));
  };

  const keep = (key: string) => setProposals((list) => update(list, key, (p) => (p.state === "ready" ? { ...p, state: "kept" } : p)));

  // Starts over. Ready and used proposals stay; the new stream fills in the rest.
  const retry = () => {
    setProposals((list) => list.filter(settled));
    setPhase("drafting");
    setRun((n) => n + 1);
  };

  const finished = phase === "done" || phase === "error";
  const nothing = phase === "done" && !proposals.some((p) => p.state !== "dropped");

  return (
    <div className="rewrite-review">
      <button type="button" className="link" onClick={onClose}>
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
            <ProposalRow key={p.key} p={p} role={role} stopped={finished} onUse={() => apply([p])} onKeep={() => keep(p.key)} />
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
            {usable.length > 1 && (
              <button type="button" className="btn small" onClick={() => apply(usable)}>
                {t("enrich.review.useAll", { n: usable.length })}
              </button>
            )}
            <button type="button" className="btn small" onClick={onClose}>
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
  const removed = p.replaces !== null && !original && p.state !== "used";
  // A half-written proposal whose stream stopped is shown as it was left, never with buttons.
  const live = p.state === "streaming" && !stopped;
  return (
    <div className={`prop ${live ? "streaming" : p.state === "streaming" ? "stopped" : p.state}`}>
      {p.state === "used" ? (
        <span className="prop-state">{t("enrich.review.used")}</span>
      ) : p.replaces === null ? (
        <span className="prop-label">{t("enrich.review.newBullet")}</span>
      ) : removed ? (
        <span className="prop-label">{t("enrich.review.removed")}</span>
      ) : (
        <span className="prop-old">{original?.text}</span>
      )}
      <span className="prop-new">{p.text}</span>
      {p.state === "dropped" && p.reason && <span className="prop-why">{t(`enrich.drop.${p.reason}`)}</span>}
      {live && <span className="prop-hint">{t("enrich.review.writing")}</span>}
      {p.state === "ready" && !removed && (
        <div className="row-btns">
          <button type="button" className="btn small primary" onClick={onUse}>
            {t("enrich.review.use")}
          </button>
          <button type="button" className="btn small" onClick={onKeep}>
            {t("enrich.review.keep")}
          </button>
        </div>
      )}
    </div>
  );
}
