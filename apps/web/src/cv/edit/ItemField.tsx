import { useCallback } from "react";
import { PageField } from "./PageField.tsx";
import type { CvAction, ListKey } from "./cvReducer.ts";

type Props = {
  list: ListKey;
  itemId: string;
  field: string;
  value: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  dispatch(a: CvAction): void;
};

/** One text field of a list item. Its change callback stays the same between keystrokes. */
export function ItemField({ list, itemId, field, value, label, placeholder, multiline, className, dispatch }: Props) {
  const onChange = useCallback(
    (v: string) => dispatch({ type: "setItemField", list, itemId, field, value: v }),
    [dispatch, list, itemId, field],
  );
  return (
    <PageField
      fieldKey={`${list}-${itemId}-${field}`}
      value={value}
      label={label}
      placeholder={placeholder}
      multiline={multiline}
      className={className}
      onChange={onChange}
    />
  );
}
