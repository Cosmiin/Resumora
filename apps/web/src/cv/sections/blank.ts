import type { CvContent } from "@resumora/shared";

export type ListSection = "experience" | "education" | "languages" | "certifications" | "projects" | "custom";

/** The empty item each list section starts a new entry from (the id is added when it is saved). */
export const blankItem: { [K in ListSection]: () => Omit<CvContent[K][number], "id"> } = {
  experience: () => ({
    company: "",
    title: "",
    location: "",
    startDate: "",
    endDate: "",
    current: false,
    description: "",
    bullets: [],
  }),
  education: () => ({ school: "", degree: "", field: "", startDate: "", endDate: "", notes: "" }),
  languages: () => ({ name: "", level: "" }),
  certifications: () => ({ name: "", issuer: "", date: "" }),
  projects: () => ({ name: "", description: "", url: "" }),
  custom: () => ({ title: "", details: "" }),
};
