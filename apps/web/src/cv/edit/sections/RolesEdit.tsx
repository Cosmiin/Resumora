import { useCallback, useRef } from "react";
import { newId, type Experience, type Locale } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import type { CvAction } from "../cvReducer.ts";
import { useFocusAfterRender } from "../useFocusAfterRender.ts";
import { AddButton } from "./AddButton.tsx";
import { DragList } from "../DragList.tsx";
import { RoleItem, roleName } from "./RoleItem.tsx";
import type { RoleScoreState } from "../../enrich/useRoleScores.ts";

type Props = {
  list: "experience" | "volunteering";
  items: Experience[];
  locale: Locale;
  /** Scores by role id; only experience roles have them. */
  scores?: ReadonlyMap<string, RoleScoreState>;
  dispatch(a: CvAction): void;
};

/** Experience or volunteering: every role typed in place. */
export function RolesEdit({ list, items, locale, dispatch, scores }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender(root);
  const add = useCallback(() => {
    const id = newId();
    dispatch({ type: "addItem", list, id });
    focusLater(`${list}-${id}-title`);
  }, [dispatch, list, focusLater]);
  const move = useCallback((from: number, to: number) => dispatch({ type: "moveItem", list, from, to }), [dispatch, list]);
  const label = useCallback((role: Experience) => roleName(role, list), [list]);
  return (
    <div ref={root}>
      <DragList items={items} onMove={move} label={label}>
        {(role) => <RoleItem role={role} list={list} locale={locale} dispatch={dispatch} score={scores?.get(role.id)} />}
      </DragList>
      <AddButton label={t("edit.add.role")} onClick={add} />
    </div>
  );
}
