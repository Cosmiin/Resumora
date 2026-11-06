import { band, type RoleResult } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = { roleId: string; state: RoleScoreState; onOpen(): void };

const bandClass = { clear: "is-clear", goodStart: "is-good", needsWork: "is-good" } as const;

function shown(result: RoleResult | undefined) {
  return result && result.score !== null ? { n: result.score, b: band(result.score) } : null;
}

/** What a pill shows for a state: its text, spoken label and class names. */
function pillView(state: RoleScoreState): { text: string; label: string; cls: string } {
  const score = state.state === "none" ? null : shown(state.result);
  let text = "–";
  let label = t(state.state === "none" ? "enrich.pill.noBullets" : "enrich.pill.unavailable");
  let cls = "score-pill";
  if (state.state === "scoring") {
    text = "…";
    label = t("enrich.pill.scoring");
    cls += " is-busy";
  }
  if (score) {
    const name = t(`enrich.band.${score.b}`);
    text = String(score.n);
    cls += ` ${bandClass[score.b]}`;
    if (state.state === "ready") label = t("enrich.pill.label", { n: score.n, band: name });
    else {
      // an older score stays on show while the new one is worked out
      label = t(state.state === "scoring" ? "enrich.pill.scoring" : "enrich.pill.previous", { n: score.n, band: name });
      cls += " is-previous";
      if (state.state === "scoring") text = "…";
    }
  }
  return { text, label, cls };
}

/** A role's score beside its title. Editor-only: the read-only page and the PDF never draw it. */
export function ScorePill({ roleId, state, onOpen }: Props) {
  const { text, label, cls } = pillView(state);
  return (
    <button type="button" className={`${cls} no-print`} data-score-for={roleId} aria-label={label} onClick={onOpen}>
      {text}
    </button>
  );
}

/** The same pill as plain text, for inside another button. */
export function ScorePillBadge({ state }: { state: RoleScoreState }) {
  const { text, cls } = pillView(state);
  return (
    <span className={cls} aria-hidden="true">
      {text}
    </span>
  );
}
