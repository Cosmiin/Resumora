import { useEffect, useRef, useState } from "react";
import type { CvContent, TailoredCv } from "@resumora/shared";
import { CvDocument } from "../cv/page/CvDocument.tsx";
import type { TemplateId } from "../cv/page/templates.ts";
import { t } from "../i18n/t.ts";
import { ApiClientError } from "../lib/api-error.ts";
import { getTailored, reviewItem, type ReviewDecision } from "./tailored-api.ts";

type ItemReview = { kept?: boolean; inferred?: boolean; reviewed?: boolean; text?: string; reason?: string };
type Guess = { section: string; key: string; text: string; reason?: string };

/** The CV's order of the tailored sections, so the review walks down the page. */
const ORDER = ["summary", "experience", "skills", "achievements", "languages"];

/** The AI guesses nobody has checked yet: kept inferred items not reviewed (the same rule as the export warning). */
export function guessesOf(review: TailoredCv["review"]): Guess[] {
  const rank = (section: string) => (ORDER.includes(section) ? ORDER.indexOf(section) : ORDER.length);
  return Object.entries(review ?? {}).sort(([a], [b]) => rank(a) - rank(b)).flatMap(([section, items]) =>
    !items || typeof items !== "object" ? [] : Object.entries(items as Record<string, ItemReview>)
      .filter(([, item]) => item?.kept && item.inferred && !item.reviewed)
      .map(([key, item]) => ({ section, key, text: item.text ?? "", reason: item.reason })));
}

/** The page item a guess glows on: the summary for its phrases, an added skill by its name. */
function targetOf(guess: Guess, content: CvContent): string {
  if (guess.key === "summary" || guess.key.startsWith("summary#")) return "summary";
  if (!guess.key.startsWith("new-skill:")) return guess.key;
  const name = guess.text.trim().toLowerCase();
  return [...content.technicalSkills, ...content.professionalSkills].find((s) => s.name.trim().toLowerCase() === name)?.id ?? guess.key;
}

type Props = { load(): Promise<TailoredCv>; template: TemplateId; onClose(): void; onExport(): void };

/**
 * GuideA: one AI guess at a time, in place on the CV. The page dims, the guess glows, and a small card
 * says why the AI guessed it, with Keep / Edit / Remove ("AI guess · 2 of 4"). Stop leaves; at the end, "All checked ✓".
 */
export function GuidedReview({ load, template, onClose, onExport }: Props) {
  const [row, setRow] = useState<TailoredCv | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"stale" | "changed" | "failed" | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load().then((loaded) => { setRow(loaded); setTotal(guessesOf(loaded.review).length); }, () => setError("failed"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const left = row ? guessesOf(row.review) : [];
  const current = left[0];
  const focus = row && current ? targetOf(current, row.content) : undefined;
  useEffect(() => { page.current?.querySelector(".cv-mark-focus")?.scrollIntoView?.({ block: "center", behavior: "smooth" }); }, [focus]);

  async function decide(action: ReviewDecision["action"], text?: string) {
    if (!row || !current || busy) return;
    setBusy(true);
    setError(null);
    try {
      setRow(await reviewItem(row.id, { section: current.section, key: current.key, action, ...(text !== undefined ? { text } : {}), version: row.version }));
      setDraft(null);
    } catch (cause) {
      // Saved somewhere else first (the editor's autosave, another tab): reload the CV and stay on this guess.
      if (cause instanceof ApiClientError && cause.code === "version_conflict") {
        try { setRow(await getTailored(row.id)); setError("stale"); } catch { setError("failed"); }
      } else setError(cause instanceof ApiClientError && cause.code === "item_changed" ? "changed" : "failed");
    } finally { setBusy(false); }
  }

  let card: React.ReactNode;
  if (!row) card = error ? <p role="alert">{t("tailor.guide.failed")}</p> : <p role="status">{t("tailor.loading")}</p>;
  else if (!current) {
    card = <>
      <p className="guide-done">{t("tailor.guide.done")}</p>
      <div className="fm-foot">
        <button type="button" className="fm-ghost" onClick={onClose}>{t("tailor.guide.back")}</button>
        <button type="button" className="fm-btn" onClick={onExport}>{t("tailor.guide.export")}</button>
      </div>
    </>;
  } else {
    card = <>
      <p className="guide-count">{t("tailor.guide.count", { n: total - left.length + 1, total: Math.max(total, left.length) })}</p>
      <p><q>{current.text}</q></p>
      {current.reason && <p className="tailor-reason">{current.reason}</p>}
      {error && <p role="alert" className="form-error">{t(error === "stale" ? "tailor.guide.stale" : error === "changed" ? "tailor.guide.changed" : "tailor.guide.failed")}</p>}
      {draft !== null ? <form className="tailor-item-actions" onSubmit={(event) => { event.preventDefault(); void decide("edit", draft.trim()); }}>
        <input aria-label={t("tailor.guide.editLabel")} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" className="secondary" disabled={busy || !draft.trim()}>{t("tailor.summaryReview.save")}</button>
      </form> : <div className="tailor-item-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => void decide("keep")}>{t("tailor.review.keep")}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setDraft(current.text)}>{t("tailor.summaryReview.edit")}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => void decide("remove")}>{t("tailor.review.remove")}</button>
      </div>}
      <button type="button" className="fm-ghost" onClick={onClose}>{t("tailor.guide.stop")}</button>
    </>;
  }

  return <div className="guide">
    <div ref={page} className="guide-page">{row && <CvDocument content={row.content} template={template} focus={focus} />}</div>
    <aside className="guide-card" aria-label={t("tailor.guide.title")}>{card}</aside>
  </div>;
}
