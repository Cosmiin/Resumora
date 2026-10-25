import { allFacts, hasValue, type BaseDraft } from "./model";
import { dateError, reversedDates } from "./dates";
export type Issue = {
  field: string;
  code:
    | "required"
    | "email"
    | "url"
    | "date"
    | "chronology"
    | "pending"
    | "prose"
    | "truth";
};
export function validateDraft(d: BaseDraft, acknowledged: boolean): Issue[] {
  const issues: Issue[] = [];
  if (!d.name.value.trim())
    issues.push({ field: d.name.fieldId, code: "required" });
  for (const c of d.contacts) {
    if (
      c.kind === "email" &&
      c.value.value.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value.value)
    )
      issues.push({ field: c.value.fieldId, code: "email" });
    if (c.kind === "social" && c.value.value.trim()) {
      try {
        const u = new URL(c.value.value);
        if (!["https:", "http:"].includes(u.protocol)) throw new Error();
      } catch {
        issues.push({ field: c.value.fieldId, code: "url" });
      }
    }
  }
  for (const skill of [...d.professionalSkills, ...d.technicalSkills])
    if (!skill.value.trim())
      issues.push({ field: skill.fieldId, code: "required" });
  for (const r of d.roles) {
    if (!r.title.value.trim())
      issues.push({ field: r.title.fieldId, code: "required" });
    if (!r.company.value.trim())
      issues.push({ field: r.company.fieldId, code: "required" });
    if (!r.ongoing.value && reversedDates(r.start.value, r.end.value))
      issues.push({ field: r.end.fieldId, code: "chronology" });
    for (const b of r.bullets)
      if (!b.value.trim()) issues.push({ field: b.fieldId, code: "required" });
  }
  for (const e of d.education) {
    if (!e.institution.value.trim())
      issues.push({ field: e.institution.fieldId, code: "required" });
    if (reversedDates(e.start.value, e.end.value))
      issues.push({ field: e.end.fieldId, code: "chronology" });
  }
  for (const s of d.optionalSections)
    for (const e of s.entries) {
      if (!e.title.value.trim())
        issues.push({ field: e.title.fieldId, code: "required" });
      if (reversedDates(e.start.value, e.end.value))
        issues.push({ field: e.end.fieldId, code: "chronology" });
    }
  for (const f of allFacts(d)) {
    if (typeof f.value === "object" && dateError(f.value))
      issues.push({ field: f.fieldId, code: "date" });
    if (hasValue(f.value) && f.status !== "user_confirmed")
      issues.push({ field: f.fieldId, code: "pending" });
  }
  if (d.summary.text.trim() && d.summary.approval !== "approved")
    issues.push({ field: "summary", code: "prose" });
  if (!acknowledged) issues.push({ field: "truth", code: "truth" });
  return issues;
}
export type FileSelection = {
  state: "empty" | "unsupported" | "unavailable";
  name?: string;
  size?: number;
};
// Metadata only. No file content read, no network call, no parser or service-size promise.
export function selectDocument(
  file?: Pick<File, "name" | "size">,
): FileSelection {
  if (!file) return { state: "empty" };
  return {
    state:
      /\.(pdf|docx)$/i.test(file.name) && file.size > 0
        ? "unavailable"
        : "unsupported",
    name: file.name,
    size: file.size,
  };
}
