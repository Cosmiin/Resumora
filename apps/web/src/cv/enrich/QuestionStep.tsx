import { useState } from "react";
import { isAllowedOption, type Locale, type Question, type RoleQuestion } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { AnswerBox, type Via } from "./AnswerBox.tsx";

type Props = {
  question: Question | RoleQuestion;
  needsDetail: boolean;
  locale: Locale;
  busy: boolean;
  onSubmit(text: string, via: Via[]): void;
  onSkip(): void;
  onFreeTalk(): void;
};

/** One question about the current bullet; the answer turns into a proposal right away. */
export function QuestionStep({ question, needsDetail, locale, busy, onSubmit, onSkip, onFreeTalk }: Props) {
  const [value, setValue] = useState("");
  const [via, setVia] = useState<Via[]>([]);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const options = question.options.filter((o) => o.length <= 60 && isAllowedOption(o)).slice(0, 4);
  const asked: Question = { ...question, bulletId: "bulletId" in question ? question.bulletId : question.id,
    kind: question.kind === "role" ? "detail" : question.kind, options: options.length >= 2 ? options : [] };

  return (
    <>
      {needsDetail && <p className="fm-note">{t("enrich.focus.needsDetail")}</p>}
      <h2 className="fm-q" id="fm-step-title">{asked.text}</h2>
      <AnswerBox
        question={asked}
        value={value}
        via={via}
        onChange={(v, how) => {
          setValue(v);
          setVia(how);
        }}
        locale={locale}
        onBusyChange={setVoiceBusy}
      />
      <button type="button" className="fm-ghost fm-free-talk" onClick={onFreeTalk} disabled={busy}>
        {t("enrich.focus.freeTalk")}
      </button>
      <div className="fm-foot">
        <button type="button" className="fm-ghost" onClick={onSkip} disabled={busy}>
          {t("enrich.focus.skip")}
        </button>
        <button
          type="button"
          className="fm-btn"
          disabled={busy || voiceBusy || value.trim() === ""}
          onClick={() => onSubmit(value, via)}
        >
          {t(question.kind === "role" ? "enrich.focus.continue" : "enrich.focus.improve")}
        </button>
      </div>
    </>
  );
}
