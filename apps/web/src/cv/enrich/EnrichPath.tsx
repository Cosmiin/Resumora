import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { newId, type CvContent, type SkillGroup } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { AchievementsPick } from "./AchievementsPick.tsx";
import { getSkillSuggestions, suggestAchievements } from "./enrich-api.ts";
import { SkillsNotice } from "./SkillsNotice.tsx";
import { FocusMode } from "./FocusMode.tsx";
import { PathStart } from "./PathStart.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  scores: Map<string, RoleScoreState>;
  waitForSave(): Promise<void>;
  onClose(): void;
};

/** The path's score line: a role counts as done at 80. One still being scored (or with no score) is below. */
export const ENRICHED_AT = 80;
export function belowTarget(s: RoleScoreState | undefined): boolean {
  return !(s?.state === "ready" && s.result?.score != null && s.result.score >= ENRICHED_AT);
}

type Stage = { kind: "start" } | { kind: "role"; index: number } | { kind: "achievements" } | { kind: "skills" } | { kind: "end" };

/** The top bar across the whole path: where you are, and one segment per stop. */
export function PathBar({ label, at, total }: { label: string; at: number; total: number }) {
  return (
    <div className="fm-path-bar">
      <p className="fm-eyebrow">{label}</p>
      <div className="fm-path-segments" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <i key={i} className={i < at ? "is-done" : i === at ? "is-on" : undefined} />)}
      </div>
    </div>
  );
}

/**
 * 1A: one guided path through the CV. The roles below 80 (fixed when the path opens, in CV order), each in its
 * own focus session, then Key achievements, Skills and the end. ✕ closes it; opening it again starts from the
 * roles still below 80, so finished roles drop out by themselves.
 */
export function EnrichPath({ cv, dispatch, scores, waitForSave, onClose }: Props) {
  const [stops] = useState(() => cv.experience.filter((r) => belowTarget(scores.get(r.id))).map((r) => r.id));
  const [stage, setStage] = useState<Stage>({ kind: "start" });
  // Roles, then Key achievements and Skills.
  const total = stops.length + 2;
  const roles = stops.map((id) => cv.experience.find((r) => r.id === id)).filter((r) => r !== undefined);
  const afterRoles = () => setStage({ kind: "achievements" });
  // 5A: the skills the path added, so Undo removes exactly those.
  const [skills, setSkills] = useState<{ ids: string[]; names: string[]; undone: boolean }>({ ids: [], names: [], undone: false });

  if (stage.kind === "start") {
    return <PathStart roles={roles} scores={scores} onNotNow={onClose}
      onStart={() => (stops.length ? setStage({ kind: "role", index: 0 }) : afterRoles())} />;
  }
  if (stage.kind === "role") {
    const roleId = stops[stage.index]!;
    const last = stage.index === stops.length - 1;
    return (
      <FocusMode
        key={roleId}
        target={{ roleId, mode: "improve" }}
        cv={cv}
        dispatch={dispatch}
        scores={scores}
        waitForSave={waitForSave}
        onClose={onClose}
        topBar={<PathBar label={t("enrich.path.roleOf", { n: stage.index + 1, total: stops.length })} at={stage.index} total={total} />}
        next={{
          label: t(last ? "enrich.focus.continue" : "enrich.path.nextRole"),
          onNext: () => (last ? afterRoles() : setStage({ kind: "role", index: stage.index + 1 })),
        }}
      />
    );
  }
  if (stage.kind === "achievements") {
    return (
      <PathScreen bar={<PathBar label={t("enrich.path.achievements")} at={stops.length} total={total} />} onClose={onClose}>
        <AchievementsStop cv={cv} waitForSave={waitForSave} onDone={(texts) => {
          if (texts.length) dispatch({ type: "addAchievements", texts });
          setStage({ kind: "skills" });
        }} />
      </PathScreen>
    );
  }
  if (stage.kind === "skills") {
    return (
      <PathScreen bar={<PathBar label={t("enrich.path.skills")} at={stops.length + 1} total={total} />} onClose={onClose}>
        <SkillsStop waitForSave={waitForSave} onDone={(added) => {
          if (added.length) dispatch({ type: "addSkills", skills: added });
          setSkills({ ids: added.map((s) => s.id), names: added.map((s) => s.name), undone: false });
          setStage({ kind: "end" });
        }} />
      </PathScreen>
    );
  }
  const notice = <SkillsNotice names={skills.names} undone={skills.undone} onUndo={() => {
    dispatch({ type: "removeSkills", ids: skills.ids });
    setSkills((s) => ({ ...s, undone: true }));
  }} />;
  return (
    <PathScreen bar={<PathBar label={t("enrich.path.skills")} at={total} total={total} />} onClose={onClose}>
      {notice}
      <div className="fm-foot">
        <button type="button" className="fm-btn" onClick={onClose}>{t("enrich.focus.done.back")}</button>
      </div>
    </PathScreen>
  );
}

/** A full-screen step of the path that isn't a role: the path bar, then one thing in the middle. Esc and ✕ close. */
function PathScreen({ bar, onClose, children }: { bar: ReactNode; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="focus-mode fm-path" role="dialog" aria-modal="true" aria-label={t("enrich.path.dialog")}>
      {bar}
      <section className="fm-path-start">
        <button type="button" className="fm-close" onClick={onClose}>
          <span aria-hidden="true">✕</span> {t("enrich.focus.close")}
        </button>
        {children}
      </section>
    </div>,
    document.body,
  );
}

/** 4A: asks for suggestions from the saved CV; none (or a failure) moves straight on. */
function AchievementsStop({ cv, waitForSave, onDone }: { cv: CvContent; waitForSave(): Promise<void>; onDone(texts: string[]): void }) {
  const [suggestions, setSuggestions] = useState<{ id: string; text: string; roleId: string }[] | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    let alive = true;
    void (async () => {
      let found: { text: string; roleId: string }[] = [];
      try {
        await waitForSave();
        found = (await suggestAchievements()).suggestions;
      } catch { /* No suggestions this time: the step is skipped. */ }
      if (!alive) return;
      if (!found.length) done.current([]);
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
  return <AchievementsPick suggestions={suggestions} roles={cv.experience} onDone={(texts) => done.current(texts)} />;
}

/** 5A: adds every skill the roles show (no screen of its own); none, or a failure, adds nothing. */
function SkillsStop({ waitForSave, onDone }: { waitForSave(): Promise<void>; onDone(added: { id: string; name: string; group: SkillGroup }[]): void }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    let alive = true;
    void (async () => {
      let found: { id: string; name: string; group: SkillGroup }[] = [];
      try {
        await waitForSave();
        found = (await getSkillSuggestions()).suggestions.map((s) => ({ id: newId(), name: s.name, group: s.group }));
      } catch { /* Nothing added this time. */ }
      if (alive) done.current(found);
    })();
    return () => { alive = false; };
  }, [waitForSave]);
  return (
    <div className="fm-working" role="status">
      <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
      <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.skills.noticeWorking")}</h2>
    </div>
  );
}
