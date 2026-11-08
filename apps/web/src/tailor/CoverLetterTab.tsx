import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CoverLetter, Job, TailoredCv } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { LetterPage } from "./LetterPage.tsx";
import { useDictation } from "./SteeringStep.tsx";
import { saveLetter, writeLetter, type LetterFlags } from "./tailored-api.ts";

const SAVE_DELAY = 800;

type Props = {
  cv: TailoredCv;
  job: Job | undefined;
  /** The newest letter (kept by the page, so switching tabs doesn't lose it). */
  letter: CoverLetter | null;
  onLetter(letter: CoverLetter): void;
  today?: Date;
};
type Save = "idle" | "saving" | "saved" | "error";

/** The cover letter tab: the letter as a page on the left, its options on the right. */
export function CoverLetterTab({ cv, job, letter, onLetter, today = new Date() }: Props) {
  const role = job?.extracted?.title ?? "";
  const company = job?.extracted?.company ?? "";
  const [whyCompany, setWhyCompany] = useState(letter?.whyCompany ?? "");
  const [hiringManager, setHiringManager] = useState(letter?.hiringManager ?? "");
  const [body, setBody] = useState(letter?.body ?? "");
  const [flags, setFlags] = useState<LetterFlags>([]);
  const [writing, setWriting] = useState<"idle" | "busy" | "error">("idle");
  const [confirming, setConfirming] = useState(false);
  const [save, setSave] = useState<Save>("idle");
  const { mic, partial } = useDictation((words) => {
    setWhyCompany((text) => [text.trimEnd(), words].filter(Boolean).join(" ").slice(0, 1000));
    if (letter) schedule();
  });

  // Autosave: one save at a time, always of the newest text; a pending save still runs when the tab closes.
  const latest = useRef({ body, hiringManager, whyCompany, onLetter });
  useLayoutEffect(() => { latest.current = { body, hiringManager, whyCompany, onLetter }; });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<{ busy: boolean; again: boolean }>({ busy: false, again: false });
  async function flush() {
    timer.current = null;
    if (saving.current.busy) { saving.current.again = true; return; }
    saving.current.busy = true;
    setSave("saving");
    const { body: text, hiringManager: manager, whyCompany: why, onLetter: report } = latest.current;
    try {
      const { coverLetter } = await saveLetter(cv.id, { body: text, hiringManager: manager.trim(), whyCompany: why.trim() });
      report(coverLetter);
      setSave("saved");
    } catch {
      setSave("error");
    } finally {
      saving.current.busy = false;
      if (saving.current.again) { saving.current.again = false; void flush(); }
    }
  }
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  };
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); void flush(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function write() {
    setConfirming(false);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setWriting("busy");
    try {
      const result = await writeLetter(cv.id, { whyCompany: whyCompany.trim(), hiringManager: hiringManager.trim() });
      setBody(result.coverLetter.body);
      setFlags(result.flags);
      setSave("idle");
      setWriting("idle");
      onLetter(result.coverLetter);
    } catch {
      setWriting("error");
    }
  }

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (letter) schedule();
  };
  const pageBody = letter
    ? <textarea className="letter-body" aria-label={t("letter.body")} value={body} maxLength={4000}
        rows={Math.max(12, body.split("\n").length + 2)} onChange={(event) => edit(setBody)(event.target.value)} />
    : <p className="letter-empty">{t("letter.empty")}</p>;

  return (
    <div className="letter-tab">
      <LetterPage basics={cv.content.basics} locale={cv.language} role={role} company={company}
        hiringManager={hiringManager} date={today} body={pageBody} />
      <aside className="letter-side" aria-label={t("letter.side")}>
        <label htmlFor="letter-why">{company ? t("letter.why", { company }) : t("letter.whyAny")}</label>
        <div className="tailor-field">
          <textarea id="letter-why" rows={3} maxLength={1000} value={whyCompany}
            onChange={(event) => edit(setWhyCompany)(event.target.value)} />
          {mic}
        </div>
        {partial && <p aria-live="polite">{partial}</p>}
        <label htmlFor="letter-manager">{t("letter.manager")}</label>
        <input id="letter-manager" maxLength={120} value={hiringManager} onChange={(event) => edit(setHiringManager)(event.target.value)} />
        {job?.userThoughts?.trim() && <p className="letter-thoughts">{t("letter.thoughts")}</p>}
        {!letter ? (
          <button type="button" className="primary" disabled={writing === "busy"} onClick={() => void write()}>
            {t(writing === "busy" ? "letter.writing" : "letter.write")}
          </button>
        ) : confirming ? (
          <div className="letter-confirm" role="alert">
            <p>{t("letter.replaceWarning")}</p>
            <button type="button" className="primary" onClick={() => void write()}>{t("letter.replace")}</button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>{t("letter.cancel")}</button>
          </div>
        ) : (
          <button type="button" className="secondary" disabled={writing === "busy"} onClick={() => setConfirming(true)}>
            {t(writing === "busy" ? "letter.writing" : "letter.regenerate")}
          </button>
        )}
        {writing === "error" && <p role="alert" className="form-error">{t("letter.error")}</p>}
        {flags.length > 0 && (
          <div className="letter-flags" role="status">
            <p className="tailor-eyebrow">{t("letter.flags")}</p>
            <ul>{flags.map((flag, i) => <li key={i}>{flag.detail}</li>)}</ul>
          </div>
        )}
        {save !== "idle" && <p className={save === "error" ? "form-error" : "letter-saved"} role="status">
          {t(save === "saving" ? "letter.saving" : save === "saved" ? "letter.saved" : "letter.saveError")}
        </p>}
      </aside>
    </div>
  );
}
