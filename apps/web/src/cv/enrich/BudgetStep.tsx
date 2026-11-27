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
 * The short path's questions step: the questions worth the most across the CV, one screen per role (owner, 27 Nov 2026).
 * The role stays on top while its questions come one after another: an answered one folds into one line (the question
 * and the answer) and the next fades in under it, so only one question is open at a time. The line a question is about
 * shows with it. "Rather just talk?" takes the role's answer in one box and skips that role's other questions.
 */
export function BudgetStep({ cv, items, onAnswer, onTalk, onDone }: Props) {
  const [index, setIndex] = useState(0);
  /** What was done with each question passed so far: its answer, or null when it was skipped. */
  const [answers, setAnswers] = useState<Record<number, string | null>>({});
  const [talking, setTalking] = useState<{ value: string; via: Via[] } | null>(null);
  const [talked, setTalked] = useState<Set<string>>(new Set());
  const item = items[index];
  if (!item) return null;
  const role = findScored(cv, item.roleId)?.item;
  const line = item.kind === "line" ? role?.bullets.find((b) => b.id === item.question.bulletId)?.text : undefined;

  // The questions of a role come back to back (the budget keeps them so): the roles in order, and this role's place.
  const roleIds = items.reduce<string[]>((ids, it) => (ids[ids.length - 1] === it.roleId ? ids : [...ids, it.roleId]), []);
  const mine = items.map((it, i) => ({ it, i })).filter(({ it }) => it.roleId === item.roleId);
  const place = mine.findIndex(({ i }) => i === index);
  const passed = mine.slice(0, place).filter(({ i }) => i in answers);

  /** The next question, leaving out the roles already told about in one box. */
  const nextIndex = (from: number, done: ReadonlySet<string>) => {
    let i = from + 1;
    while (i < items.length && done.has(items[i]!.roleId)) i++;
    return i;
  };
  const next = (from: number, done: ReadonlySet<string>) => {
    const i = nextIndex(from, done);
    if (i >= items.length) onDone();
    else setIndex(i);
  };
  const previous = (() => {
    let i = index - 1;
    while (i >= 0 && talked.has(items[i]!.roleId)) i--;
    return i;
  })();
  // The button says where it leads: the role's next question, the next role, or the end of the questions.
  const after = nextIndex(index, talked);
  const submitLabel = after >= items.length ? t("enrich.focus.continue") : items[after]!.roleId !== item.roleId ? t("enrich.path.budget.nextRole") : undefined;

  return (
    <>
      <div className="rr-prog">
        <p className="fm-eyebrow">
          {t("enrich.path.step", { n: 4, total: 4 })} · {t("enrich.path.budget.roleOf", { n: roleIds.indexOf(item.roleId) + 1, total: roleIds.length })}
        </p>
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
          {passed.length > 0 && (
            <ol className="bq-passed" aria-label={t("enrich.path.budget.passed")}>
              {passed.map(({ it, i }) => (
                <li key={i} className="bq-passed-row">
                  <span className="bq-passed-q">{it.question.text}</span>
                  <span className={answers[i] === null ? "bq-passed-a is-skipped" : "bq-passed-a"} lang={answers[i] === null ? undefined : cv.locale}>
                    {answers[i] ?? t("enrich.path.budget.skipped")}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div key={index} className="bq-current">
            {mine.length > 1 && <p className="bq-count">{t("enrich.focus.questionOf", { n: place + 1, total: mine.length })}</p>}
            <RunQuestion item={runItem(item, index)} line={line} why={null} initial={answers[index] ?? ""} locale={cv.locale} busy={false} submitLabel={submitLabel}
              onSubmit={(text, via) => {
                const value = text.trim();
                onAnswer(item, value, via.length ? via : ["type"]);
                setAnswers((a) => ({ ...a, [index]: value }));
                next(index, talked);
              }}
              onSkip={() => {
                // A question skipped after it was answered keeps its answer: the note is already saved.
                setAnswers((a) => (typeof a[index] === "string" ? a : { ...a, [index]: null }));
                next(index, talked);
              }}
              onBack={previous >= 0 ? () => setIndex(previous) : undefined} />
            <button type="button" className="fm-ghost fm-free-talk" onClick={() => setTalking({ value: "", via: [] })}>{t("enrich.path.budget.talk")}</button>
          </div>
        </>
      )}
    </>
  );
}
