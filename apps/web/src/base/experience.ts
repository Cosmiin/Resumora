import { clone, fact, localId, type BaseDraft, type Answer } from "./model";
import { acceptWording } from "./wording";
import { skillKey, skillInventoryPolicy } from "@resumora/contracts/intelligence/skill-keywords";
import {
  experienceFacts,
  experienceTarget,
  currentExperienceAssessment,
  experienceText,
  experienceScoreIdentity,
  replaceExperiencePoint,
  type PointRef,
  type SkillSuggestion,
} from "@resumora/contracts/intelligence/experience";

/** Merge only advisory fields into the latest editor state; never replace user edits or Undo. */
export function mergeExperienceScoreState(
  current: BaseDraft,
  scored: BaseDraft,
  id: string,
  kind?: "questions",
): BaseDraft {
  if (
    current.id !== scored.id ||
    !experienceTarget(current, id) ||
    !experienceTarget(scored, id) ||
    experienceScoreIdentity(current, id) !== experienceScoreIdentity(scored, id)
  )
    return current;
  const incoming = scored.experienceEnrichment?.[id];
  if (!incoming) return current;
  const next = clone(current);
  const state = ((next.experienceEnrichment ??= {})[id] ??= { version: 1 });
  const fields = kind === "questions"
    ? (["questionPreparations"] as const)
    : (["assessment", "scorePending", "scoreError"] as const);
  for (const key of fields) {
    delete state[key];
    if (incoming[key] !== undefined)
      Object.assign(state, { [key]: clone(incoming[key]) });
  }
  return next;
}

export function confirmExperienceDetail(
  draft: BaseDraft,
  targetId: string,
  text: string,
  questionText: string,
  question: Answer["question"] = "contribution",
  answerId = localId(),
): BaseDraft {
  if (!text.trim()) throw Error("emptyAnswer");
  const next = clone(draft),
    sourceId = localId();
  next.sources.push({
    id: sourceId,
    kind: "answer",
    label: questionText,
    text: text.trim(),
    locator: targetId,
  });
  const previous = next.answers.find((a) => a.id === answerId);
  // Editing evidence must not make already applied wording disappear. Retain the old record for its citations.
  const id = previous?.status === "confirmed" ? localId() : answerId;
  if (previous?.status === "confirmed") {
    const state = ((next.experienceEnrichment ??= {})[targetId] ??= {
      version: 1,
    });
    (state.supersededAnswerIds ??= []).push(previous.id);
  }
  next.answers = [
    ...next.answers.filter((a) => a.id !== id),
    {
      id,
      targetId,
      question,
      questionText,
      text: text.trim(),
      status: "confirmed",
      sourceId,
    },
  ];
  return next;
}
export function applyExperiencePoint(
  draft: BaseDraft,
  targetId: string,
  point: PointRef | undefined,
  text: string,
  origin: "user_authored" | "ai_generated",
): BaseDraft {
  const before = experienceText(draft, targetId),
    after = replaceExperiencePoint(before, point, text);
  const sources = experienceFacts(draft, targetId);
  let next =
    origin === "user_authored"
      ? confirmExperienceDetail(draft, targetId, text, "A point you wrote")
      : clone(draft);
  next = acceptWording(next, targetId, {
    text: after,
    scope: "experience",
    origin,
    sources: experienceFacts(next, targetId),
  });
  const state = ((next.experienceEnrichment ??= {})[targetId] ??= {
    version: 1,
  });
  state.undo = { before, after, sources };
  delete state.editor;
  delete state.proposal;
  delete state.round;
  return next;
}
export function applyExperienceRole(
  draft: BaseDraft, targetId: string, text: string, origin: 'user_authored' | 'ai_generated',
): BaseDraft {
  if (!text.trim() || text.length > 12000) throw Error('INVALID_REQUEST');
  const before = experienceText(draft, targetId), sources = experienceFacts(draft, targetId);
  let next = origin === 'user_authored'
    ? confirmExperienceDetail(draft, targetId, text, 'Description you wrote') : clone(draft);
  next = acceptWording(next, targetId, { text: text.trim(), scope: 'experience', origin, sources: experienceFacts(next, targetId) });
  const state = ((next.experienceEnrichment ??= {})[targetId] ??= { version: 1 });
  state.undo = { before, after: text.trim(), sources };
  state.acceptedText = text.trim();
  const preview = state.preview, current = currentExperienceAssessment(draft, targetId);
  delete state.acceptedScore;
  if (preview?.candidate === text.trim() && preview.assessment.rubric === 'experience-quality/3' && preview.assessment.scope === 'complete') {
    const comparable = current?.rubric === 'experience-quality/3' && current.scope === 'complete' && current.policyVersion === preview.assessment.policyVersion && current.feedbackLocale === preview.assessment.feedbackLocale;
    state.acceptedScore = { ...(comparable ? { before: current.score } : {}), after: preview.assessment.score, text: text.trim() };
  }
  delete state.roleProposal; delete state.candidate; delete state.preview; delete state.round; delete state.rounds; delete state.pending;
  return next;
}
export function undoExperiencePoint(
  draft: BaseDraft,
  targetId: string,
): BaseDraft {
  const undo = draft.experienceEnrichment?.[targetId]?.undo;
  if (!undo || experienceText(draft, targetId) !== undo.after)
    throw Error("STALE_INPUT");
  // Empty original experiences have no sources. Restore by removing the overlay.
  const next = clone(draft);
  if (!undo.before.trim()) delete next.presentation.approvedWording?.[targetId];
  else
    (next.presentation.approvedWording ??= {})[targetId] = {
      text: undo.before,
      scope: "experience",
      origin: "user_authored",
      sources: clone(undo.sources),
    };
  delete next.experienceEnrichment![targetId].undo;
  return next;
}
export function applyExperienceSkills(
  draft: BaseDraft,
  targetId: string,
  suggestions: SkillSuggestion[],
  choices: Record<
    string,
    {
      selected: boolean;
      label: string;
      category: "technicalSkills" | "professionalSkills";
    }
  >,
): BaseDraft {
  const next = clone(draft);
  const key = skillKey;
  const seen = new Set(
    [...next.technicalSkills, ...next.professionalSkills].map((f) =>
      key(f.value),
    ),
  );
  for (const suggestion of suggestions) {
    const choice = choices[suggestion.id];
    if (
      !choice?.selected ||
      !choice.label.trim() ||
      seen.has(key(choice.label)) ||
      next[choice.category].length >= skillInventoryPolicy.activeCategoryLimit
    )
      continue;
    const field = fact(choice.label.trim());
    next[choice.category].push(field);
    seen.add(key(choice.label));
  }
  delete next.experienceEnrichment?.[targetId]?.skills;
  delete next.experienceEnrichment?.[targetId]?.skillChoices;
  return next;
}
