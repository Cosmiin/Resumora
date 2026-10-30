import { isCurrentExperienceWording } from "../intelligence/context.ts";
import { answerEvidenceText } from "../intelligence/model.ts";
import { clone, type BaseDraft } from "./model.ts";
export type Wording = NonNullable<
  BaseDraft["presentation"]["approvedWording"]
>[string];
export function isWordingFieldVisible(
  d: BaseDraft,
  target: string,
  fieldId?: string,
): boolean {
  const role = d.roles.find((r) => r.id === target);
  const section = d.optionalSections.find(
    (s) => s.kind !== "languages" && s.entries.some((e) => e.id === target),
  );
  const entry = section?.entries.find((e) => e.id === target);
  if (!role && !entry) return false;
  const hidden = d.presentation.hiddenFields ?? [];
  return (
    !d.presentation.hidden.includes(role ? "experience" : section!.id) &&
    !hidden.includes(role ? role.context.fieldId : entry!.details.fieldId) &&
    !hidden.includes(fieldId ?? "") &&
    !(
      role?.bullets.some((b) => b.fieldId === fieldId) &&
      hidden.includes(`${target}-contributions`)
    )
  );
}
export function currentWording(d: BaseDraft, target: string): string | null {
  const p = d.presentation.approvedWording?.[target];
  if (
    !p ||
    (p.scope === "experience" &&
      !p.origin &&
      !isCurrentExperienceWording(d, target, p.text)) ||
    !isWordingFieldVisible(d, target)
  )
    return null;
  const role = d.roles.find((r) => r.id === target);
  const entry = d.optionalSections
    .filter((s) => s.kind !== "languages")
    .flatMap((s) => s.entries)
    .find((e) => e.id === target);
  const fields = role
    ? [role.context, ...role.bullets]
    : [entry!.details, ...(entry!.bullets ?? [])];
  return p.sources.length &&
    p.sources.every(
      (s) =>
        fields.some(
          (f) =>
            f.id === s.id &&
            isWordingFieldVisible(d, target, f.fieldId) &&
            f.value === s.text &&
            f.sourceId === s.sourceId &&
            ["user_authored", "user_confirmed"].includes(f.status),
        ) ||
        d.answers.some(
          (a) =>
            a.targetId === target &&
            isWordingFieldVisible(d, target, a.cvFieldId) &&
            a.id === s.id &&
            a.status === "confirmed" &&
            answerEvidenceText(a) === s.text &&
            a.sourceId === s.sourceId,
        ),
    )
    ? p.text
    : null;
}
export function acceptWording(
  d: BaseDraft,
  targetId: string,
  p: Wording,
): BaseDraft {
  const next = clone(d);
  (next.presentation.approvedWording ??= {})[targetId] = clone(p);
  if (!currentWording(next, targetId)) throw new Error("staleProposal");
  return next;
}
