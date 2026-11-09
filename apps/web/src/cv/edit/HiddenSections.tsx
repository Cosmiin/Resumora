import { useId, useState } from "react";
import type { SectionKey } from "@resumora/shared";
import { t } from "../../i18n/t.ts";

export type HiddenSection = { key: SectionKey; name: string; empty: boolean };

/** Tailored CV, under the page: "N sections hidden (M empty) · Show", opening a list to show each one again. */
export function HiddenSections({ sections, onShow }: { sections: HiddenSection[]; onShow(key: SectionKey): void }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (sections.length === 0) return null;
  const empty = sections.filter((section) => section.empty).length;
  const line = t(sections.length === 1 ? "edit.hidden.one" : "edit.hidden.many", { n: sections.length })
    + (empty > 0 ? ` ${t("edit.hidden.empty", { n: empty })}` : "");
  return (
    <div className="hidden-sections">
      <p>
        <span>{line}</span>
        {" · "}
        <button type="button" className="link" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
          {t("edit.hidden.show")}
        </button>
      </p>
      {open && (
        <ul id={listId} aria-label={t("edit.hidden.list")}>
          {sections.map((section) => (
            <li key={section.key}>
              <span>{section.name}</span>
              {section.empty && <small>{t("edit.hidden.emptyTag")}</small>}
              <button type="button" className="secondary" aria-label={t("edit.hidden.showNamed", { name: section.name })}
                onClick={() => onShow(section.key)}>
                {t("edit.hidden.show")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
