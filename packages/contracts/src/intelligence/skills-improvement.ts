import type { BaseDraft, Fact } from "../editor/model.ts";
import { isTextFact } from "../editor/transport.ts";
import { contentLocale } from "../editor/content-language.ts";
import { experienceIdentity, experienceTargets } from "./experience.ts";
import {
  skillInventoryPolicy,
  skillKey,
  type SkillCategory,
} from "./skill-keywords.ts";

export const skillsImprovementTimeoutMs = 90_000;

export type SkillInventory = {
  technicalSkills: Fact<string>[];
  professionalSkills: Fact<string>[];
  skillReserves: {
    technicalSkills: Fact<string>[];
    professionalSkills: Fact<string>[];
  };
};
export const skillCategories = [
  "technicalSkills",
  "professionalSkills",
] as const;
export function getSkillInventory(d: BaseDraft): SkillInventory {
  return structuredClone({
    technicalSkills: d.technicalSkills,
    professionalSkills: d.professionalSkills,
    skillReserves: d.skillReserves ?? {
      technicalSkills: [],
      professionalSkills: [],
    },
  });
}
export function withSkillInventory(
  d: BaseDraft,
  inventory: SkillInventory,
): BaseDraft {
  return {
    ...structuredClone(d),
    ...structuredClone({
      technicalSkills: inventory.technicalSkills,
      professionalSkills: inventory.professionalSkills,
      skillReserves: inventory.skillReserves,
    }),
  };
}
export function allInventorySkills(
  d: BaseDraft,
  category: SkillCategory,
): Fact<string>[] {
  const seen = new Set<string>();
  return [...d[category], ...(d.skillReserves?.[category] ?? [])].filter(
    (f) => !seen.has(f.id) && !!seen.add(f.id),
  );
}
/** Persistence can reorder object properties. Array order and values still matter. */
function identityJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(
      Object.keys(item)
        .sort()
        .map((key) => [key, item[key]]),
    );
  });
}

export const skillInventoryIdentity = (d: BaseDraft): string =>
  identityJson(getSkillInventory(d));
export function skillReviewIdentity(d: BaseDraft): string {
  return identityJson([
    "discover-then-improve/3",
    skillInventoryPolicy.activeCategoryLimit,
    d.skillExclusions ?? [],
    d.id,
    contentLocale(d),
    getSkillInventory(d),
    // Normalize nested experience data as data, not an opaque JSON string.
    experienceTargets(d).map((t) => [
      t.id,
      JSON.parse(experienceIdentity(d, t.id)),
    ]),
    Object.entries(d.experienceEnrichment ?? {})
      .map(([id, s]) => [id, s.skillChoices ?? {}])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  ]);
}
export async function skillReviewFingerprint(d: BaseDraft): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(skillReviewIdentity(d)),
      ),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export type SkillsImprovementResult = {
  schemaVersion: "skills-improvement/1";
  fingerprint: string;
  inventory: SkillInventory;
  removed: { id: string; label: string; reason: string }[];
};
export function isSkillsImprovementResult(
  value: unknown,
): value is SkillsImprovementResult {
  if (!value || typeof value !== "object") return false;
  const v = value as SkillsImprovementResult;
  if (
    Object.keys(v).sort().join(",") !==
    "fingerprint,inventory,removed,schemaVersion"
  )
    return false;
  if (
    v.schemaVersion !== "skills-improvement/1" ||
    !/^[a-f0-9]{64}$/.test(v.fingerprint) ||
    !v.inventory ||
    !v.inventory.skillReserves ||
    !Array.isArray(v.removed)
  )
    return false;
  if (
    Object.keys(v.inventory).sort().join(",") !==
      "professionalSkills,skillReserves,technicalSkills" ||
    Object.keys(v.inventory.skillReserves).sort().join(",") !==
      "professionalSkills,technicalSkills"
  )
    return false;
  const ids = new Set<string>(),
    keys = new Set<string>();
  for (const category of skillCategories) {
    const active = v.inventory[category],
      reserve = v.inventory.skillReserves[category];
    if (
      !Array.isArray(active) ||
      !Array.isArray(reserve) ||
      active.length > skillInventoryPolicy.activeCategoryLimit ||
      reserve.length > 2000
    )
      return false;
    for (const f of [...active, ...reserve]) {
      if (
        !isTextFact(f) ||
        !f.value.trim() ||
        ids.has(f.id) ||
        keys.has(skillKey(f.value))
      )
        return false;
      ids.add(f.id);
      keys.add(skillKey(f.value));
    }
  }
  return v.removed.every(
    (r) =>
      r &&
      typeof r.id === "string" &&
      typeof r.label === "string" &&
      typeof r.reason === "string" &&
      !!r.reason.trim(),
  );
}
