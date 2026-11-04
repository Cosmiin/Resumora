import {
  canonicalSkill,
  rankSkillCandidates,
  skillInventoryPolicy,
  skillKey,
} from "@resumora/contracts/intelligence/skill-keywords";
import type { SkillSuggestion } from "@resumora/contracts/intelligence/experience";

export const skillInstructions = `Build a reusable master-CV skills inventory, based on the candidate’s own experience. Extract meaningful capabilities from the candidate's own documented actions, responsibilities, achievements and confirmed answers. Return up to 30 technical and 30 professional skill candidates per evidence batch, never filling quotas. The application selects the strongest 20 per category for display and keeps additional supported skills in reserve; do not discard supported candidates solely to meet the display limit. Cover all distinct supported capabilities; when over capacity prioritize core, informative, reusable skills over incidental or granular activities.
LABEL POLICY: Natural-language skill and competency labels use documentLocale, including when the evidence or a coaching answer is in another language. Prefer familiar, unambiguous acronyms (for example SQL, API, CRM and CI/CD) when that is the standard recruiter-facing name; never invent abbreviations or shorten a different capability to a tool name. Preserve established product/technology names and genuinely conventional borrowed business/technical terms (for example Python, SQL and Scrum); do not force unnatural literal translations. Normally use 1–2 words. Longer official product names or established professional concepts are allowed, up to 8 words and 100 characters. Use familiar recruiter/industry terminology, one skill per label, no sentences or responsibility fragments. Preserve useful distinctions: SQL and Data Validation are different capabilities. Consolidate equivalent synonyms, spelling variants and translations; do not merge different technologies, levels of scope, or a tool with a demonstrated method.
CLASSIFICATION: technicalSkills means concrete technical knowledge, tools, technologies, platforms, technical methodologies and implementation capabilities. professionalSkills means transferable interpersonal, analytical, management, coordination and business/organizational capabilities. Classify by the demonstrated activity, never by the candidate's profession. Requirements Analysis, Business Analysis, Process Improvement and business Workflow Design belong to professionalSkills. Implementing Workflow Automation, API Integration, Data Modelling, Data Validation or Software Testing belongs to technicalSkills. Mere discussion of a system does not demonstrate implementation. Never output the same competency in both categories.
EXTRACTION: Infer skills from the candidate's concrete actions. Exclude speculation, negated abilities, aspirations and someone else's work. Never invent tools, proficiency levels, metrics or qualifications. Return skill labels, categories and importance only; do not return references or explanations.
SELECTION: importance=core for substantive reusable capabilities central to the documented work; supporting for clearly evidenced but incidental capabilities. existing contains already accepted labels for synonym deduplication only, never proof of capability. Prefer the established standard label. Examples above illustrate boundaries, not a checklist: never add an example without evidence. Return an empty skills array when nothing supported remains.`;

export const skillsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["skills"],
  properties: {
    skills: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "category", "importance"],
        properties: {
          label: { type: "string", minLength: 1, maxLength: 100 },
          category: {
            type: "string",
            enum: ["technicalSkills", "professionalSkills"],
          },
          importance: { type: "string", enum: ["core", "supporting"] },
        },
      },
    },
  },
};
/** Validate the response structure, without checking skill claims against source text. */
export function parseSkillCandidates(
  raw: unknown,
  chunk = 0,
  locale = "en",
): SkillSuggestion[] {
  const fail = (): never => {
    throw Error("AI_OUTPUT_INVALID");
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
  const v = raw as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => k !== "skills") ||
    !Array.isArray(v.skills) ||
    v.skills.length > 60
  )
    return fail();
  const counts = { technicalSkills: 0, professionalSkills: 0 };
  return v.skills.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return fail();
    const s = value as Record<string, unknown>;
    if (
      Object.keys(s).length !== 3 ||
      Object.keys(s).some(
        (k) => !skillsSchema.properties.skills.items.required.includes(k),
      ) ||
      typeof s.label !== "string" ||
      !s.label.trim() ||
      s.label.length > 100 ||
      (s.category !== "technicalSkills" &&
        s.category !== "professionalSkills") ||
      (s.importance !== "core" && s.importance !== "supporting")
    )
      return fail();
    const canonical = canonicalSkill(s.label, s.category, locale);
    if (++counts[canonical.category] > skillInventoryPolicy.categoryLimit)
      return fail();
    return {
      id: `skill-${chunk}-${index}`,
      ...canonical,
      importance: s.importance,
    };
  });
}
export function consolidateSkillCandidates(
  suggestions: SkillSuggestion[],
  existing: string[],
): SkillSuggestion[] {
  const seen = new Set(existing.map(skillKey)),
    counts = { technicalSkills: 0, professionalSkills: 0 };
  return rankSkillCandidates(suggestions).filter((s) => {
    const key = skillKey(s.label);
    if (
      seen.has(key) ||
      counts[s.category] >= skillInventoryPolicy.categoryLimit
    )
      return false;
    seen.add(key);
    counts[s.category]++;
    return true;
  });
}
