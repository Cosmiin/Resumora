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
import { replaceFact } from "./editing";
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
export function applyAnswer(
  draft: BaseDraft,
  answer: Answer,
  expectedContextId: string,
): BaseDraft {
  const original = enrichmentTarget(draft, answer.targetId);
  if (!original || original.field.id !== expectedContextId)
    throw new Error("staleTarget");
  if (!["draft", "review"].includes(answer.status) || !answer.text.trim())
    throw new Error("emptyAnswer");
  const next = clone(draft),
    target = enrichmentTarget(next, answer.targetId)!;
  const sourceId = localId();
  next.sources.push({
    id: sourceId,
    kind: "answer",
    label: answer.question,
    text: answer.text,
    locator: answer.targetId,
  });
  const prior = answer.factId
    ? [target.field, ...(target.entry.bullets ?? [])].find(
        (f) => f.id === answer.factId,
      )
    : undefined;
  let result: Fact<string>;
  if (prior) {
    result = { ...editFact(prior, answer.text), sourceId };
    replaceFact(next, prior, result);
  } else if (answer.mode === "append") {
    result = { ...fact(answer.text), sourceId };
    (target.entry.bullets ??= []).push(result);
    delete next.presentation.contributionHtml?.[target.entry.id];
  } else {
    result = { ...editFact(target.field, answer.text), sourceId };
    replaceFact(next, target.field, result);
  }
  next.answers = [
    ...next.answers.filter((a) => a.id !== answer.id),
    { ...answer, status: "confirmed", sourceId, factId: result.id },
  ];
  return next;
}
