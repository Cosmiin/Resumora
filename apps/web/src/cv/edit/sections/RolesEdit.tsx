import { useCallback, useRef } from "react";
import { newId, type Experience, type Locale } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import type { CvAction } from "../cvReducer.ts";
import { useFocusAfterRender } from "../useFocusAfterRender.ts";
import { AddButton } from "./AddButton.tsx";
import { RoleItem } from "./RoleItem.tsx";

type Props = {
  list: "experience" | "volunteering";
  items: Experience[];
  locale: Locale;
  dispatch(a: CvAction): void;
};

/** Experience or volunteering: every role typed in place. */
export function RolesEdit({ list, items, locale, dispatch }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender(root);
  const add = useCallback(() => {
    const id = newId();
    dispatch({ type: "addItem", list, id });
    focusLater(`${list}-${id}-title`);
  }, [dispatch, list, focusLater]);
  return (
    <div ref={root}>
      {items.map((role) => (
        <RoleItem key={role.id} role={role} list={list} locale={locale} dispatch={dispatch} />
      ))}
      <AddButton label={t("edit.add.role")} onClick={add} />
    </div>
  );
}
