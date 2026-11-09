import { useState } from "react";
import { BRAIN_DUMP_QUESTION, MAX_LONG_TEXT, type Locale, type Question } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { AnswerBox, type Via } from "./AnswerBox.tsx";
import { BackButton } from "./QuestionStep.tsx";

type DumpProps = {
  roleId: string;
  title: string;
  company: string;
  /** Kept by the caller, so the ramble survives a failed call. */
  value: string;
  via: Via[];
  onChange(value: string, via: Via[]): void;
  locale: Locale;
  working: boolean;
  empty: boolean;
  busy: boolean;
  onSubmit(text: string, via: Via[]): void;
  /** On to the role's own bullets (or the done step when it has none). */
  onSkip(): void;
  /** A thin role's opening box: its questions come next, so the button says Continue. */
  boxFirst?: boolean;
  onBack?(): void;
  /** A lighter item's box (3B): its own heading, hint and prompts instead of the role's. */
  copy?: { question: string; hint: string; prompts: string[] };
};

/** "Tell us more": a ramble, typed or spoken, that becomes new bullets. */
export function BrainDumpStep({ roleId, title, company, value, via, onChange, locale, working, empty, busy, onSubmit, onSkip, boxFirst = false, onBack, copy }: DumpProps) {
  const [voiceBusy, setVoiceBusy] = useState(false);
  title = title.trim();
  company = company.trim();
  const question: Question = { bulletId: roleId, text: BRAIN_DUMP_QUESTION, options: [], kind: "detail" };
  const prompts = copy?.prompts ?? [
    t(title ? "enrich.focus.dump.prompt1" : "enrich.focus.dump.prompt1Fallback", { title }),
    t(company ? "enrich.focus.dump.prompt2" : "enrich.focus.dump.prompt2Fallback", { company }),
    t("enrich.focus.dump.prompt3"),
    t("enrich.focus.dump.prompt4"),
  ];

  return (
    <div className="fm-dump">
      <p className="fm-eyebrow">{t("enrich.focus.dump.eyebrow")}</p>
      <h2 className="fm-q is-big" id="fm-step-title">
        {copy?.question ?? t(title && company ? "enrich.focus.dump.question" : "enrich.focus.dump.questionFallback", { title, company })}
      </h2>
      <p className="fm-hint">{copy?.hint ?? t("enrich.focus.dump.hint")}</p>
      <ul className="fm-prompts">
        {prompts.map((prompt) => (
          <li key={prompt}>{prompt}</li>
        ))}
      </ul>
      <AnswerBox
        question={question}
        value={value}
        via={via}
        onChange={(v, how) => onChange(v.slice(0, MAX_LONG_TEXT), how)}
        locale={locale}
        plain
        readOnly={working}
        maxSeconds={120}
        placeholder={t("enrich.focus.dump.placeholder")}
        onBusyChange={setVoiceBusy}
      />
      {empty && !working && <p className="fm-note" role="status">{t("enrich.focus.dump.empty")}</p>}
      <p className="fm-fine">{t("enrich.focus.dump.micHint")}</p>
      <div className="fm-foot">
        <BackButton onBack={onBack} busy={busy} />
        <button type="button" className="fm-ghost" onClick={onSkip} disabled={busy}>
          {t("enrich.focus.skip")}
        </button>
        <button
          type="button"
          className="fm-btn"
          disabled={busy || voiceBusy || value.trim() === ""}
          onClick={() => onSubmit(value, via)}
        >
          {working ? t("enrich.focus.dump.working") : t(boxFirst ? "enrich.focus.continue" : "enrich.focus.dump.submit")}
        </button>
      </div>
    </div>
  );
}

type PickProps = {
  /** score: a role's bullet grade; a lighter item's lines have none. */
  proposals: { id: string; text: string; score?: number }[];
  roleAfterAll: number | null;
  busy: boolean;
  onAdd(ids: string[]): void;
  onBack?(): void;
  /** A lighter item's picks (3B): nothing ticked to start with, and the button counts the lines. */
  lines?: boolean;
};

/** The proposed bullets as checkable cards, all checked to start with (a lighter item's lines: none). */
export function DumpPickStep({ proposals, roleAfterAll, busy, onAdd, onBack, lines = false }: PickProps) {
  const [picked, setPicked] = useState(() => new Set(lines ? [] : proposals.map((p) => p.id)));
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <p className="fm-eyebrow">{t(lines ? "enrich.light.pickEyebrow" : "enrich.focus.dump.pickEyebrow")}</p>
      <h2 className="fm-q" id="fm-step-title">{t("enrich.focus.dump.pickTitle")}</h2>
      <ul className="fm-picks">
        {proposals.map((p) => (
          <li key={p.id}>
            <label className={picked.has(p.id) ? "fm-pick is-on" : "fm-pick"}>
              <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="fm-pick-text">{p.text}</span>
              {p.score !== undefined && <span className={p.score >= 75 ? "fm-tag is-up" : "fm-tag is-low"}>{p.score}</span>}
            </label>
          </li>
        ))}
      </ul>
      {roleAfterAll !== null && <p className="fm-fine">{t("enrich.focus.dump.upTo", { n: roleAfterAll })}</p>}
      <div className="fm-foot">
        <BackButton onBack={onBack} busy={busy} />
        <button type="button" className="fm-ghost" onClick={() => onAdd([])} disabled={busy}>
          {t("enrich.focus.dump.skipAll")}
        </button>
        <button type="button" className="fm-btn" onClick={() => onAdd([...picked])} disabled={busy || picked.size === 0}>
          {lines ? t(picked.size === 1 ? "enrich.light.addOne" : "enrich.light.add", { n: picked.size }) : t("enrich.focus.dump.add")}
        </button>
      </div>
    </>
  );
}
