import { MAX_LONG_TEXT, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { TextField, set } from "../fields.tsx";

type Custom = CvContent["custom"];

export function CustomFields({ value, onChange }: { value: Custom[number]; onChange(next: Custom[number]): void }) {
  return (
    <>
      <TextField label={t("cv.custom.title")} value={value.title} onChange={(v) => onChange(set(value, "title", v))} />
      <TextField label={t("cv.custom.details")} multiline maxLength={MAX_LONG_TEXT} value={value.details} onChange={(v) => onChange(set(value, "details", v))} />
    </>
  );
}
