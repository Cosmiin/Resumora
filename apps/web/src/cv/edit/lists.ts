import type { CvContent } from "@resumora/shared";

export type ListKey =
  | "experience"
  | "volunteering"
  | "education"
  | "languages"
  | "certifications"
  | "projects"
  | "awards"
  | "courses"
  | "publications"
  | "interests"
  | "custom";

export type BulletOwner =
  | { list: "experience" | "volunteering"; itemId: string }
  | { list: "achievements" };

export type Item = { id: string } & Record<string, unknown>;

/** A new empty item for a list. Roles start with one empty bullet. */
export function emptyItem(list: ListKey, id: string): Item {
  switch (list) {
    case "experience":
    case "volunteering":
      return {
        id,
        company: "",
        title: "",
        location: "",
        startDate: "",
        endDate: "",
        current: false,
        description: "",
        bullets: [{ id: `${id}-b1`, text: "" }],
      };
    case "education":
      return { id, school: "", degree: "", field: "", startDate: "", endDate: "", notes: "" };
    case "languages":
      return { id, name: "", level: "" };
    case "certifications":
      return { id, name: "", issuer: "", date: "" };
    case "projects":
      return { id, name: "", description: "", url: "" };
    case "awards":
      return { id, name: "", issuer: "", date: "", description: "" };
    case "courses":
      return { id, name: "", provider: "", date: "" };
    case "publications":
      return { id, title: "", publisher: "", date: "", url: "" };
    case "interests":
      return { id, name: "" };
    case "custom":
      return { id, title: "", details: "" };
  }
}

export function getItems(cv: CvContent, list: ListKey): Item[] {
  return cv[list] as unknown as Item[];
}

export function withItems(cv: CvContent, list: ListKey, items: Item[]): CvContent {
  return { ...cv, [list]: items } as CvContent;
}

type Bullets = { id: string; text: string }[];

/** The bullets an owner holds, or undefined when the owner does not exist. */
export function getBullets(cv: CvContent, owner: BulletOwner): Bullets | undefined {
  if (owner.list === "achievements") return cv.achievements;
  return cv[owner.list].find((r) => r.id === owner.itemId)?.bullets;
}

export function withBullets(cv: CvContent, owner: BulletOwner, bullets: Bullets): CvContent {
  if (owner.list === "achievements") return { ...cv, achievements: bullets };
  const { list, itemId } = owner;
  return { ...cv, [list]: cv[list].map((r) => (r.id === itemId ? { ...r, bullets } : r)) } as CvContent;
}
