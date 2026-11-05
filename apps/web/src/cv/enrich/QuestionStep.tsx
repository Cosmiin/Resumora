import { useState } from "react";
import type { Locale, Question } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { AnswerBox, type Via } from "./AnswerBox.tsx";

type Props = {
  bulletId: string;
  /** The bullet's stored question, or null for the free "anything else?" box. */
  question: Question | null;
  needsDetail: boolean;
  locale: Locale;
  busy: boolean;
  onSubmit(text: string, via: Via[]): void;
  onSkip(): void;
};

/** One question about the current bullet; the answer turns into a proposal right away. */
export function QuestionStep({ bulletId, question, needsDetail, locale, busy, onSubmit, onSkip }: Props) {
  const [value, setValue] = useState("");
  const [via, setVia] = useState<Via[]>([]);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const asked: Question = question ?? { bulletId, text: t("enrich.focus.followUpQuestion"), options: [], kind: "detail" };

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
        placeholder={question ? undefined : t("enrich.focus.followUpPlaceholder")}
        onBusyChange={setVoiceBusy}
      />
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
          {t("enrich.focus.improve")}
        </button>
      </div>
    </>
  );
}
