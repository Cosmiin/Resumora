import { newId, MAX_ITEMS, type CvContent } from "./cv.ts";

export const MOVE_TARGETS = ["certifications", "courses", "awards", "interests", "languages", "projects"] as const;
export type MoveTarget = (typeof MOVE_TARGETS)[number];

const BULLET = /^\s*(?:[•·▪●◦*\-–—]+\s*)+/;

/** Moves each line of an "other" section into the chosen list, one item per line. */
export function moveOtherTo(cv: CvContent, customId: string, target: MoveTarget): CvContent {
  const entry = cv.custom.find((c) => c.id === customId);
  if (!entry) return cv;
  const lines = entry.details
    .split(/\r?\n/)
    .map((l) => l.replace(BULLET, "").trim())
    .filter((l) => l !== "");
  const room = Math.max(0, MAX_ITEMS - cv[target].length);
  const names = lines.slice(0, room);
  // Lines that do not fit stay in the section, so no text is lost.
  const left = lines.slice(room);
  const next: CvContent = {
    ...cv,
    custom: left.length === 0
      ? cv.custom.filter((c) => c.id !== customId)
      : cv.custom.map((c) => (c.id === customId ? { ...c, details: left.join("\n") } : c)),
  };
  switch (target) {
    case "certifications":
      next.certifications = [...cv.certifications, ...names.map((name) => ({ id: newId(), name, issuer: "", date: "" }))];
      break;
    case "courses":
      next.courses = [...cv.courses, ...names.map((name) => ({ id: newId(), name, provider: "", date: "" }))];
      break;
    case "awards":
      next.awards = [...cv.awards, ...names.map((name) => ({ id: newId(), name, issuer: "", date: "", description: "" }))];
      break;
    case "interests":
      next.interests = [...cv.interests, ...names.map((name) => ({ id: newId(), name }))];
      break;
    case "languages":
      next.languages = [...cv.languages, ...names.map((name) => ({ id: newId(), name, level: "" }))];
      break;
    case "projects":
      next.projects = [...cv.projects, ...names.map((name) => ({ id: newId(), name, description: "", url: "" }))];
      break;
  }
  return next;
}
