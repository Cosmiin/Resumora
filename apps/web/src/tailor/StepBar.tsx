import type { MatchScore, TailorSection } from "@resumora/shared";
import { t } from "../i18n/t.ts";

type Props = {
  sections: TailorSection[];
  current: TailorSection | null;
  base: number | null;
  latest: number | null;
  score?: MatchScore | null;
  /** Steps that open (finished ones, and Experience once a role is finished); none while a step is loading. */
  open?: TailorSection[];
  onOpen?(section: TailorSection): void;
  /** The Tone and questions screens, reachable once tailoring has started. */
  onSteer?(): void;
};

export function StepBar({ sections, current, base, latest, score, open = [], onOpen, onSteer }: Props) {
  const index = current ? sections.indexOf(current) : sections.length;
  const total = latest ?? base;
  const started = current !== null || !!onOpen || !!onSteer;
  return <nav className="tailor-steps" aria-label={t("tailor.steps")}>
    <ol className="page-tabs">
      {onSteer && <li className="is-done">✓ <button type="button" className="tailor-step-link" onClick={onSteer}>{t("tailor.steps.steering")}</button></li>}
      {sections.map((section, i) => <li key={section} aria-current={section === current ? "step" : undefined}
        className={i < index ? "is-done" : section === current ? "is-current" : undefined}>
        {started && i < index && "✓ "}
        {onOpen && open.includes(section)
          ? <button type="button" className="tailor-step-link" onClick={() => onOpen(section)}>{t(`tailor.section.${section}`)}</button>
          : t(`tailor.section.${section}`)}
      </li>)}
    </ol>
    {total !== null && <span className="tailor-score" role="status">
      {t("tailor.score", { latest: total })}
      {base !== null && latest !== null && latest !== base && <> <s>{base}</s></>}
      {score?.capped && score.total === 69 && !!score.cappedBy?.length && <small style={{ display: "block" }}>
        {t("tailor.scoreCapped", { list: score.cappedBy.join(", ") })}
      </small>}
    </span>}
  </nav>;
}
