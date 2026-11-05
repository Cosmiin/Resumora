import { memo, useCallback, useRef } from "react";
import { newId, type CvContent, type Locale } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import type { MessageKey } from "../../../i18n/en.ts";
import type { CvAction } from "../cvReducer.ts";
import { DragList } from "../DragList.tsx";
import { ItemDate } from "../ItemDate.tsx";
import { ItemField } from "../ItemField.tsx";
import { useFocusAfterRender } from "../useFocusAfterRender.ts";
import { AddButton } from "./AddButton.tsx";
import { RemoveButton } from "./RemoveButton.tsx";

type Dispatch = (a: CvAction) => void;
type Education = CvContent["education"][number];
const educationName = (e: Education) => e.degree || e.school || t("edit.education.untitledGroup");

const EducationItem = memo(function EducationItem({
  item,
  locale,
  dispatch,
}: {
  item: Education;
  locale: Locale;
  dispatch: Dispatch;
}) {
  const itemId = item.id;
  const remove = useCallback(() => dispatch({ type: "removeItem", list: "education", itemId }), [dispatch, itemId]);
  const field = (
    f: "degree" | "school" | "field" | "notes",
    label: MessageKey,
    className?: string,
    multiline?: boolean,
    placeholder: MessageKey = label,
  ) => (
    <ItemField
      list="education"
      itemId={itemId}
      field={f}
      value={item[f]}
      label={t(label)}
      placeholder={t(placeholder)}
      className={className}
      multiline={multiline}
      dispatch={dispatch}
    />
  );
  const date = (f: "startDate" | "endDate", label: MessageKey) => (
    <ItemDate
      list="education"
      itemId={itemId}
      field={f}
      value={item[f]}
      locale={locale}
      label={t(label)}
      placeholder={t("edit.role.datePlaceholder")}
      dispatch={dispatch}
    />
  );
  return (
    <div className="cv-line cv-role" data-item={itemId} role="group" aria-label={educationName(item)}>
      <div className="cv-item-head">
        {field("degree", "edit.education.degree", "cv-item-title")}
        <span className="cv-item-dates cv-role-dates">
          {date("startDate", "edit.education.start")}
          <span aria-hidden="true">–</span>
          {date("endDate", "edit.education.end")}
        </span>
        <RemoveButton name={item.degree || item.school || t("edit.education.untitled")} onClick={remove} />
      </div>
      <div className="cv-item-details">
        {field("school", "edit.education.school", "cv-item-sub")}
        <span className="sep" aria-hidden="true">
          ·
        </span>
        {field("field", "edit.education.field", "cv-item-sub")}
      </div>
      {field("notes", "edit.education.notes", undefined, true, "edit.education.notesPlaceholder")}
    </div>
  );
});

export function EducationEdit({ items, locale, dispatch }: { items: Education[]; locale: Locale; dispatch: Dispatch }) {
  const root = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender(root);
  const add = useCallback(() => {
    const id = newId();
    dispatch({ type: "addItem", list: "education", id });
    focusLater(`education-${id}-degree`);
  }, [dispatch, focusLater]);
  const move = useCallback((from: number, to: number) => dispatch({ type: "moveItem", list: "education", from, to }), [dispatch]);
  return (
    <div ref={root}>
      <DragList items={items} onMove={move} label={educationName}>
        {(item) => <EducationItem item={item} locale={locale} dispatch={dispatch} />}
      </DragList>
      <AddButton label={t("edit.add.education")} onClick={add} />
    </div>
  );
}
