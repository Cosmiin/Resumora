import { useCallback } from "react";
import { CATEGORY, type CvContent, type SectionKey } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "./cvReducer.ts";
import { PageField } from "./PageField.tsx";

type Props = {
  sectionKey: SectionKey;
  /** What the user typed for this heading; empty means the standard name is used. */
  title: string;
  locale: CvContent["locale"];
  dispatch(a: CvAction): void;
};

/** A section heading typed on the page. Cleared, it falls back to the standard name. */
export function SectionHeading({ sectionKey, title, locale, dispatch }: Props) {
  const standard = CATEGORY[sectionKey].label[locale];
  const onChange = useCallback(
    (value: string) => dispatch({ type: "setSectionTitle", key: sectionKey, value }),
    [dispatch, sectionKey],
  );
  return (
    <h2 className="cv-section-heading">
      <PageField
        className="cv-label"
        fieldKey={`heading-${sectionKey}`}
        label={t("edit.heading", { name: standard })}
        placeholder={standard}
        value={title}
        onChange={onChange}
      />
    </h2>
  );
}
