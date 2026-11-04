import { MAX_LONG_TEXT, MAX_TITLES, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { TextField, set } from "../fields.tsx";

type Basics = CvContent["basics"];

/** Names, titles and contact details (everything in basics except the summary). */
export function BasicsFields({ value, onChange }: { value: Basics; onChange(next: Basics): void }) {
  const field = (key: Exclude<keyof Basics, "titles">) => (v: string) => onChange(set(value, key, v));
  const setTitle = (i: number) => (v: string) => {
    const titles = Array.from({ length: MAX_TITLES }, (_, j) => (j === i ? v : (value.titles[j] ?? "")));
    while (titles.length && !titles.at(-1)) titles.pop(); // an empty CV keeps titles: []
    onChange(set(value, "titles", titles));
  };
  return (
    <div className="cv-grid">
      <TextField label={t("cv.fullName")} value={value.fullName} onChange={field("fullName")} />
      <TextField label={t("cv.firstName")} value={value.firstName} onChange={field("firstName")} />
      <TextField label={t("cv.lastName")} value={value.lastName} onChange={field("lastName")} />
      {Array.from({ length: MAX_TITLES }, (_, i) => (
        <TextField key={i} label={t("cv.titles.n", { n: i + 1 })} value={value.titles[i] ?? ""} onChange={setTitle(i)} />
      ))}
      <TextField label={t("cv.email")} type="email" value={value.email} onChange={field("email")} />
      <TextField label={t("cv.phone")} type="tel" value={value.phone} onChange={field("phone")} />
      <TextField label={t("cv.location")} value={value.location} onChange={field("location")} />
      <TextField label={t("cv.website")} type="url" value={value.website} onChange={field("website")} />
      <TextField label={t("cv.linkedin")} type="url" value={value.linkedin} onChange={field("linkedin")} />
    </div>
  );
}

export function SummaryField({ value, onChange }: { value: string; onChange(next: string): void }) {
  return <TextField label={t("cv.summary")} multiline maxLength={MAX_LONG_TEXT} value={value} onChange={onChange} />;
}

export function BasicsSection({ value, onChange }: { value: Basics; onChange(next: Basics): void }) {
  return (
    <section className="cv-section">
      <h2>{t("cv.basics")}</h2>
      <BasicsFields value={value} onChange={onChange} />
      <SummaryField value={value.summary} onChange={(summary) => onChange(set(value, "summary", summary))} />
    </section>
  );
}
