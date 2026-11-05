import type { CSSProperties } from "react";
import { atsChecks, band, clearCount, type Experience } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { atsTipText, issueTip } from "./tips.ts";
import type { FocusMode } from "./useFocusSession.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  role: Experience;
  score: RoleScoreState;
  /** Opens focus mode on this role. */
  onImprove(mode: FocusMode): void;
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
export function ScoreCard({ role, score, onImprove, onRetry }: Props) {
  const hasBullets = role.bullets.some((b) => b.text.trim() !== "");
  const result = score.result;
  const n = result?.score ?? null;
  const shown = score.state !== "none" && result !== undefined && n !== null;
  // While a new score is on its way, or after it failed, the score shown is for earlier text.
  const previous = shown && score.state !== "ready";
  const retry = score.state === "unavailable" && (
    <div className="score-meta">
      <strong>{t("enrich.card.unavailable")}</strong>
      <button type="button" className="btn" onClick={onRetry}>
        {t("enrich.card.tryAgain")}
      </button>
    </div>
  );

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
    head = <div className="score-top">{retry}</div>;
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
  // At 80+ the only way up is a result (a number, scale, frequency or reason).
  const standOut = shown && n !== null && n >= 80 && result !== undefined && result.bullets.some((b) => b.impact !== "specific");

  return (
    <div className="box score-card">
      {head}
      {shown && retry}
      {previous && <p className="fine">{t("enrich.card.previous")}</p>}
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
      {standOut && <p className="stand-out-hint">{t("enrich.card.standOutHint")}</p>}
      {(hasBullets || role.bullets.length <= 2) && n !== 100 && (
        <div className="row-btns">
          <button type="button" className="btn primary" onClick={() => onImprove(standOut ? "standOut" : "improve")}>
            {t(standOut ? "enrich.card.standOut" : "enrich.card.improve")}
          </button>
        </div>
      )}
    </div>
  );
}
