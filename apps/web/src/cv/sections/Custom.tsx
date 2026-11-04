import { MAX_LONG_TEXT, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { ItemList, TextField, set } from "../fields.tsx";

type Custom = CvContent["custom"];

/** Sections that fit nowhere else (volunteering, awards, …), keeping the CV's own heading. */
export function CustomSection({ items, onChange }: { items: Custom; onChange(next: Custom): void }) {
  return (
    <ItemList
      title="cv.custom"
      addLabel="cv.custom.add"
      items={items}
      onChange={onChange}
      create={() => ({ title: "", details: "" })}
      renderItem={(c, update) => (
        <>
          <TextField label={t("cv.custom.title")} value={c.title} onChange={(v) => update(set(c, "title", v))} />
          <TextField label={t("cv.custom.details")} multiline maxLength={MAX_LONG_TEXT} value={c.details} onChange={(v) => update(set(c, "details", v))} />
        </>
      )}
    />
  );
}
