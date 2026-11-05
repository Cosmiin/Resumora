import type { AtsTip, Issue } from "@resumora/shared";
import { t } from "../../i18n/t.ts";

/** The model's tip for a bullet, or the plain tip for its issue when the model gave none. */
export function issueTip(issue: Issue, tip: string | null): string {
  return tip && tip.trim() ? tip : t(`enrich.tips.issue.${issue}`);
}

export const atsTipText = (key: AtsTip): string => t(`enrich.tips.ats.${key}`);
