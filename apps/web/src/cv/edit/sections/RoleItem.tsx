import { memo, useCallback, useMemo, useRef } from "react";
import { MAX_LONG_TEXT, newId, type Experience, type Locale } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import type { MessageKey } from "../../../i18n/en.ts";
import { PRESENT } from "../../page/blocks.ts";
import { BulletList } from "../BulletList.tsx";
import type { CvAction } from "../cvReducer.ts";
import { DateField } from "../DateField.tsx";
import { ItemDate } from "../ItemDate.tsx";
import { ItemField } from "../ItemField.tsx";
import { useFocusAfterRender } from "../useFocusAfterRender.ts";
import { AddButton } from "./AddButton.tsx";
import { RemoveButton } from "./RemoveButton.tsx";
import { ScorePill } from "../../enrich/ScorePill.tsx";
import type { RoleScoreState } from "../../enrich/useRoleScores.ts";
import { focusField } from "../focus.ts";

type Props = {
  role: Experience;
  list: "experience" | "volunteering";
  locale: Locale;
  /** This role's score; left out where roles are not scored. */
  score?: RoleScoreState;
  dispatch(a: CvAction): void;
};

type TextField = "title" | "company" | "location" | "description";

/** What a role is called: its title, else its company, else "<Section> role". */
export function roleName(role: Experience, list: "experience" | "volunteering"): string {
  return role.title || role.company || t(`edit.role.untitled.${list}`);
}

/** One role on the page. Memoised: typing in one role leaves the others alone. */
export const RoleItem = memo(function RoleItem({ role, list, locale, dispatch, score }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender(root);
  const itemId = role.id;
  const name = roleName(role, list);

  const owner = useMemo(() => ({ list, itemId }), [list, itemId]);
  const remove = useCallback(() => dispatch({ type: "removeItem", list, itemId }), [dispatch, list, itemId]);
  const onPresent = useCallback(
    () => dispatch({ type: "setCurrent", list, itemId, current: true }),
    [dispatch, list, itemId],
  );
  const onEndCommit = useCallback(
    (v: string) => dispatch({ type: "setItemField", list, itemId, field: "endDate", value: v }),
    [dispatch, list, itemId],
  );
  const reopenEnd = useCallback(() => {
    dispatch({ type: "setCurrent", list, itemId, current: false });
    focusLater(`${list}-${itemId}-endDate`);
  }, [dispatch, list, itemId, focusLater]);
  const addBullet = useCallback(() => {
    const id = newId();
    dispatch({ type: "addBullet", owner, newId: id });
    focusLater(`bullet-${id}`);
  }, [dispatch, owner, focusLater]);

  const openRole = useCallback(() => {
    if (root.current) focusField(root.current, `${list}-${itemId}-title`);
  }, [list, itemId]);

  const field = (f: TextField, label: MessageKey, placeholder: MessageKey, className?: string, multiline?: boolean) => (
    <ItemField
      list={list}
      itemId={itemId}
      field={f}
      value={role[f]}
      label={t(label)}
      placeholder={t(placeholder)}
      className={className}
      multiline={multiline}
      maxLength={multiline ? MAX_LONG_TEXT : undefined}
      dispatch={dispatch}
    />
  );

  return (
    <div className="cv-line cv-role" data-item={itemId} ref={root} role="group" aria-label={name}>
      {score && <ScorePill roleId={itemId} state={score} onOpen={openRole} />}
      <div className="cv-item-head">
        {field("title", "edit.role.title", "edit.role.titlePlaceholder", "cv-item-title")}
        <span className="cv-item-dates cv-role-dates">
          <ItemDate
            list={list}
            itemId={itemId}
            field="startDate"
            value={role.startDate}
            locale={locale}
            label={t("edit.role.start")}
            placeholder={t("edit.role.datePlaceholder")}
            dispatch={dispatch}
          />
          <span aria-hidden="true">–</span>
          {role.current ? (
            <button
              type="button"
              className="cv-present"
              aria-label={t("edit.role.present", { present: PRESENT[locale] })}
              onClick={reopenEnd}
            >
              {PRESENT[locale]}
            </button>
          ) : (
            <DateField
              wide
              fieldKey={`${list}-${itemId}-endDate`}
              value={role.endDate}
              locale={locale}
              label={t("edit.role.end")}
              placeholder={t("edit.role.endPlaceholder")}
              onCommit={onEndCommit}
              onPresent={onPresent}
            />
          )}
        </span>
        <RemoveButton name={name} onClick={remove} />
      </div>
      <div className="cv-item-details">
        {field("company", "edit.role.company", "edit.role.company", "cv-item-sub")}
        <span className="sep" aria-hidden="true">
          ·
        </span>
        {field("location", "edit.role.location", "edit.role.locationPlaceholder", "cv-item-sub")}
      </div>
      <div className={role.description ? "cv-role-desc" : "cv-role-desc is-empty"}>
        {field("description", "edit.role.description", "edit.role.descriptionPlaceholder", undefined, true)}
      </div>
      <BulletList owner={owner} bullets={role.bullets} dispatch={dispatch} ownerName={name} />
      <AddButton label={t("edit.add.bullet")} onClick={addBullet} />
    </div>
  );
});
