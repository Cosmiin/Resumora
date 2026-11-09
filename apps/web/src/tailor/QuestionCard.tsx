import { useState } from "react";
import type { Answer, TailorQuestion } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { useDictation } from "./SteeringStep.tsx";

type Props = {
  question: TailorQuestion;
  n: number;
  total: number;
  /** Flag cards have their own two options and no typing, skipping or Skip all. */
  onAnswer(answer: Omit<Answer, "questionId">): void;
  onSkipAll?(): void;
};

export function QuestionCard({ question, n, total, onAnswer, onSkipAll }: Props) {
  const [typed, setTyped] = useState("");
  const [via, setVia] = useState<"typed" | "voice">("typed");
  const { mic, partial } = useDictation((words) => {
    setVia("voice");
    setTyped((text) => [text.trimEnd(), words].filter(Boolean).join(" "));
  });
  const flag = question.kind === "flag";
  return <section className={flag ? "tailor-card is-flag" : "tailor-card"} aria-labelledby={`q-${question.id}`}>
    <p className="tailor-eyebrow">{flag ? t("tailor.flag.eyebrow") : t("tailor.question.progress", { n, total })}</p>
    <h2 id={`q-${question.id}`}>{question.text}</h2>
    <div className="tailor-options">
      {question.options.map((option) => <button key={option} type="button" className="secondary"
        onClick={() => onAnswer({ value: option, via: "option" })}>{option}</button>)}
    </div>
    {!flag && <>
      <label htmlFor={`typed-${question.id}`}>{t("tailor.question.typed")}</label>
      <div className="tailor-field">
        <textarea id={`typed-${question.id}`} rows={2} maxLength={2000} value={typed}
          onChange={(event) => { setTyped(event.target.value); if (!event.target.value) setVia("typed"); }} />
        {mic}
      </div>
      {partial && <p aria-live="polite">{partial}</p>}
      <div className="tailor-actions">
        <button type="button" className="primary" disabled={!typed.trim()} onClick={() => onAnswer({ value: typed.trim(), via })}>
          {t("tailor.question.send")}
        </button>
        <button type="button" className="secondary" onClick={() => onAnswer({ value: null, via: "skip" })}>{t("tailor.question.skip")}</button>
        {onSkipAll && <button type="button" className="link" onClick={onSkipAll}>{t("tailor.question.skipAll")}</button>}
      </div>
    </>}
  </section>;
}
