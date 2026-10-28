import { clone, type BaseDraft } from "./model";
export type Wording = NonNullable<
  BaseDraft["presentation"]["approvedWording"]
>[string];
export function currentWording(d: BaseDraft, target: string): string | null {
  const p = d.presentation.approvedWording?.[target];
  if (!p) return null;
  const role = d.roles.find((r) => r.id === target);
  const section = d.optionalSections.find(
    (s) => s.kind !== "languages" && s.entries.some((e) => e.id === target),
  );
  const entry = section?.entries.find((e) => e.id === target);
  if (!role && !entry) return null;
  const hidden = d.presentation.hiddenFields ?? [];
  const visible = (fieldId?: string) =>
    !hidden.includes(fieldId ?? "") &&
    !(
      role?.bullets.some((b) => b.fieldId === fieldId) &&
      hidden.includes(`${target}-contributions`)
    );
  if (
    d.presentation.hidden.includes(role ? "experience" : section!.id) ||
    !visible(role ? role.context.fieldId : entry!.details.fieldId)
  )
    return null;
  const fields = role
    ? [role.context, ...role.bullets]
    : [entry!.details, ...(entry!.bullets ?? [])];
  return p.sources.length &&
    p.sources.every(
      (s) =>
        fields.some(
          (f) =>
            f.id === s.id &&
            visible(f.fieldId) &&
            f.value === s.text &&
            f.sourceId === s.sourceId &&
            ["user_authored", "user_confirmed"].includes(f.status),
        ) ||
        d.answers.some(
          (a) =>
            a.targetId === target &&
            visible(a.cvFieldId) &&
            a.id === s.id &&
            a.status === "confirmed" &&
            a.text === s.text &&
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
