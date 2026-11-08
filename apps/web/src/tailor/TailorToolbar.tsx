import type { ReactNode } from "react";
import type { MatchScore } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";

export type TailoredTab = "cv" | "letter";

type Props = {
  tab: TailoredTab;
  onTab(tab: TailoredTab): void;
  /** Score 1 (Base CV) and this tailored CV's Score 2. */
  base: MatchScore | null;
  latest: MatchScore | null;
  /** Actions later tasks fill in (Re-tailor, Language); the rest stay placeholders until their tasks. */
  children?: ReactNode;
};

const total = (score: MatchScore | null) => (score?.total ?? null) === null ? "—" : String(score!.total);

/** Tabs CV | Cover letter, the score lift and the tailored CV's actions. */
export function TailorToolbar({ tab, onTab, base, latest, children }: Props) {
  const band = latest?.band ?? base?.band;
  return (
    <div className="tailored-bar">
      <div className="tailored-tabs" role="tablist" aria-label={t("tailored.tabs")}>
        {(["cv", "letter"] as const).map((key) => (
          <button key={key} type="button" role="tab" className="secondary" aria-selected={tab === key} onClick={() => onTab(key)}>
            {t(key === "cv" ? "tailored.tab.cv" : "tailored.tab.letter")}
          </button>
        ))}
      </div>
      {band && (
        <span className="tailored-score">
          {t("tailored.score", { base: total(base), latest: total(latest ?? base), band: t(`job.score.band.${band}` as MessageKey) })}
        </span>
      )}
      <button type="button" className="secondary" aria-disabled="true" title={t("tailored.soon")}>{t("tailored.template")}</button>
      {children}
      <button type="button" className="secondary" aria-disabled="true" title={t("tailored.soon")}>{t("tailored.export")}</button>
    </div>
  );
}
