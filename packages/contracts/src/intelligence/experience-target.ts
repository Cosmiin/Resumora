import { isAccepted, type BaseDraft, type Fact } from "../editor/model.ts";

export type ExperienceTarget = {
  id: string;
  kind: "role" | "projects" | "volunteering";
  title: Fact<string>;
  company?: Fact<string>;
  context: Fact<string>;
  bullets: Fact<string>[];
};
/** Only visible supported entries participate in coaching and skills discovery. */
export function experienceTarget(
  d: BaseDraft,
  id: string,
): ExperienceTarget | undefined {
  const hidden = d.presentation.hidden;
  const role = d.roles.find((r) => r.id === id);
  if (role)
    return hidden.includes("experience")
      ? undefined
      : { ...role, kind: "role" };
  const section = d.optionalSections.find(
    (s) =>
      (s.kind === "projects" || s.kind === "volunteering") &&
      !hidden.includes(s.id) &&
      s.entries.some((e) => e.id === id),
  );
  const entry = section?.entries.find((e) => e.id === id);
  return entry
    ? {
        id,
        kind: section!.kind as "projects" | "volunteering",
        title: entry.title,
        context: entry.details,
        bullets: entry.bullets ?? [],
      }
    : undefined;
}
export function experienceTargets(d: BaseDraft): ExperienceTarget[] {
  return [
    ...d.roles.map((r) => r.id),
    ...d.optionalSections.flatMap((s) => s.entries.map((e) => e.id)),
  ]
    .map((id) => experienceTarget(d, id))
    .filter((r): r is ExperienceTarget => !!r);
}
export function experienceFields(
  d: BaseDraft,
  target: ExperienceTarget,
): Fact<string>[] {
  const hidden = d.presentation.hiddenFields ?? [];
  return [
    target.context,
    ...(hidden.includes(`${target.id}-contributions`) ? [] : target.bullets),
  ].filter(
    (f) => isAccepted(f) && !hidden.includes(f.fieldId) && !!f.value.trim(),
  );
}
