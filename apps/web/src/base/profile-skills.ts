import { allInventorySkills } from "@resumora/contracts/intelligence/skills-improvement";
import { clone, fact, type BaseDraft } from "./model";
import {
  isSkillKeyword,
  rankSkillCandidates,
  skillInventoryPolicy,
  skillKey,
} from "@resumora/contracts/intelligence/skill-keywords";
export { skillKey } from "@resumora/contracts/intelligence/skill-keywords";
import {
  experienceTargets,
  experienceIdentity,
  type SkillSuggestion,
} from "@resumora/contracts/intelligence/experience";
export type ProfileSkill = {
  id: string;
  label: string;
  category: SkillSuggestion["category"];
  selected: boolean;
  importance?: SkillSuggestion["importance"];
  sources: {
    targetId: string;
    suggestionId: string;
    label: string;
    identity: string;
  }[];
};
export function profileSkillSuggestions(
  d: BaseDraft,
  currentPolicyOnly = false,
): ProfileSkill[] {
  const chosen = new Map<
    string,
    { selected: boolean; label: string; category: SkillSuggestion["category"] }
  >();
  const accepted = new Set(
      [
        ...allInventorySkills(d, "technicalSkills"),
        ...allInventorySkills(d, "professionalSkills"),
      ].map((f) => skillKey(f.value)),
    ),
    rows = new Map<string, ProfileSkill>();
  for (const target of experienceTargets(d)) {
    const state = d.experienceEnrichment?.[target.id],
      identity = experienceIdentity(d, target.id);
    if (
      !state?.skills ||
      state.skillsIdentity !== identity ||
      (currentPolicyOnly &&
        state.skills.extractionVersion !== skillInventoryPolicy.version)
    )
      continue;
    for (const s of state.skills.skills) {
      const key = skillKey(s.label),
        choice = state.skillChoices?.[s.id];
      if (accepted.has(key) || choice?.dismissed) continue;
      if (choice && (!chosen.has(key) || !choice.selected))
        chosen.set(key, choice);
      const source = {
        targetId: target.id,
        suggestionId: s.id,
        label: s.label,
        identity,
      };
      const existing = rows.get(key);
      if (existing) {
        existing.sources.push(source);
        if (s.importance === "core") existing.importance = "core";
      } else
        rows.set(key, {
          id: key,
          label: choice?.label ?? s.label,
          category: choice?.category ?? s.category,
          selected: choice?.selected ?? true,
          importance: s.importance,
          sources: [source],
        });
    }
  }
  return [...rows.values()].map((row) => ({ ...row, ...chosen.get(row.id) }));
}
export function setProfileSkillChoice(
  d: BaseDraft,
  row: ProfileSkill,
  patch: Partial<Pick<ProfileSkill, "label" | "selected" | "category">>,
): BaseDraft {
  const next = clone(d);
  for (const source of row.sources) {
    const state = next.experienceEnrichment?.[source.targetId];
    if (!state) continue;
    (state.skillChoices ??= {})[source.suggestionId] = {
      selected: patch.selected ?? row.selected,
      label: (patch.label ?? row.label).slice(0, 100),
      category: patch.category ?? row.category,
    };
  }
  return next;
}
export function acceptProfileSkills(
  d: BaseDraft,
  rows: ProfileSkill[],
): BaseDraft {
  const next = clone(d);
  for (const row of rows.filter((r) => r.selected && r.label.trim())) {
    if (
      row.sources.some(
        (s) =>
          !experienceTargets(d).some((t) => t.id === s.targetId) ||
          experienceIdentity(d, s.targetId) !== s.identity,
      )
    )
      throw Error("STALE_INPUT");
    const key = skillKey(row.label);
    const existing = [
      ...allInventorySkills(next, "technicalSkills"),
      ...allInventorySkills(next, "professionalSkills"),
    ].find((f) => skillKey(f.value) === key);
    const field = existing ?? fact(row.label.trim());
    if (!existing) {
      if (next[row.category].length < skillInventoryPolicy.activeCategoryLimit)
        next[row.category].push(field);
      else
        (next.skillReserves ??= {
          technicalSkills: [],
          professionalSkills: [],
        })[row.category].push(field);
    }
    for (const source of row.sources) {
      const state = next.experienceEnrichment![source.targetId];
      (state.skillChoices ??= {})[source.suggestionId] = {
        selected: false,
        dismissed: true,
        label: row.label,
        category: row.category,
      };
    }
  }
  return next;
}

/** An explicit discovery click adds supported keywords, retaining prior dismissals. */
export function addProfileSkillKeywords(d: BaseDraft): BaseDraft {
  const excluded = new Set([
    ...(d.skillExclusions ?? []),
    ...Object.values(d.experienceEnrichment ?? {}).flatMap((state) =>
      Object.values(state.skillChoices ?? {})
        .filter((choice) => !choice.selected)
        .map((choice) => skillKey(choice.label)),
    ),
  ]);
  const candidates = profileSkillSuggestions(d, true)
    .filter(
      (row) => isSkillKeyword(row.label) && !excluded.has(skillKey(row.label)),
    )
    .map((row) => ({
      ...row,
      selected: true,
    }));
  const rows = rankSkillCandidates(candidates);
  return rows.length ? acceptProfileSkills(d, rows) : d;
}

/** Delete from both active and reserve inventory; remember the explicit user choice. */
export function removeProfileSkill(d: BaseDraft, id: string): BaseDraft {
  const existing = [
    ...allInventorySkills(d, "technicalSkills"),
    ...allInventorySkills(d, "professionalSkills"),
  ].find((f) => f.id === id);
  if (!existing) return d;
  const next = clone(d),
    key = skillKey(existing.value);
  for (const category of ["technicalSkills", "professionalSkills"] as const) {
    next[category] = next[category].filter((f) => skillKey(f.value) !== key);
    if (next.skillReserves)
      next.skillReserves[category] = next.skillReserves[category].filter(
        (f) => skillKey(f.value) !== key,
      );
  }
  if (key)
    next.skillExclusions = [...new Set([...(next.skillExclusions ?? []), key])];
  return next;
}
