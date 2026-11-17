import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import type { LineList } from "../edit/lists.ts";
import { AchievementsPick } from "./AchievementsPick.tsx";
import { suggestAchievements } from "./enrich-api.ts";
import { FocusBar } from "./FocusBar.tsx";
import { LightStop } from "./FocusMode.tsx";

/** A full-screen step that isn't a role: the top bar, then one thing in the middle. Esc closes too. */
export function PathScreen({ context, onClose, children }: { context: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="ui-page focus-mode fm-path" role="dialog" aria-modal="true" aria-label={t("enrich.path.dialog")}>
      <FocusBar context={context} onClose={onClose} />
      <section className="fm-path-start">
        {children}
      </section>
    </div>,
    document.body,
  );
}

/** Asks for Key achievements suggestions from the saved CV; none (or a failure) ends with nothing chosen. */
export function AchievementsStop({ cv, waitForSave, onDone }: { cv: CvContent; waitForSave(): Promise<void>; onDone(texts: string[], failed: boolean): void }) {
  const [suggestions, setSuggestions] = useState<{ id: string; text: string; roleId: string }[] | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    let alive = true;
    void (async () => {
      let found: { text: string; roleId: string }[] = [];
      let failed = false;
      try {
        await waitForSave();
        found = (await suggestAchievements()).suggestions;
      } catch { failed = true; }
      if (!alive) return;
      if (!found.length) done.current([], failed);
      else setSuggestions(found.map((s, i) => ({ ...s, id: String(i) })));
    })();
    return () => { alive = false; };
  }, [waitForSave]);
  if (!suggestions) {
    return (
      <div className="fm-working" role="status">
        <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
        <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.achievements.loading")}</h2>
      </div>
    );
  }
  return <AchievementsPick suggestions={suggestions} roles={cv.experience} onDone={(texts) => done.current(texts, false)} />;
}

type Props = { cv: CvContent; dispatch(a: CvAction): void; waitForSave(): Promise<void> };

/** "Suggest" in the Key achievements section: suggestions from the roles, the ticked ones added. */
export function AchievementsSuggest({ cv, dispatch, waitForSave }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="box">
      <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setNote(null); setOpen(true); }}>{t("enrich.path.suggest")}</button>
      {note && <p className="fine" role="status">{note}</p>}
      {open && (
        <PathScreen context={t("enrich.path.achievements")} onClose={() => setOpen(false)}>
          <AchievementsStop cv={cv} waitForSave={waitForSave} onDone={(texts, failed) => {
            if (texts.length) dispatch({ type: "addAchievements", texts });
            else setNote(t(failed ? "enrich.path.suggestFailed" : "enrich.path.suggestNone"));
            setOpen(false);
          }} />
        </PathScreen>
      )}
    </div>
  );
}

/** "Suggest lines" under one course, award, publication or interest: the "Tell us about…" box for that item. */
export function LightSuggest({ cv, dispatch, waitForSave, section, itemId }: Props & { section: LineList; itemId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="box">
      <button type="button" className="ui-btn ui-btn--sm" onClick={() => setOpen(true)}>{t("enrich.path.suggestLines")}</button>
      {open && (
        <LightStop section={section} itemId={itemId} cv={cv} dispatch={dispatch} waitForSave={waitForSave}
          onClose={() => setOpen(false)} onNext={() => setOpen(false)} />
      )}
    </div>
  );
}
