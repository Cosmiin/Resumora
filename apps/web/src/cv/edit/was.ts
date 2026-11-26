import { createContext } from "react";
import type { CvContent } from "@resumora/shared";

/** Tailored CV: each bullet's Base wording, by bullet id, where tailoring changed it. Null on the Base CV. */
export const WasContext = createContext<ReadonlyMap<string, string> | null>(null);

const OWNERS = ["experience", "projects", "volunteering"] as const;

/** The Base wording of every bullet whose text differs on the tailored copy (same bullet id on both). */
export function changedBullets(cv: CvContent, original: CvContent): Map<string, string> {
  const before = new Map<string, string>();
  for (const list of OWNERS) {
    for (const item of original[list]) for (const bullet of item.bullets) before.set(bullet.id, bullet.text);
  }
  const was = new Map<string, string>();
  for (const list of OWNERS) {
    for (const item of cv[list]) {
      for (const bullet of item.bullets) {
        const old = before.get(bullet.id);
        if (old !== undefined && old.trim() && old !== bullet.text) was.set(bullet.id, old);
      }
    }
  }
  return was;
}
