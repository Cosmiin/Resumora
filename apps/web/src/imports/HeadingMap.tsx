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
  // An Other heading owns the custom section with the same title. A heading with no title match
  // takes the next section that no heading names; a row with none left has no choice.
  const norm = (s: string) => s.trim().toLowerCase();
  const named = new Set(headings.filter((h) => h.category === "other").map((h) => norm(h.heading)));
  const spare = content.custom.filter((c) => !named.has(norm(c.title)));
  const taken = new Set<string>();
  let spareAt = 0;
  const entryFor = (heading: string) => {
    const match = content.custom.find((c) => !taken.has(c.id) && norm(c.title) === norm(heading));
    const entry = match ?? spare[spareAt++];
    if (entry) taken.add(entry.id);
    return entry;
  };
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
            const entry = h.category === "other" ? entryFor(h.heading) : undefined;
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
