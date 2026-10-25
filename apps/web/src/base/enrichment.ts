import {
  clone,
  editFact,
  fact,
  localId,
  type Answer,
  type BaseDraft,
} from "./model";
export function applyAnswer(
  draft: BaseDraft,
  answer: Answer,
  expectedContextId: string,
): BaseDraft {
  const role = draft.roles.find((r) => r.id === answer.targetId);
  if (!role || role.context.id !== expectedContextId)
    throw new Error("staleTarget");
  if (answer.status !== "review" || !answer.text.trim())
    throw new Error("answerUnconfirmed");
  const next = clone(draft),
    target = next.roles.find((r) => r.id === answer.targetId)!;
  const sourceId = localId(),
    added = {
      ...fact(answer.text.trim()),
      sourceId,
      status: "user_confirmed" as const,
      confirmedAt: new Date().toISOString(),
    };
  next.sources.push({
    id: sourceId,
    kind: "answer",
    label: answer.question,
    text: answer.text,
    locator: answer.targetId,
  });
  if (answer.mode === "replace") {
    added.previousFactId = target.context.id;
    target.context = {
      ...editFact(target.context, added.value),
      sourceId,
      status: "user_confirmed",
      confirmedAt: added.confirmedAt,
    };
  } else target.bullets.push(added);
  const saved = {
    ...answer,
    status: "confirmed" as const,
    sourceId,
    factId: added.id,
  };
  next.answers = [...next.answers.filter((a) => a.id !== answer.id), saved];
  return next;
}
