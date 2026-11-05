import type { CSSProperties } from "react";
import { atsChecks, band, clearCount, type Experience } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { atsTipText, issueTip } from "./tips.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  role: Experience;
  score: RoleScoreState;
  onAnswer(): void;
  onRewrite(): void;
  onRetry(): void;
};

const bandClass = { clear: "is-clear", goodStart: "is-good", needsWork: "is-work" } as const;

/** At most two tips: the model's next step first, then the first format (ATS) tip. */
function tipsOf(role: Experience, score: RoleScoreState): { text: string; ats: boolean }[] {
  const tips: { text: string; ats: boolean }[] = [];
  const next = score.result?.nextStep;
  if (next) tips.push({ text: issueTip(next.issue, next.tip), ats: false });
  const ats = atsChecks(role)[0];
  if (ats) tips.push({ text: atsTipText(ats), ats: true });
  return tips.slice(0, 2);
}

/** The score, what to fix first, and the two actions: the top of a role's tools in the panel. */
export function ScoreCard({ role, score, onAnswer, onRewrite, onRetry }: Props) {
  const hasBullets = role.bullets.some((b) => b.text.trim() !== "");
  const result = score.result;
  const n = result?.score ?? null;
  const shown = score.state !== "none" && score.state !== "unavailable" && result !== undefined && n !== null;

  let head;
  if (shown) {
    const b = band(n);
    const { clear, total } = clearCount(result);
    head = (
      <div className="score-top">
        <div className={`score-ring ${bandClass[b]}`} style={{ "--v": n } as CSSProperties}>
          <span>{n}</span>
        </div>
        <div className="score-meta">
          <strong>{t(`enrich.band.${b}`)}</strong>
          <span>{t("enrich.card.clearCount", { clear, total })}</span>
          <span>{t("enrich.card.about")}</span>
        </div>
      </div>
    );
  } else if (score.state === "unavailable") {
    head = (
      <div className="score-top">
        <div className="score-meta">
          <strong>{t("enrich.card.unavailable")}</strong>
          <button type="button" className="btn" onClick={onRetry}>
            {t("enrich.card.tryAgain")}
          </button>
        </div>
      </div>
    );
  } else {
    head = (
      <div className="score-top">
        <div className="score-meta">
          <strong>{t(score.state === "none" ? "enrich.pill.noBullets" : "enrich.card.scoring")}</strong>
        </div>
      </div>
    );
  }

  const tips = shown ? tipsOf(role, score) : [];
  const questions = score.state === "ready" ? (result?.questions.length ?? 0) : 0;

  return (
    <div className="box score-card">
      {head}
      {score.state === "previous" && <p className="fine">{t("enrich.card.previous")}</p>}
      {shown && (
        <ul className="tips">
          {tips.length === 0 ? (
            <li>{t("enrich.card.allClear")}</li>
          ) : (
            tips.map((tip) => (
              <li key={tip.text}>
                {tip.text}
                {tip.ats && <small className="tip-kind">{t("enrich.card.formatTip")}</small>}
              </li>
            ))
          )}
        </ul>
      )}
      {hasBullets && (
        <div className="row-btns">
          {questions > 0 && (
            <button type="button" className="btn primary" onClick={onAnswer}>
              {t(questions === 1 ? "enrich.card.answerOne" : "enrich.card.answerMany", { n: questions })}
            </button>
          )}
          <button type="button" className={questions > 0 ? "btn" : "btn primary"} onClick={onRewrite}>
            {t("enrich.card.rewrite")}
          </button>
        </div>
      )}
    </div>
  );
}
