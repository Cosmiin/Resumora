import type { JobExtraction, MatchScore, Proposal, TailorRun } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { Role } from "./RolePanel.tsx";
import type { AcceptBody } from "./tailor-api.ts";

const MAX_NAMED = 2;
const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** A label's name: the job's requirement text ("r3" → requirement 3), or a keyword's term ("k:BPMN" → BPMN). */
function nameOf(ref: string, job: JobExtraction | null): string | null {
  if (ref.startsWith("k:")) return ref.slice(2).trim() || null;
  const index = /^r(\d+)$/.exec(ref)?.[1];
  return index === undefined ? null : job?.requirements[Number(index)]?.text.trim() || null;
}

/**
 * Up to 2 requirements newly met thanks to this role: labels now met that were missing or partial before,
 * whose evidence quote is found in the role's text (no AI call).
 */
export function newlyMet(before: MatchScore | null, after: MatchScore, roleTexts: string[], job: JobExtraction | null): string[] {
  const was = new Map((before?.labels ?? []).map((label) => [label.ref, label.status]));
  const text = norm(roleTexts.join("\n"));
  const names: string[] = [];
  for (const label of after.labels) {
    if (label.status !== "met" || was.get(label.ref) === "met" || !label.evidence?.trim()) continue;
    if (!text.includes(norm(label.evidence))) continue;
    const name = nameOf(label.ref, job);
    if (name && !names.includes(name)) names.push(name);
    if (names.length === MAX_NAMED) break;
  }
  return names;
}

/** The changes an accept keeps (a guess left undecided is kept). */
export function keptChanges(proposals: Proposal[], body: AcceptBody): Proposal[] {
  const reverted = new Set([...body.decisions, ...body.inferred].filter((d) => !d.keep).map((d) => d.itemId));
  return proposals.filter((p) => p.flags.length === 0 && !reverted.has(p.itemId));
}
/** The role's wording after the accept: its Base text plus every change it kept. */
export const keptTexts = (role: Role, kept: Proposal[]): string[] =>
  [role.title, role.description, ...role.bullets.map((bullet) => bullet.text), ...kept.map((p) => p.text)];

type Input = { names: string[]; company: string | null; changed: boolean; from: number | null; to: number | null; next: TailorRun; roles: Role[] };

/** The words of the role done moment: title, the line under the score, and the button to the next role or step. */
export function roleDone({ names, company, changed, from, to, next, roles }: Input): { title: string; line: string | null; button: string } {
  const title = !changed ? t("tailor.roleDone.nothing")
    : from !== null && to !== null && to > from ? t("tailor.roleDone.up", { from }) : t("tailor.roleDone.done");
  const who = company?.trim() || t("tailor.roleDone.theJob");
  const line = !changed || names.length === 0 ? null
    : names.length === 1 ? t("tailor.roleDone.showsOne", { a: names[0]!, company: who })
      : t("tailor.roleDone.showsTwo", { a: names[0]!, b: names[1]!, company: who });
  const nextRole = next.currentSection === "experience" ? roles.find((role) => role.id === next.currentRoleId) : undefined;
  const button = nextRole ? t("tailor.roleDone.nextRole", { title: nextRole.title.trim() || t("tailor.role.untitled") })
    : next.currentSection ? t("tailor.roleDone.onTo", { section: t(`tailor.section.${next.currentSection}`) }) : t("tailor.roleDone.finish");
  return { title, line, button };
}
