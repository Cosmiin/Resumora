import { t } from "../i18n/t.ts";

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Group heading: "Today" for the current local day, otherwise "2 November". */
export const dayLabel = (iso: string, now = new Date()) => {
  const date = new Date(iso);
  return sameDay(date, now) ? t("history.today") : dayFormat.format(date);
};

/** "14:20" */
export const timeLabel = (iso: string) => timeFormat.format(new Date(iso));

/** Inside a sentence: "today, 10:15" or "2 November, 10:15". */
export const whenLabel = (iso: string, now = new Date()) => {
  const date = new Date(iso);
  const day = sameDay(date, now) ? t("history.todayInline") : dayFormat.format(date);
  return `${day}, ${timeLabel(iso)}`;
};
