import type { CvContent } from "@resumora/shared";

export type Basics = CvContent["basics"];

const privateFields = ["fullName", "firstName", "lastName", "email", "phone", "location", "website", "linkedin"] as const;

export function stripHeader(cv: CvContent): { cv: CvContent; header: Basics } {
  const stripped = structuredClone(cv);
  for (const field of privateFields) stripped.basics[field] = "";
  return { cv: stripped, header: structuredClone(cv.basics) };
}

export function restoreHeader(cv: CvContent, header: Basics): CvContent {
  const restored = structuredClone(cv);
  for (const field of privateFields) restored.basics[field] = header[field];
  return restored;
}
