import type { BaseDraft, Locale } from "./model";
export function sectionName(id: string, locale: Locale, d?: BaseDraft) {
  const labels: Record<string, [string, string]> = {
    identity: ["Despre tine", "About you"],
    summary: ["Profil", "Summary"],
    professionalSkills: ["Competențe profesionale", "Professional skills"],
    technicalSkills: ["Competențe tehnice", "Technical skills"],
    experience: ["Experiență profesională", "Professional experience"],
    education: ["Educație", "Education"],
    projects: ["Proiecte", "Projects"],
    certifications: ["Certificări", "Certifications"],
    languages: ["Limbi", "Languages"],
    volunteering: ["Voluntariat", "Volunteering"],
    custom: ["Secțiune proprie", "Custom section"],
  };
  const optional = d?.optionalSections.find((s) => s.id === id);
  if (optional?.label) return optional.label;
  return labels[optional?.kind ?? id]?.[locale === "ro" ? 0 : 1] ?? id;
}
