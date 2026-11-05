import { useState } from "react";
import { BRAIN_DUMP_QUESTION, MAX_LONG_TEXT, type Locale, type Question } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { AnswerBox, type Via } from "./AnswerBox.tsx";

const PROMPTS = ["enrich.focus.dump.prompt1", "enrich.focus.dump.prompt2", "enrich.focus.dump.prompt3", "enrich.focus.dump.prompt4"] as const;

type DumpProps = {
  roleId: string;
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
};

/** "Tell us more": a ramble, typed or spoken, that becomes new bullets. */
export function BrainDumpStep({ roleId, value, via, onChange, locale, working, empty, busy, onSubmit, onSkip }: DumpProps) {
  const [voiceBusy, setVoiceBusy] = useState(false);
  const question: Question = { bulletId: roleId, text: BRAIN_DUMP_QUESTION, options: [], kind: "detail" };

  return (
    <div className="fm-dump">
      <p className="fm-eyebrow">{t("enrich.focus.dump.eyebrow")}</p>
      <h2 className="fm-q is-big" id="fm-step-title">{t("enrich.focus.dump.question")}</h2>
      <p className="fm-hint">{t("enrich.focus.dump.hint")}</p>
      <ul className="fm-prompts">
        {PROMPTS.map((k) => (
          <li key={k}>{t(k)}</li>
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
        <button type="button" className="fm-ghost" onClick={onSkip} disabled={busy}>
          {t("enrich.focus.skip")}
        </button>
        <button
          type="button"
          className="fm-btn"
          disabled={busy || voiceBusy || value.trim() === ""}
          onClick={() => onSubmit(value, via)}
        >
          {working ? t("enrich.focus.dump.working") : t("enrich.focus.dump.submit")}
        </button>
      </div>
    </div>
  );
}

type PickProps = {
  proposals: { id: string; text: string; score: number }[];
  roleAfterAll: number | null;
  busy: boolean;
  onAdd(ids: string[]): void;
};

/** The proposed bullets as checkable cards, all checked to start with. */
export function DumpPickStep({ proposals, roleAfterAll, busy, onAdd }: PickProps) {
  const [picked, setPicked] = useState(() => new Set(proposals.map((p) => p.id)));
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <p className="fm-eyebrow">{t("enrich.focus.dump.pickEyebrow")}</p>
      <h2 className="fm-q" id="fm-step-title">{t("enrich.focus.dump.pickTitle")}</h2>
      <ul className="fm-picks">
        {proposals.map((p) => (
          <li key={p.id}>
            <label className={picked.has(p.id) ? "fm-pick is-on" : "fm-pick"}>
              <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="fm-pick-text">{p.text}</span>
              <span className={p.score >= 75 ? "fm-tag is-up" : "fm-tag is-low"}>{p.score}</span>
            </label>
          </li>
        ))}
      </ul>
      {roleAfterAll !== null && <p className="fm-fine">{t("enrich.focus.dump.upTo", { n: roleAfterAll })}</p>}
      <div className="fm-foot">
        <button type="button" className="fm-ghost" onClick={() => onAdd([])} disabled={busy}>
          {t("enrich.focus.dump.skipAll")}
        </button>
        <button type="button" className="fm-btn" onClick={() => onAdd([...picked])} disabled={busy || picked.size === 0}>
          {t("enrich.focus.dump.add")}
        </button>
      </div>
    </>
  );
}
