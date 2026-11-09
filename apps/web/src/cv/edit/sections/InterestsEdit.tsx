import { useCallback } from "react";
import { t } from "../../../i18n/t.ts";
import { BulletList } from "../BulletList.tsx";
import { ChipInput } from "../ChipInput.tsx";
import type { SectionProps } from "./types.ts";

export function InterestsEdit({ cv, dispatch }: SectionProps) {
  const onAdd = useCallback((name: string) => dispatch({ type: "addInterest", name }), [dispatch]);
  const onRemove = useCallback((itemId: string) => dispatch({ type: "removeInterest", itemId }), [dispatch]);
  return (
    <>
      <ChipInput fieldKey="interests" label={t("edit.interests")} items={cv.interests} onAdd={onAdd} onRemove={onRemove} />
      {/* An interest with lines (from enrichment) shows them under its name. */}
      {cv.interests.filter((i) => i.bullets?.length).map((i) => (
        <div key={i.id} className="cv-line" data-item={i.id}>
          <span className="cv-item-title">{i.name}</span>
          <BulletList owner={{ list: "interests", itemId: i.id }} bullets={i.bullets ?? []} dispatch={dispatch} ownerName={i.name} />
        </div>
      ))}
    </>
  );
}
