import { Fragment, memo, useCallback, useRef } from "react";
import { newId, type Locale } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import type { MessageKey } from "../../../i18n/en.ts";
import type { CvAction } from "../cvReducer.ts";
import { DragList } from "../DragList.tsx";
import { ItemDate } from "../ItemDate.tsx";
import { ItemField } from "../ItemField.tsx";
import { useFocusAfterRender } from "../useFocusAfterRender.ts";
import { AddButton } from "./AddButton.tsx";
import { RemoveButton } from "./RemoveButton.tsx";

export type SimpleList = "languages" | "certifications" | "projects" | "awards" | "courses" | "publications";

type Spec = { field: string; label: MessageKey; placeholder?: MessageKey };

/** Every text field of an item: the main one, small details after it, a date, a longer description. */
type Config = { main: Spec; details: Spec[]; date?: Spec; description?: Spec };

const LEVEL: MessageKey = "edit.list.placeholder.level";
const ISSUER: MessageKey = "edit.list.placeholder.issuer";
const LINK: MessageKey = "edit.list.placeholder.url";
const DESCRIPTION: MessageKey = "edit.list.placeholder.description";
const PROVIDER: MessageKey = "edit.list.placeholder.provider";
const PUBLISHER: MessageKey = "edit.list.placeholder.publisher";
const DATE: MessageKey = "edit.list.placeholder.date";

const CONFIG: Record<SimpleList, Config> = {
  languages: {
    main: { field: "name", label: "edit.list.languages.name" },
    details: [{ field: "level", label: "edit.list.languages.level", placeholder: LEVEL }],
  },
  certifications: {
    main: { field: "name", label: "edit.list.certifications.name" },
    details: [{ field: "issuer", label: "edit.list.certifications.issuer", placeholder: ISSUER }],
    date: { field: "date", label: "edit.list.certifications.date", placeholder: DATE },
  },
  projects: {
    main: { field: "name", label: "edit.list.projects.name" },
    details: [{ field: "url", label: "edit.list.projects.url", placeholder: LINK }],
    description: { field: "description", label: "edit.list.projects.description", placeholder: DESCRIPTION },
  },
  awards: {
    main: { field: "name", label: "edit.list.awards.name" },
    details: [{ field: "issuer", label: "edit.list.awards.issuer", placeholder: ISSUER }],
    date: { field: "date", label: "edit.list.awards.date", placeholder: DATE },
    description: { field: "description", label: "edit.list.awards.description", placeholder: DESCRIPTION },
  },
  courses: {
    main: { field: "name", label: "edit.list.courses.name" },
    details: [{ field: "provider", label: "edit.list.courses.provider", placeholder: PROVIDER }],
    date: { field: "date", label: "edit.list.courses.date", placeholder: DATE },
  },
  publications: {
    main: { field: "title", label: "edit.list.publications.title" },
    details: [
      { field: "publisher", label: "edit.list.publications.publisher", placeholder: PUBLISHER },
      { field: "url", label: "edit.list.publications.url", placeholder: LINK },
    ],
    date: { field: "date", label: "edit.list.publications.date", placeholder: DATE },
  },
};

type Row = { id: string } & Record<string, unknown>;
type Dispatch = (a: CvAction) => void;

const ListRow = memo(function ListRow({
  list,
  item,
  locale,
  dispatch,
}: {
  list: SimpleList;
  item: Row;
  locale: Locale;
  dispatch: Dispatch;
}) {
  const { main, details, date, description } = CONFIG[list];
  const text = (field: string) => String(item[field] ?? "");
  const mainText = text(main.field);
  const remove = useCallback(
    () => dispatch({ type: "removeItem", list, itemId: item.id }),
    [dispatch, list, item.id],
  );
  const field = (spec: Spec, className?: string, multiline?: boolean) => (
    <ItemField
      list={list}
      itemId={item.id}
      field={spec.field}
      className={className}
      multiline={multiline}
      value={text(spec.field)}
      label={t(spec.label)}
      placeholder={t(spec.placeholder ?? spec.label)}
      dispatch={dispatch}
    />
  );
  return (
    <div className="cv-line" data-item={item.id} role="group" aria-label={mainText || t(main.label)}>
      <div className="cv-item-head">
        {field(main, "cv-item-title")}
        {date && (
          <span className="cv-item-dates">
            <ItemDate
              list={list}
              itemId={item.id}
              field={date.field}
              value={text(date.field)}
              locale={locale}
              label={t(date.label)}
              placeholder={t(date.placeholder ?? date.label)}
              dispatch={dispatch}
            />
          </span>
        )}
        <RemoveButton name={mainText || t(main.label)} onClick={remove} />
      </div>
      <div className="cv-item-details">
        {details.map((spec, i) => (
          <Fragment key={spec.field}>
            {i > 0 && (
              <span className="sep" aria-hidden="true">
                ·
              </span>
            )}
            {field(spec, "cv-item-sub")}
          </Fragment>
        ))}
      </div>
      {description && field(description, undefined, true)}
    </div>
  );
});

/** Every text field of each item, laid out like the CV: main text, details, date, description. */
export function SimpleListEdit({
  list,
  items,
  locale,
  dispatch,
}: {
  list: SimpleList;
  items: Row[];
  locale: Locale;
  dispatch: Dispatch;
}) {
  const root = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender(root);
  const add = useCallback(() => {
    const id = newId();
    dispatch({ type: "addItem", list, id });
    focusLater(`${list}-${id}-${CONFIG[list].main.field}`);
  }, [dispatch, list, focusLater]);
  const move = useCallback((from: number, to: number) => dispatch({ type: "moveItem", list, from, to }), [dispatch, list]);
  const label = useCallback(
    (item: Row) => String(item[CONFIG[list].main.field] ?? "") || t(CONFIG[list].main.label),
    [list],
  );
  return (
    <div ref={root}>
      <DragList items={items} onMove={move} label={label}>
        {(item) => <ListRow list={list} item={item} locale={locale} dispatch={dispatch} />}
      </DragList>
      <AddButton label={t("edit.add.item")} onClick={add} />
    </div>
  );
}
