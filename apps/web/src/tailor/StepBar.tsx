import type { TailorSection } from "@resumora/shared";
import { t } from "../i18n/t.ts";

type Props = { sections: TailorSection[]; current: TailorSection | null; base: number | null; latest: number | null };

export function StepBar({ sections, current, base, latest }: Props) {
  const index = current ? sections.indexOf(current) : sections.length;
  return <nav className="tailor-steps" aria-label={t("tailor.steps")}>
    <ol>
      {sections.map((section, i) => <li key={section} aria-current={section === current ? "step" : undefined}
        className={i < index ? "is-done" : section === current ? "is-current" : undefined}>
        {t(`tailor.section.${section}`)}
      </li>)}
    </ol>
    {base !== null && <span className="tailor-score" role="status">
      {latest !== null && latest !== base ? t("tailor.scoreUp", { base, latest }) : t("tailor.score", { base })}
    </span>}
  </nav>;
}
