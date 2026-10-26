import {
  clone,
  editFact,
  fact,
  localId,
  type Answer,
  type BaseDraft,
  type Fact,
  type Role,
  type OptionalEntry,
} from "./model";
import { replaceFact, updateContributionHtml } from "./editing";
export function enrichmentTarget(
  draft: BaseDraft,
  id: string,
): { field: Fact<string>; label: string; entry: Role | OptionalEntry } | null {
  const role = draft.roles.find((r) => r.id === id);
  if (role)
    return {
      field: role.context,
      entry: role,
      label: [role.title.value, role.company.value].filter(Boolean).join(" · "),
    };
  const entry = draft.optionalSections
    .filter((s) => s.kind !== "languages")
    .flatMap((s) => s.entries)
    .find((e) => e.id === id);
  return entry
    ? { field: entry.details, label: entry.title.value, entry }
    : null;
}
export function saveAnswer(
  draft: BaseDraft,
  answer: Answer,
  expectedContextId: string,
): BaseDraft {
  const target = enrichmentTarget(draft, answer.targetId);
  if (!target || target.field.id !== expectedContextId)
    throw new Error("staleTarget");
  if (
    answer.status !== "draft" ||
    !answer.text.trim() ||
    !answer.questionText.trim()
  )
    throw new Error("emptyAnswer");
  const next = clone(draft);
  const sourceId = localId();
  next.sources.push({
    id: sourceId,
    kind: "answer",
    label: answer.questionText,
    text: answer.text,
    locator: answer.targetId,
  });
  const stored = next.answers.find((a) => a.id === answer.id);
  next.answers = [
    ...next.answers.filter((a) => a.id !== answer.id),
    {
      ...answer,
      cvFieldId: stored?.cvFieldId,
      targetLabel: target.label,
      status: "confirmed",
      sourceId,
    },
  ];
  return next;
}
export function addAnswerToCv(
  draft: BaseDraft,
  answerId: string,
  expectedContextId: string,
): BaseDraft {
  const answer = draft.answers.find((a) => a.id === answerId);
  const target = answer && enrichmentTarget(draft, answer.targetId);
  if (
    !answer ||
    answer.status !== "confirmed" ||
    !target ||
    target.field.id !== expectedContextId
  )
    throw new Error("staleTarget");
  const next = clone(draft);
  const saved = next.answers.find((a) => a.id === answerId)!;
  const entry = enrichmentTarget(next, saved.targetId)!.entry;
  const current = entry.bullets?.find((f) => f.fieldId === saved.cvFieldId);
  if (current?.value === saved.text) return next;
  if (current)
    replaceFact(next, current, {
      ...editFact(current, saved.text),
      sourceId: saved.sourceId!,
    });
  else {
    const added = { ...fact(saved.text), sourceId: saved.sourceId! };
    (entry.bullets ??= []).push(added);
    saved.cvFieldId = added.fieldId;
    updateContributionHtml(next, entry.id, added.fieldId, added.value);
  }
  return next;
}
export function removeAnswerFromCv(
  draft: BaseDraft,
  answerId: string,
): BaseDraft {
  const next = clone(draft);
  const answer = next.answers.find((a) => a.id === answerId)!;
  const target = enrichmentTarget(next, answer.targetId);
  if (target?.entry.bullets)
    target.entry.bullets = target.entry.bullets.filter(
      (f) => f.fieldId !== answer.cvFieldId,
    );
  if (answer.cvFieldId)
    updateContributionHtml(next, answer.targetId, answer.cvFieldId);
  delete answer.cvFieldId;
  return next;
}
