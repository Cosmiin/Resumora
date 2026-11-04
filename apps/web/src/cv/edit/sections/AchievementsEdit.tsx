import { useCallback, useRef } from "react";
import { CATEGORY, newId } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import { BulletList } from "../BulletList.tsx";
import { useFocusAfterRender } from "../useFocusAfterRender.ts";
import { AddButton } from "./AddButton.tsx";
import type { SectionProps } from "./types.ts";

const OWNER = { list: "achievements" } as const;

export function AchievementsEdit({ cv, dispatch }: SectionProps) {
  const root = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender(root);
  const add = useCallback(() => {
    const id = newId();
    dispatch({ type: "addBullet", owner: OWNER, newId: id });
    focusLater(`bullet-${id}`);
  }, [dispatch, focusLater]);
  return (
    <div ref={root}>
      <BulletList
        owner={OWNER}
        bullets={cv.achievements}
        dispatch={dispatch}
        ownerName={CATEGORY.achievements.label[cv.locale]}
      />
      <AddButton label={t("edit.add.item")} onClick={add} />
    </div>
  );
}
