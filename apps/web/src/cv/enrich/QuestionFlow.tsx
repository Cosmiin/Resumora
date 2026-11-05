import { useEffect, useRef, useState } from "react";
import { MAX_LONG_TEXT, newId, type Experience, type Locale, type Question } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { AnswerBox, type Via } from "./AnswerBox.tsx";

type Props = {
  role: Experience;
  questions: Question[];
  dispatch(a: CvAction): void;
  /** Resolves once the answers are saved, so the rewrite reads them on the server. */
  waitForSave(): Promise<void>;
  /** Open the rewrite review. */
  onDraft(): void;
  locale?: Locale;
};

/** The role's questions, one at a time. Each answer is saved as a note on the role right away. */
export function QuestionFlow({ role, questions, dispatch, waitForSave, onDraft, locale }: Props) {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<{ value: string; via: Via[] }>({ value: "", via: [] });
  const [saved, setSaved] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const next = () => {
    setAnswer({ value: "", via: [] });
    setStep((s) => s + 1);
  };

  const save = (question: Question) => {
    const text = answer.value.trim().slice(0, MAX_LONG_TEXT);
    if (text === "") return;
    dispatch({
      type: "setNote",
      roleId: role.id,
      note: {
        id: newId(),
        question: question.text,
        answer: text,
        via: answer.via.length > 0 ? answer.via : ["type"],
        askedAt: new Date().toISOString(),
      },
    });
    setSaved((n) => n + 1);
    next();
  };

  const draft = async () => {
    setSaveFailed(false);
    setDrafting(true);
    try {
      await waitForSave();
    } catch {
      // The draft reads the saved answers, so it waits until they are saved.
      if (alive.current) {
        setDrafting(false);
        setSaveFailed(true);
      }
      return;
    }
    if (alive.current) onDraft();
  };

  const question = questions[step];
  if (!question) {
    return (
      <div className="box question-flow">
        {saved > 0 && <strong>{saved === 1 ? t("enrich.questions.thanksOne") : t("enrich.questions.thanksMany", { n: saved })}</strong>}
        <p className="fine">{t("enrich.questions.draftNote")}</p>
        {saveFailed && (
          <p className="review-note" role="alert">
            {t("enrich.summary.saveFailed")}
          </p>
        )}
        {drafting ? (
          <p className="working" role="status">
            {t("enrich.review.drafting")}
          </p>
        ) : (
          <div className="row-btns">
            <button type="button" className="btn primary" onClick={() => void draft()}>
              {t("enrich.questions.draft")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const about = role.bullets.find((b) => b.id === question.bulletId)?.text.trim();
  return (
    <div className="question-flow">
      <div className="box qbox">
        <span className="qcount">{t("enrich.questions.count", { n: step + 1, total: questions.length })}</span>
        <p className="qtext" lang={locale}>
          {question.text}
        </p>
        {about && (
          <p className="qfor" lang={locale}>
            {t("enrich.questions.about", { text: about })}
          </p>
        )}
        <AnswerBox
          key={step}
          question={question}
          value={answer.value}
          via={answer.via}
          onChange={(value, via) => setAnswer({ value, via })}
          locale={locale}
        />
        <div className="row-btns">
          <button type="button" className="btn" onClick={next}>
            {t("enrich.questions.skip")}
          </button>
          <button type="button" className="btn primary" disabled={answer.value.trim() === ""} onClick={() => save(question)}>
            {t("enrich.questions.save")}
          </button>
        </div>
      </div>
      <p className="saved-note">{t("enrich.questions.savedNote")}</p>
    </div>
  );
}
