import { CATEGORY, type FlagLevel, type Locale, type SectionKey } from "@resumora/shared";
import { t } from "../../i18n/t.ts";

type Props = {
  sectionKey: SectionKey;
  level: FlagLevel;
  locale: Locale;
  onAdd(key: SectionKey): void;
};

/** A dashed box where a section is missing: what it is, why it helps, and one button to add it. */
export function MissingBox({ sectionKey, level, locale, onAdd }: Props) {
  const label = CATEGORY[sectionKey].label[locale];
  const why = CATEGORY[sectionKey].why;
  return (
    <div className={level === "tip" ? "ghost tip" : "ghost"} role="group" aria-label={label} data-missing={sectionKey}>
      <b>{label}</b>
      <span className="note">{t(level === "tip" ? "edit.missing.tip" : "edit.missing.missing", { why })}</span>
      <button type="button" className="btn" onClick={() => onAdd(sectionKey)}>
        {t("edit.missing.add")}
      </button>
    </div>
  );
}
