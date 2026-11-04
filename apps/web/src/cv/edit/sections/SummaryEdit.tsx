import { useCallback } from "react";
import { t } from "../../../i18n/t.ts";
import { PageField } from "../PageField.tsx";
import type { SectionProps } from "./types.ts";

export function SummaryEdit({ cv, dispatch }: SectionProps) {
  const onChange = useCallback((value: string) => dispatch({ type: "setSummary", value }), [dispatch]);
  return (
    <PageField
      multiline
      fieldKey="summary"
      value={cv.basics.summary}
      label={t("edit.summary")}
      placeholder={t("edit.summaryPlaceholder")}
      onChange={onChange}
    />
  );
}
