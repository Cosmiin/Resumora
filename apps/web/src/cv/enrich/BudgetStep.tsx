import { useState } from "react";
import { findScored, type BudgetItem, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { formatRange } from "../page/blocks.ts";
import type { Via } from "./AnswerBox.tsx";
import { BrainDumpStep } from "./BrainDumpStep.tsx";
import { RunQuestion } from "./RoleRun.tsx";
import type { RunItem } from "./run.ts";

type Props = {
  cv: CvContent;
  items: BudgetItem[];
  onAnswer(item: BudgetItem, text: string, via: Via[]): void;
  /** "Rather just talk?": one free answer for the role on screen. */
  onTalk(roleId: string, text: string, via: Via[]): void;
  onDone(): void;
};

const runItem = (item: BudgetItem, index: number): Exclude<RunItem, { kind: "box" }> =>
  item.kind === "role" ? { key: `b${index}`, kind: "role", question: item.question } : { key: `b${index}`, kind: "line", question: item.question };

/**
 * The short path's third step: the questions worth the most across the CV, one per screen. Each shows its role on top
 * (title · company · years, and the line when it is about one). "Rather just talk?" takes the role's answer in one box
 * and skips that role's other questions.
 */
export function BudgetStep({ cv, items, onAnswer, onTalk, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [talking, setTalking] = useState<{ value: string; via: Via[] } | null>(null);
  const [talked, setTalked] = useState<Set<string>>(new Set());
  const item = items[index];
  if (!item) return null;
  const role = findScored(cv, item.roleId)?.item;
  const line = item.kind === "line" ? role?.bullets.find((b) => b.id === item.question.bulletId)?.text : undefined;

  /** The next question, leaving out the roles already told about in one box. */
  const next = (from: number, done: ReadonlySet<string>) => {
    let i = from + 1;
    while (i < items.length && done.has(items[i]!.roleId)) i++;
    if (i >= items.length) onDone();
    else setIndex(i);
  };
  const previous = (() => {
    let i = index - 1;
    while (i >= 0 && talked.has(items[i]!.roleId)) i--;
    return i;
  })();

  return (
    <>
      <div className="rr-prog">
        <p className="fm-eyebrow">{t("enrich.path.step", { n: 3, total: 4 })} · {t("enrich.focus.questionOf", { n: index + 1, total: items.length })}</p>
        <div className="fm-steps" aria-hidden="true">
          {items.map((it, i) => <i key={i} className={i < index ? "is-done" : i === index ? "is-on" : undefined} />)}
        </div>
      </div>
      <p className="ep-rolecard" data-testid="ep-rolecard">
        <b>{role?.title || role?.company}</b>
        {[role?.title ? role.company : "", role ? formatRange(role.startDate, role.endDate, role.current, cv.locale) : ""].filter(Boolean).map((part) => ` · ${part}`).join("")}
      </p>
      {talking ? (
        <BrainDumpStep roleId={item.roleId} title={role?.title ?? ""} company={role?.company ?? ""} value={talking.value} via={talking.via}
          onChange={(value, via) => setTalking({ value, via })} locale={cv.locale} working={false} empty={false} busy={false} boxFirst
          onSubmit={(text, via) => {
            const done = new Set(talked).add(item.roleId);
            onTalk(item.roleId, text.trim(), via.length ? via : ["type"]);
            setTalked(done);
            setTalking(null);
            next(index, done);
          }}
          onSkip={() => setTalking(null)} />
      ) : (
        <>
          <RunQuestion key={index} item={runItem(item, index)} line={line} why={null} initial={answers[index] ?? ""} locale={cv.locale} busy={false}
            onSubmit={(text, via) => {
              const value = text.trim();
              onAnswer(item, value, via.length ? via : ["type"]);
              setAnswers((a) => ({ ...a, [index]: value }));
              next(index, talked);
            }}
            onSkip={() => next(index, talked)}
            onBack={previous >= 0 ? () => setIndex(previous) : undefined} />
          <button type="button" className="fm-ghost fm-free-talk" onClick={() => setTalking({ value: "", via: [] })}>{t("enrich.path.budget.talk")}</button>
        </>
      )}
    </>
  );
}
