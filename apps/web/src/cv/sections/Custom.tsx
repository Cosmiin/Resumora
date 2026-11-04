import { MAX_LONG_TEXT, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { ItemList, TextField, set } from "../fields.tsx";
import { blankItem } from "./blank.ts";

type Custom = CvContent["custom"];

export function CustomFields({ value, onChange }: { value: Custom[number]; onChange(next: Custom[number]): void }) {
  return (
    <>
      <TextField label={t("cv.custom.title")} value={value.title} onChange={(v) => onChange(set(value, "title", v))} />
      <TextField label={t("cv.custom.details")} multiline maxLength={MAX_LONG_TEXT} value={value.details} onChange={(v) => onChange(set(value, "details", v))} />
    </>
  );
}

/** Sections that fit nowhere else (volunteering, awards, …), keeping the CV's own heading. */
export function CustomSection({ items, onChange }: { items: Custom; onChange(next: Custom): void }) {
  return (
    <ItemList
      title="cv.custom"
      addLabel="cv.custom.add"
      items={items}
      onChange={onChange}
      create={blankItem.custom}
      renderItem={(c, update) => <CustomFields value={c} onChange={update} />}
    />
  );
}
