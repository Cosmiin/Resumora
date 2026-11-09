import { findScored, type CvContent, type ScoredKind } from "@resumora/shared";

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

/** Lists whose items have the role shape (title, organisation, dates, bullets). */
export type RoleList = "experience" | "volunteering" | "projects";

/** The list each scored kind lives in. */
export const SCORED_LIST = { role: "experience", project: "projects", volunteering: "volunteering" } as const satisfies Record<ScoredKind, RoleList>;

/** Which role-shaped list holds this id (roles, projects or volunteering), if any. */
export function roleListOf(cv: CvContent, id: string): RoleList | undefined {
  const found = findScored(cv, id);
  return found && SCORED_LIST[found.kind];
}

/** Lists whose items can have short lines under them. */
export type LineList = "courses" | "awards" | "publications" | "interests";

export type BulletOwner =
  | { list: RoleList | LineList; itemId: string }
  | { list: "achievements" };

export type Item = { id: string } & Record<string, unknown>;

/** A new empty item for a list. Roles start with one empty bullet. */
export function emptyItem(list: ListKey, id: string): Item {
  switch (list) {
    case "experience":
    case "volunteering":
    case "projects":
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
        notes: [],
        ...(list === "projects" ? { url: "" } : {}),
      };
    case "education":
      return { id, school: "", degree: "", field: "", startDate: "", endDate: "", notes: "" };
    case "languages":
      return { id, name: "", level: "" };
    case "certifications":
      return { id, name: "", issuer: "", date: "" };
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
  const items: { id: string; bullets?: Bullets }[] = cv[owner.list];
  const item = items.find((r) => r.id === owner.itemId);
  return item ? (item.bullets ?? []) : undefined;
}

export function withBullets(cv: CvContent, owner: BulletOwner, bullets: Bullets): CvContent {
  if (owner.list === "achievements") return { ...cv, achievements: bullets };
  const { list, itemId } = owner;
  const items: { id: string }[] = cv[list];
  return { ...cv, [list]: items.map((r) => (r.id === itemId ? { ...r, bullets } : r)) } as CvContent;
}
