import { useEffect, useRef } from "react";
import { t } from "../../i18n/t.ts";

type Props = {
  before: string;
  after: string;
  bulletBefore: number;
  bulletAfter: number;
  busy: boolean;
  onUse(): void;
  onKeep(): void;
};

/** The graded rewrite of one bullet: old text struck through, new text, both scores. */
export function ProposalStep({ before, after, bulletBefore, bulletAfter, busy, onUse, onKeep }: Props) {
  const use = useRef<HTMLButtonElement>(null);
  useEffect(() => use.current?.focus(), []);

  return (
    <>
      <p className="fm-eyebrow">{t("enrich.focus.proposal.eyebrow")}</p>
      <h2 className="visually-hidden" id="fm-step-title">{t("enrich.focus.proposal.eyebrow")}</h2>
      <div className="fm-compare">
        <p className="fm-was">
          <span className="visually-hidden">{t("enrich.focus.proposal.was")}: </span>
          <s>{before}</s>
        </p>
        <p className="fm-now">
          <span className="visually-hidden">{t("enrich.focus.proposal.now")}: </span>
          {after}
        </p>
      </div>
      <p className="fm-grade">
        <span className="fm-tag is-low">{bulletBefore}</span>
        <span aria-hidden="true">→</span>
        <span className="fm-tag is-up">{bulletAfter}</span>
        <span className="visually-hidden">{t("enrich.focus.proposal.grade", { from: bulletBefore, to: bulletAfter })}</span>
      </p>
      <div className="fm-foot">
        <button type="button" className="fm-ghost" onClick={onKeep} disabled={busy}>
          {t("enrich.focus.proposal.keep")}
        </button>
        <button ref={use} type="button" className="fm-btn" onClick={onUse} disabled={busy}>
          {t("enrich.focus.proposal.use")}
        </button>
      </div>
    </>
  );
}
