export const TEMPLATES = [
  { id: "classic", label: "cv.template.classic", className: "cv-template-classic", photo: "header-right" },
  { id: "modern", label: "cv.template.modern", className: "cv-template-modern", photo: "header-right" },
  { id: "compact", label: "cv.template.compact", className: "cv-template-compact", photo: null },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]["id"];

export function getTemplate(id: string | undefined) {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0];
}
