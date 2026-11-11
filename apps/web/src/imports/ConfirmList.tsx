import { useState } from "react";
import type { CvContent } from "@resumora/shared";
import { t } from "../i18n/t.ts";

/** What a "thing to confirm" is about. The reader tags each one; an untagged one (older imports, our own notes) is "other". */
export type ConfirmTopic = "name" | "contact" | "languages" | "certifications" | "other";
const EDITABLE: readonly ConfirmTopic[] = ["name", "contact", "languages", "certifications"];

/** "[name] The first and last name need confirming" → the topic and the sentence without its tag. */
export function parseWarning(warning: string): { topic: ConfirmTopic; text: string } {
  const tag = /^\[([a-z]+)\]\s*/.exec(warning);
  if (!tag) return { topic: "other", text: warning };
  const topic = (EDITABLE as readonly string[]).includes(tag[1]!) ? (tag[1] as ConfirmTopic) : "other";
  return { topic, text: warning.slice(tag[0].length) };
}

/** A full name split at its last word, as a starting point the person corrects: never used without their Save. */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { firstName: words[0] ?? "", lastName: "" };
  return { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1]! };
}

const DATE = /^(\d{4}(-(0[1-9]|1[0-2]))?)?$/;
type State = "open" | "editing" | "confirmed" | "later";

/**
 * The things the reader was not sure about, each with its own actions: say it is correct, or change it
 * right here. A change goes into the CV being imported; nothing is saved until the import is used.
 */
export function ConfirmList(props: { warnings: readonly string[]; cv: CvContent; onChange(change: (cv: CvContent) => CvContent): void }) {
  const { warnings, cv, onChange } = props;
  const [states, setStates] = useState<Record<string, State>>({});
  if (warnings.length === 0) return null;
  const set = (key: string, state: State) => setStates((s) => ({ ...s, [key]: state }));
  const done = warnings.filter((w) => ["confirmed", "later"].includes(states[w] ?? "open")).length;

  return (
    <section className="import-confirm" aria-labelledby="import-confirm-title">
      <h3 id="import-confirm-title">{t(warnings.length === 1 ? "import.summary.confirmOne" : "import.summary.confirmMany", { n: warnings.length })}</h3>
      <p className="ui-small ui-muted" role="status">{t("import.confirm.done", { n: done, total: warnings.length })}</p>
      <ul>
        {warnings.map((warning) => {
          const { topic, text } = parseWarning(warning);
          const state = states[warning] ?? "open";
          const editable = topic !== "other";
          return (
            <li key={warning} className={state === "confirmed" || state === "later" ? "is-done" : undefined}>
              <p>{text}</p>
              {state === "editing" ? (
                <ConfirmForm topic={topic} cv={cv} onCancel={() => set(warning, "open")}
                  onSave={(change) => {
                    onChange(change);
                    set(warning, "confirmed");
                  }} />
              ) : state === "open" ? (
                <div className="ui-row">
                  <button type="button" className="ui-btn ui-btn--sm" onClick={() => set(warning, "confirmed")}>{t("import.confirm.ok")}</button>
                  {editable
                    ? <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => set(warning, "editing")}>{t("import.confirm.change")}</button>
                    : <button type="button" className="ui-btn ui-btn--sm" onClick={() => set(warning, "later")}>{t("import.confirm.later")}</button>}
                </div>
              ) : (
                <div className="ui-row">
                  <span className="ui-pill ui-pill--good">{t(state === "confirmed" ? "import.confirm.confirmed" : "import.confirm.noted")}</span>
                  <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={() => set(warning, editable ? "editing" : "open")}>{t("import.confirm.again")}</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type Field = { key: string; label: string; value: string; date?: boolean };

/** The fields a topic can change, read from the CV being imported, and how the edited values go back into it. */
function fieldsFor(topic: ConfirmTopic, cv: CvContent): { fields: Field[]; apply(values: Record<string, string>): (cv: CvContent) => CvContent } {
  if (topic === "name") {
    const guess = cv.basics.firstName || cv.basics.lastName ? cv.basics : splitName(cv.basics.fullName);
    return {
      fields: [
        { key: "firstName", label: t("import.confirm.firstName"), value: guess.firstName },
        { key: "lastName", label: t("import.confirm.lastName"), value: guess.lastName },
      ],
      apply: (v) => (c) => ({ ...c, basics: { ...c.basics, firstName: v.firstName!.trim(), lastName: v.lastName!.trim() } }),
    };
  }
  if (topic === "contact") {
    const keys = ["email", "phone", "location"] as const;
    return {
      fields: keys.map((key) => ({ key, label: t(`import.confirm.${key}`), value: cv.basics[key] })),
      apply: (v) => (c) => ({ ...c, basics: { ...c.basics, email: v.email!.trim(), phone: v.phone!.trim(), location: v.location!.trim() } }),
    };
  }
  if (topic === "languages") {
    return {
      fields: cv.languages.map((l) => ({ key: l.id, label: t("import.confirm.level", { name: l.name }), value: l.level })),
      apply: (v) => (c) => ({ ...c, languages: c.languages.map((l) => (l.id in v ? { ...l, level: v[l.id]!.trim() } : l)) }),
    };
  }
  return {
    fields: cv.certifications.flatMap((cert) => [
      { key: `${cert.id}/name`, label: t("import.confirm.certName"), value: cert.name },
      { key: `${cert.id}/issuer`, label: t("import.confirm.issuer"), value: cert.issuer },
      { key: `${cert.id}/date`, label: t("import.confirm.date"), value: cert.date, date: true },
    ]),
    apply: (v) => (c) => ({
      ...c,
      certifications: c.certifications.map((cert) => ({
        ...cert,
        name: (v[`${cert.id}/name`] ?? cert.name).trim(),
        issuer: (v[`${cert.id}/issuer`] ?? cert.issuer).trim(),
        date: (v[`${cert.id}/date`] ?? cert.date).trim(),
      })),
    }),
  };
}

function ConfirmForm(props: { topic: ConfirmTopic; cv: CvContent; onSave(change: (cv: CvContent) => CvContent): void; onCancel(): void }) {
  const { fields, apply } = fieldsFor(props.topic, props.cv);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const badDate = fields.some((f) => f.date && !DATE.test(values[f.key]!.trim()));
  return (
    <form className="import-confirm-form" onSubmit={(e) => {
      e.preventDefault();
      if (!badDate) props.onSave(apply(values));
    }}>
      {fields.map((f) => (
        <label key={f.key}>
          <span className="ui-label">{f.label}</span>
          <input className="ui-input" value={values[f.key]} maxLength={200} aria-invalid={f.date && !DATE.test(values[f.key]!.trim()) || undefined}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
        </label>
      ))}
      {fields.some((f) => f.date) && <p className={badDate ? "ui-small import-confirm-bad" : "ui-small ui-muted"} role={badDate ? "alert" : undefined}>{t("import.confirm.dateHint")}</p>}
      <div className="ui-row">
        <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={props.onCancel}>{t("import.confirm.cancel")}</button>
        <button type="submit" className="ui-btn ui-btn--primary ui-btn--sm" disabled={badDate}>{t("import.confirm.save")}</button>
      </div>
    </form>
  );
}
