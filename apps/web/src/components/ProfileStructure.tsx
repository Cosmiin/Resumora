import {
  clone,
  localId,
  type BaseDraft,
  type OptionalKind,
} from "../base/model";
import { moveItem } from "../base/editing";
import { sectionName } from "../base/sections";
import { Sortable, Visibility } from "./InlineControls";
import { LanguageContext, useCopy } from "./ui";
import { useContext } from "react";

/** Export settings only. Profile content is edited in the document itself. */
export function ProfileStructure({
  draft: d,
  change,
}: {
  draft: BaseDraft;
  change: (draft: BaseDraft) => void;
}) {
  const t = useCopy(),
    locale = useContext(LanguageContext);
  return (
    <div className="profile-structure-settings">
      <details>
        <summary>
          {t("Structura CV-ului exportat", "Exported CV structure")}
        </summary>
        <p className="small muted">
          {t(
            "Alege ordinea și vizibilitatea secțiunilor în CV-ul exportat.",
            "Choose the section order and visibility in your exported CV.",
          )}
        </p>
        {d.presentation.order.map((id, i) => (
          <Sortable
            key={id}
            group="sections"
            index={i}
            label={sectionName(id, locale, d)}
            move={(from, to) => {
              const next = clone(d);
              next.presentation.order = moveItem(
                next.presentation.order,
                from,
                to,
              );
              change(next);
            }}
          >
            <span>{sectionName(id, locale, d)}</span>
            <Visibility
              keyboardReachable
              label={sectionName(id, locale, d)}
              visible={!d.presentation.hidden.includes(id)}
              toggle={() => {
                const next = clone(d);
                next.presentation.hidden = next.presentation.hidden.includes(id)
                  ? next.presentation.hidden.filter((s) => s !== id)
                  : [...next.presentation.hidden, id];
                change(next);
              }}
            />
          </Sortable>
        ))}
      </details>
      <label>
        {t("Adaugă secțiune în profil", "Add profile section")}
        <select
          className="native"
          value=""
          onChange={(event) => {
            const kind = event.target.value as OptionalKind;
            if (!kind) return;
            const next = clone(d),
              id = localId();
            next.optionalSections.push({ id, kind, label: "", entries: [] });
            next.presentation.order.push(id);
            change(next);
            requestAnimationFrame(() =>
              document
                .getElementById(`profile-section-${id}`)
                ?.scrollIntoView?.({ block: "center" }),
            );
          }}
        >
          <option value="">
            {t("Alege o secțiune…", "Choose a section…")}
          </option>
          {(
            [
              "projects",
              "certifications",
              "languages",
              "volunteering",
              "custom",
            ] as OptionalKind[]
          ).map((kind) => (
            <option key={kind} value={kind}>
              {sectionName(kind, locale)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
