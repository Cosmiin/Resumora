import { MAX_LONG_TEXT, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { TextField, set } from "../fields.tsx";

type Basics = CvContent["basics"];

export function BasicsSection({ value, onChange }: { value: Basics; onChange(next: Basics): void }) {
  const field = (key: keyof Basics) => (v: string) => onChange(set(value, key, v));
  return (
    <section className="cv-section">
      <h2>{t("cv.basics")}</h2>
      <div className="cv-grid">
        <TextField label={t("cv.fullName")} value={value.fullName} onChange={field("fullName")} />
        <TextField label={t("cv.headline")} value={value.headline} onChange={field("headline")} />
        <TextField label={t("cv.email")} type="email" value={value.email} onChange={field("email")} />
        <TextField label={t("cv.phone")} type="tel" value={value.phone} onChange={field("phone")} />
        <TextField label={t("cv.location")} value={value.location} onChange={field("location")} />
        <TextField label={t("cv.website")} type="url" value={value.website} onChange={field("website")} />
        <TextField label={t("cv.linkedin")} type="url" value={value.linkedin} onChange={field("linkedin")} />
      </div>
      <TextField label={t("cv.summary")} multiline maxLength={MAX_LONG_TEXT} value={value.summary} onChange={field("summary")} />
    </section>
  );
}
