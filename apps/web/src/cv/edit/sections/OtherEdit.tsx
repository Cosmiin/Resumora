import { memo, useCallback, useRef } from "react";
import { newId, type CvContent } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import type { CvAction } from "../cvReducer.ts";
import { ItemField } from "../ItemField.tsx";
import { useFocusAfterRender } from "../useFocusAfterRender.ts";
import { AddButton } from "./AddButton.tsx";
import { RemoveButton } from "./RemoveButton.tsx";

type Custom = CvContent["custom"][number];

const CustomBlock = memo(function CustomBlock({ item, dispatch }: { item: Custom; dispatch(a: CvAction): void }) {
  const remove = useCallback(
    () => dispatch({ type: "removeItem", list: "custom", itemId: item.id }),
    [dispatch, item.id],
  );
  const name = item.title || t("edit.other.untitled");
  return (
    <div className="cv-custom" data-item={item.id}>
      <ItemField
        list="custom"
        itemId={item.id}
        field="title"
        className="cv-label"
        value={item.title}
        label={t("edit.other.title")}
        placeholder={t("edit.other.titlePlaceholder")}
        dispatch={dispatch}
      />
      <RemoveButton name={name} onClick={remove} />
      <ItemField
        multiline
        list="custom"
        itemId={item.id}
        field="details"
        value={item.details}
        label={t("edit.other.details", { name })}
        placeholder={t("edit.other.detailsPlaceholder")}
        dispatch={dispatch}
      />
    </div>
  );
});

/** Each custom section has its own heading and a free-text body. */
export function OtherEdit({ items, dispatch }: { items: Custom[]; dispatch(a: CvAction): void }) {
  const root = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender(root);
  const add = useCallback(() => {
    const id = newId();
    dispatch({ type: "addItem", list: "custom", id });
    focusLater(`custom-${id}-title`);
  }, [dispatch, focusLater]);
  return (
    <div ref={root}>
      {items.map((item) => (
        <CustomBlock key={item.id} item={item} dispatch={dispatch} />
      ))}
      <AddButton label={t("edit.add.other")} onClick={add} />
    </div>
  );
}
