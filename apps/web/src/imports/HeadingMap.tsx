import { CATEGORY, MOVE_TARGETS, type CvContent, type MoveTarget, type SectionKey, type SourceHeading } from "@resumora/shared";
import { t } from "../i18n/t.ts";

function itemCount(content: CvContent, key: SectionKey, entry: unknown): number {
  switch (key) {
    case "summary":
      return content.basics.summary.trim() ? 1 : 0;
    case "achievements":
      return content.achievements.filter((b) => b.text.trim() !== "").length;
    case "skills":
      return content.technicalSkills.length + content.professionalSkills.length + content.unclearSkills.length;
    case "other":
      return entry ? 1 : 0;
    default:
      return content[key].length;
  }
}

/** Every heading from the original file, where it was placed, and a "Move to" for Other sections. */
export function HeadingMap(props: {
  headings: SourceHeading[];
  content: CvContent;
  /** headingIndex is the row that was moved. */
  onMove(customId: string, target: MoveTarget, headingIndex: number): void;
}) {
  const { headings, content, onMove } = props;
  if (headings.length === 0) return null;
  const locale = content.locale;
  // The i-th Other heading is the i-th custom section; a row with no section left has no choice.
  let others = 0;
  return (
    <section className="map-wrap" aria-label={t("import.map.title")}>
      <h3 className="map-title">{t("import.map.title")}</h3>
      <table className="map">
        <thead>
          <tr>
            <th scope="col">{t("import.map.original")}</th>
            <th scope="col">{t("import.map.placed")}</th>
            <th scope="col">{t("import.map.items")}</th>
          </tr>
        </thead>
        <tbody>
          {headings.map((h, i) => {
            const entry = h.category === "other" ? content.custom[others++] : undefined;
            return (
              <tr key={`${h.heading}-${i}`} className={h.category === "other" ? "other" : undefined}>
                <td className="orig">{h.heading}</td>
                <td className="cat">
                  {CATEGORY[h.category].label[locale]}
                  {entry && (
                    <select
                      aria-label={t("import.map.moveLabel", { heading: h.heading })}
                      value=""
                      onChange={(e) => e.target.value && onMove(entry.id, e.target.value as MoveTarget, i)}
                    >
                      <option value="">{t("import.map.moveTo")}</option>
                      {MOVE_TARGETS.map((k) => (
                        <option key={k} value={k}>{CATEGORY[k].label[locale]}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="n">{itemCount(content, h.category, entry)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
