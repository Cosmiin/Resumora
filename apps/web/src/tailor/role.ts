import type { CvContent, Locale } from "@resumora/shared";
import { formatRange } from "../cv/page/blocks.ts";

export type Role = CvContent["experience"][number];

/** "Emedi · Mar 2021 – Present": company and dates, whichever the CV has. */
export const roleMeta = (role: Role, locale: Locale) =>
  [role.company.trim(), formatRange(role.startDate, role.endDate, role.current, locale)].filter(Boolean).join(" · ");
