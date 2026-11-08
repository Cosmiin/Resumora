import { Fragment, useCallback } from "react";
import type { CvContent } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import type { CvAction } from "../cvReducer.ts";
import { PageField } from "../PageField.tsx";
import { PhotoField } from "../../panel/PhotoField.tsx";

type Basics = CvContent["basics"];
type Dispatch = (a: CvAction) => void;
type TextKey = Exclude<keyof Basics, "titles" | "photo">;

function BasicsField(p: {
  field: TextKey;
  value: string;
  label: string;
  placeholder: string;
  className?: string;
  dispatch: Dispatch;
}) {
  const { field, dispatch } = p;
  const onChange = useCallback((value: string) => dispatch({ type: "setBasics", field, value }), [dispatch, field]);
  return (
    <PageField
      fieldKey={field}
      value={p.value}
      label={p.label}
      placeholder={p.placeholder}
      className={p.className}
      onChange={onChange}
    />
  );
}

function TitleField(p: { index: 0 | 1; value: string; placeholder: string; dispatch: Dispatch }) {
  const { index, dispatch } = p;
  const onChange = useCallback((value: string) => dispatch({ type: "setTitles", index, value }), [dispatch, index]);
  return (
    <PageField
      fieldKey={`title-${index}`}
      value={p.value}
      label={t("cv.titles.n", { n: index + 1 })}
      placeholder={p.placeholder}
      onChange={onChange}
    />
  );
}

const sep = (key: string) => (
  <span key={key} className="sep" aria-hidden="true">
    ·
  </span>
);

/** Name, up to two titles and contact details, typed where they appear on the CV. */
export function HeaderEdit({ basics, dispatch }: { basics: Basics; dispatch: Dispatch }) {
  const contact: { field: TextKey; label: string }[] = [
    { field: "email", label: t("cv.email") },
    { field: "phone", label: t("cv.phone") },
    { field: "location", label: t("cv.location") },
    { field: "website", label: t("cv.website") },
    { field: "linkedin", label: t("cv.linkedin") },
  ];
  return (
    <header className="cv-header" data-section="header">
      <BasicsField
        field="fullName"
        className="cv-name"
        value={basics.fullName}
        label={t("cv.fullName")}
        placeholder={t("edit.namePlaceholder")}
        dispatch={dispatch}
      />
      <div className="cv-titles">
        <TitleField index={0} value={basics.titles[0] ?? ""} placeholder={t("edit.title1")} dispatch={dispatch} />
        {sep("t")}
        <TitleField index={1} value={basics.titles[1] ?? ""} placeholder={t("edit.title2")} dispatch={dispatch} />
      </div>
      <div className="cv-contact">
        {contact.map((c, i) => (
          <Fragment key={c.field}>
            {i > 0 && sep(c.field)}
            <BasicsField field={c.field} value={basics[c.field]} label={c.label} placeholder={c.label} dispatch={dispatch} />
          </Fragment>
        ))}
      </div>
      <PhotoField photo={basics.photo} onChange={(photo) => dispatch({ type: "setBasics", field: "photo", value: photo })} />
    </header>
  );
}
