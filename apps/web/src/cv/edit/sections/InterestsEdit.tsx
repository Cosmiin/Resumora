import { useCallback } from "react";
import { t } from "../../../i18n/t.ts";
import { ChipInput } from "../ChipInput.tsx";
import type { SectionProps } from "./types.ts";

export function InterestsEdit({ cv, dispatch }: SectionProps) {
  const onAdd = useCallback((name: string) => dispatch({ type: "addInterest", name }), [dispatch]);
  const onRemove = useCallback((itemId: string) => dispatch({ type: "removeInterest", itemId }), [dispatch]);
  return (
    <ChipInput fieldKey="interests" label={t("edit.interests")} items={cv.interests} onAdd={onAdd} onRemove={onRemove} />
  );
}
