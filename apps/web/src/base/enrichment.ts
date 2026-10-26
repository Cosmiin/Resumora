import {
  allFacts,
  clone,
  editFact,
  fact,
  localId,
  type Answer,
  type BaseDraft,
  type Fact,
} from "./model";
export function enrichmentTarget(
  draft: BaseDraft,
  id: string,
): { field: Fact<string>; label: string } | null {
  const role = draft.roles.find((r) => r.id === id);
  if (role)
    return {
      field: role.context,
      label: [role.title.value, role.company.value].filter(Boolean).join(" · "),
    };
  const entry = draft.optionalSections
    .filter((s) => s.kind !== "languages")
    .flatMap((s) => s.entries)
    .find((e) => e.id === id);
  return entry ? { field: entry.details, label: entry.title.value } : null;
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
  const role = next.roles.find((r) => r.id === answer.targetId);
  const prior = answer.factId
    ? allFacts(next).find((f) => f.id === answer.factId)
    : undefined;
  let result: Fact<string>;
  if (prior && typeof prior.value === "string") {
    result = { ...editFact(prior as Fact<string>, answer.text), sourceId };
    Object.assign(prior, result);
  } else if (role && answer.mode === "append") {
    result = { ...fact(answer.text), sourceId };
    role.bullets.push(result);
    // Existing formatting is presentation; fall back to the complete factual list after an append.
    if (next.presentation.contributionHtml)
      delete next.presentation.contributionHtml[role.id];
  } else {
    const value =
      answer.mode === "replace"
        ? answer.text
        : [target.field.value, answer.text].filter(Boolean).join("\n");
    result = { ...editFact(target.field, value), sourceId };
    Object.assign(target.field, result);
  }
  next.answers = [
    ...next.answers.filter((a) => a.id !== answer.id),
    { ...answer, status: "confirmed", sourceId, factId: result.id },
  ];
  return next;
}
