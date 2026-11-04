import { memo, useCallback, useRef } from "react";
import { newId } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import type { MessageKey } from "../../../i18n/en.ts";
import type { CvAction } from "../cvReducer.ts";
import { ItemField } from "../ItemField.tsx";
import { useFocusAfterRender } from "../useFocusAfterRender.ts";
import { AddButton } from "./AddButton.tsx";
import { RemoveButton } from "./RemoveButton.tsx";

export type SimpleList = "languages" | "certifications" | "projects" | "awards" | "courses" | "publications";

type Line = {
  main: string;
  second: string;
  mainLabel: MessageKey;
  secondLabel: MessageKey;
  secondPlaceholder: MessageKey;
};

const LINES: Record<SimpleList, Line> = {
  languages: { main: "name", second: "level", mainLabel: "edit.list.languages.name", secondLabel: "edit.list.languages.level", secondPlaceholder: "edit.list.placeholder.level" },
  certifications: { main: "name", second: "issuer", mainLabel: "edit.list.certifications.name", secondLabel: "edit.list.certifications.issuer", secondPlaceholder: "edit.list.placeholder.issuer" },
  projects: { main: "name", second: "description", mainLabel: "edit.list.projects.name", secondLabel: "edit.list.projects.description", secondPlaceholder: "edit.list.placeholder.description" },
  awards: { main: "name", second: "issuer", mainLabel: "edit.list.awards.name", secondLabel: "edit.list.awards.issuer", secondPlaceholder: "edit.list.placeholder.issuer" },
  courses: { main: "name", second: "provider", mainLabel: "edit.list.courses.name", secondLabel: "edit.list.courses.provider", secondPlaceholder: "edit.list.placeholder.provider" },
  publications: { main: "title", second: "publisher", mainLabel: "edit.list.publications.title", secondLabel: "edit.list.publications.publisher", secondPlaceholder: "edit.list.placeholder.publisher" },
};

type Row = { id: string } & Record<string, unknown>;

const ListRow = memo(function ListRow({
  list,
  item,
  dispatch,
}: {
  list: SimpleList;
  item: Row;
  dispatch(a: CvAction): void;
}) {
  const line = LINES[list];
  const main = String(item[line.main] ?? "");
  const remove = useCallback(
    () => dispatch({ type: "removeItem", list, itemId: item.id }),
    [dispatch, list, item.id],
  );
  return (
    <div className="cv-line" data-item={item.id}>
      <ItemField
        list={list}
        itemId={item.id}
        field={line.main}
        className="cv-item-title"
        value={main}
        label={t(line.mainLabel)}
        placeholder={t(line.mainLabel)}
        dispatch={dispatch}
      />
      <ItemField
        list={list}
        itemId={item.id}
        field={line.second}
        className="cv-item-sub"
        value={String(item[line.second] ?? "")}
        label={t(line.secondLabel)}
        placeholder={t(line.secondPlaceholder)}
        dispatch={dispatch}
      />
      <RemoveButton name={main || t(line.mainLabel)} onClick={remove} />
    </div>
  );
});

/** One line per item: its main field and a second one (a language and its level, say). */
export function SimpleListEdit({
  list,
  items,
  dispatch,
}: {
  list: SimpleList;
  items: Row[];
  dispatch(a: CvAction): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender(root);
  const add = useCallback(() => {
    const id = newId();
    dispatch({ type: "addItem", list, id });
    focusLater(`${list}-${id}-${LINES[list].main}`);
  }, [dispatch, list, focusLater]);
  return (
    <div ref={root}>
      {items.map((item) => (
        <ListRow key={item.id} list={list} item={item} dispatch={dispatch} />
      ))}
      <AddButton label={t("edit.add.item")} onClick={add} />
    </div>
  );
}
