import { memo, useCallback, useRef } from "react";
import { newId, type CvContent } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import type { CvAction } from "../cvReducer.ts";
import { DragList } from "../DragList.tsx";
import { ItemField } from "../ItemField.tsx";
import { useFocusAfterRender } from "../useFocusAfterRender.ts";
import { AddButton } from "./AddButton.tsx";
import { RemoveButton } from "./RemoveButton.tsx";

type Custom = CvContent["custom"][number];
const customName = (c: Custom) => c.title || t("edit.other.untitled");

const CustomBlock = memo(function CustomBlock({ item, dispatch }: { item: Custom; dispatch(a: CvAction): void }) {
  const remove = useCallback(
    () => dispatch({ type: "removeItem", list: "custom", itemId: item.id }),
    [dispatch, item.id],
  );
  const name = customName(item);
  return (
    <div className="cv-custom" data-item={item.id} role="group" aria-label={name}>
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
  const move = useCallback((from: number, to: number) => dispatch({ type: "moveItem", list: "custom", from, to }), [dispatch]);
  return (
    <div ref={root}>
      <DragList items={items} onMove={move} label={customName}>
        {(item) => <CustomBlock item={item} dispatch={dispatch} />}
      </DragList>
      <AddButton label={t("edit.add.other")} onClick={add} />
    </div>
  );
}
