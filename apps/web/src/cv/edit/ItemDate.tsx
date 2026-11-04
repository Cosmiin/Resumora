import { useCallback } from "react";
import type { Locale } from "@resumora/shared";
import { DateField } from "./DateField.tsx";
import type { CvAction, ListKey } from "./cvReducer.ts";

type Props = {
  list: ListKey;
  itemId: string;
  field: string;
  value: string;
  locale: Locale;
  label: string;
  placeholder?: string;
  dispatch(a: CvAction): void;
};

/** A date field of a list item; a valid typed date is saved as YYYY-MM. */
export function ItemDate({ list, itemId, field, value, locale, label, placeholder, dispatch }: Props) {
  const onCommit = useCallback(
    (v: string) => dispatch({ type: "setItemField", list, itemId, field, value: v }),
    [dispatch, list, itemId, field],
  );
  return (
    <DateField
      fieldKey={`${list}-${itemId}-${field}`}
      value={value}
      locale={locale}
      label={label}
      placeholder={placeholder}
      onCommit={onCommit}
    />
  );
}
