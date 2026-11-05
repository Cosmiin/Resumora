import { useEffect, useRef, useState } from "react";
import { skillsChecklist, type CvContent, type SkillGroup } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { Checklist } from "./Checklist.tsx";
import { getSkillSuggestions, type SkillsAnswer } from "./enrich-api.ts";

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  /** Resolves once autosave has saved the latest edits (the server reads the saved CV). */
  waitForSave(): Promise<void>;
};

type Ask = { status: "idle" } | { status: "loading" } | { status: "failed" } | { status: "ready"; answer: SkillsAnswer };
type Shown = "suggest" | "sort";

const groupLabel = (g: SkillGroup) => t(g === "technicalSkills" ? "enrich.skills.technical" : "enrich.skills.professional");
const arrowLabel = (g: SkillGroup) => t(g === "technicalSkills" ? "enrich.skills.toTechnical" : "enrich.skills.toProfessional");

/** Suggestions from the person's own roles: each with the line it came from and "Add". */
function Suggestions({ cv, answer, dispatch }: { cv: CvContent; answer: SkillsAnswer; dispatch(a: CvAction): void }) {
  const listed = (name: string) =>
    [...cv.technicalSkills, ...cv.professionalSkills, ...cv.unclearSkills].some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (answer.suggestions.length === 0) return <p className="review-note">{t("enrich.skills.noSuggestions")}</p>;
  return (
    <>
      <p className="fine">{t("enrich.skills.suggestNote")}</p>
      {answer.suggestions.map((s) => {
        const done = listed(s.name);
        return (
          <div className="sugg" key={s.name}>
            <span>
              <b>{s.name}</b>
              <span className="grp">{groupLabel(s.group)}</span>
            </span>
            <button
              type="button"
              className="btn small"
              disabled={done}
              aria-label={done ? undefined : t("enrich.skills.addLabel", { name: s.name })}
              onClick={() => dispatch({ type: "addSkill", group: s.group, name: s.name })}
            >
              {done ? t("enrich.skills.added") : t("enrich.skills.add")}
            </button>
            <span className="ev">“{s.evidence}”</span>
          </div>
        );
      })}
    </>
  );
}

/** A group for each skill still to sort. All start ticked; Apply moves the ticked ones as one change. */
function SortProposals({ cv, answer, dispatch }: { cv: CvContent; answer: SkillsAnswer; dispatch(a: CvAction): void }) {
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [applied, setApplied] = useState(false);
  const rows = answer.sort.flatMap((m) => {
    const skill = cv.unclearSkills.find((s) => s.id === m.skillId);
    return skill ? [{ ...m, name: skill.name }] : [];
  });
  if (rows.length === 0) {
    return applied ? (
      <p className="saved-note" role="status">
        {t("enrich.skills.sorted")}
      </p>
    ) : (
      <p className="review-note">{t("enrich.skills.noSort")}</p>
    );
  }
  const chosen = rows.filter((r) => !unticked.has(r.skillId));
  const toggle = (id: string) =>
    setUnticked((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <>
      {rows.map((r) => (
        <label className="sugg sort-pick" key={r.skillId}>
          <input type="checkbox" checked={!unticked.has(r.skillId)} onChange={() => toggle(r.skillId)} />
          <span>
            <b>{r.name}</b>
            <span className="grp">{arrowLabel(r.group)}</span>
          </span>
        </label>
      ))}
      <div className="row-btns">
        <button
          type="button"
          className="btn small primary"
          disabled={chosen.length === 0}
          onClick={() => {
            dispatch({ type: "moveSkills", moves: chosen.map((r) => ({ skillId: r.skillId, group: r.group })) });
            setApplied(true);
          }}
        >
          {t("enrich.skills.apply")}
        </button>
      </div>
    </>
  );
}

/** The Skills section's checklist, "Suggest skills from my experience" and "Sort for me". */
export function SkillsTools({ cv, dispatch, waitForSave }: Props) {
  const [ask, setAsk] = useState<Ask>({ status: "idle" });
  const [shown, setShown] = useState<Shown | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** One request answers both buttons; the second button reuses the first answer. */
  const open = async (which: Shown, fresh = false) => {
    setShown(which);
    if (ask.status === "ready" && !fresh) return;
    setAsk({ status: "loading" });
    try {
      await waitForSave();
      const answer = await getSkillSuggestions();
      if (alive.current) setAsk({ status: "ready", answer });
    } catch {
      if (alive.current) setAsk({ status: "failed" });
    }
  };

  const items = skillsChecklist(cv).map((c) =>
    c.key === "nothingToSort"
      ? { key: c.key, ok: c.ok, label: t("enrich.skills.nothingToSort"), fix: t("enrich.skills.nothingToSortFix", { n: cv.unclearSkills.length }) }
      : { key: c.key, ok: c.ok, label: t("enrich.skills.toolsListed"), fix: t("enrich.skills.toolsListedFix", { names: (c.missing ?? []).join(", ") }) },
  );
  const busy = ask.status === "loading";
  return (
    <div className="box">
      <p className="p-sub">{t("enrich.checklist")}</p>
      <Checklist items={items} />
      <div className="row-btns">
        <button type="button" className="btn small primary" disabled={busy} onClick={() => void open("suggest")}>
          {t("enrich.skills.suggest")}
        </button>
        <button type="button" className="btn small" disabled={busy} onClick={() => void open("sort")}>
          {t("enrich.skills.sort")}
        </button>
      </div>
      {busy && (
        <p className="working" role="status">
          {t("enrich.skills.reading")}
        </p>
      )}
      {ask.status === "failed" && (
        <p className="review-note" role="alert">
          {t("enrich.skills.failed")}{" "}
          <button type="button" className="link" onClick={() => void open(shown ?? "suggest", true)}>
            {t("enrich.skills.tryAgain")}
          </button>
        </p>
      )}
      {ask.status === "ready" && shown === "suggest" && <Suggestions cv={cv} answer={ask.answer} dispatch={dispatch} />}
      {ask.status === "ready" && shown === "sort" && <SortProposals cv={cv} answer={ask.answer} dispatch={dispatch} />}
    </div>
  );
}
