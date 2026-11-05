import type { CategoryKey } from "@resumora/shared";
import type { MessageKey } from "../../i18n/en.ts";

/** Tips shown in the panel for each section; sections without their own use the list tip. */
const TIPS: Partial<Record<CategoryKey, MessageKey[]>> = {
  header: ["panel.tip.header.1", "panel.tip.header.2"],
  summary: ["panel.tip.summary.1", "panel.tip.summary.2"],
  achievements: ["panel.tip.achievements.1", "panel.tip.achievements.2"],
  experience: ["panel.tip.experience.1", "panel.tip.experience.2"],
  skills: ["panel.tip.skills.1", "panel.tip.skills.2"],
  education: ["panel.tip.education.1"],
};
const LIST_TIPS: MessageKey[] = ["panel.tip.list.1"];

/** Names of the "Improve with AI" buttons (visible, switched off for now). */
const AI_BUTTONS: Partial<Record<CategoryKey, MessageKey[]>> = {
  summary: ["panel.ai.summary.rewrite", "panel.ai.summary.tailor"],
  achievements: ["panel.ai.achievements.pull"],
  skills: ["panel.ai.skills.suggest", "panel.ai.skills.sort"],
};

export const tipsFor = (key: CategoryKey): MessageKey[] => TIPS[key] ?? LIST_TIPS;
export const aiButtonsFor = (key: CategoryKey): MessageKey[] => AI_BUTTONS[key] ?? [];
