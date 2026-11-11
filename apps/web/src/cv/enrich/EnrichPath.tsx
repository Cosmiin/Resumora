import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LIGHT_SECTIONS, findScored, newId, scoredItems, type CvContent, type LightSection, type ScoredKind, type SkillGroup } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { AchievementsPick } from "./AchievementsPick.tsx";
import { getSkillSuggestions, suggestAchievements } from "./enrich-api.ts";
import { SkillsNotice } from "./SkillsNotice.tsx";
import { ENRICHED_AVERAGE, EnrichedScreen, type RoleRow } from "./EnrichedScreen.tsx";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { useNavigate } from "react-router";
import { FocusBar } from "./FocusBar.tsx";
import { FocusMode, LightStop } from "./FocusMode.tsx";
import { getLanguage } from "../../i18n/language.ts";
import { issueTip } from "./tips.ts";
import { PathStart } from "./PathStart.tsx";
import { SCORED_LIST, type LineList } from "../edit/lists.ts";
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


/** Q3: the lighter items the path visits are the ones with no lines yet, section by section. */
export function lightStops(cv: CvContent): { section: LineList; itemId: string }[] {
  return LIGHT_SECTIONS.flatMap((section) => (cv[section] as { id: string; bullets?: { text: string }[] }[])
    .filter((item) => !(item.bullets ?? []).some((b) => b.text.trim() !== ""))
    .map((item) => ({ section, itemId: item.id })));
}

const OF_KEY = { role: "enrich.path.roleOf", project: "enrich.path.projectOf", volunteering: "enrich.path.volunteeringOf" } as const satisfies Record<ScoredKind, string>;

type Stage = { kind: "start" } | { kind: "role"; index: number } | { kind: "light"; index: number } | { kind: "achievements" } | { kind: "skills" } | { kind: "end" } | { kind: "improve"; roleId: string };

/**
 * One guided path through the CV. It opens on the focus step: the roles, projects and volunteering below 80 are
 * offered, the person ticks the ones to work on and may say what the CV should bring out. Each ticked one gets its
 * own focus session (in CV order), then one stop per lighter item with no lines yet, then Key achievements,
 * Skills and the result. "Save and exit" closes it; opening it again offers the roles still below 80.
 */
export function EnrichPath({ cv, dispatch, scores, waitForSave, onClose }: Props) {
  // The roles below 80 and each role's score are read live on the start screen (stored scores may still be
  // loading, e.g. from "/cv?enrich=1") and fixed when the path starts.
  // Roles, then projects, then volunteering (CV order within each), each below 80.
  const below = scoredItems(cv).filter(({ item }) => belowTarget(scores.get(item.id))).map(({ item }) => item.id);
  const light = lightStops(cv);
  const [fixed, setFixed] = useState<{ stops: string[]; lights: typeof light; before: Map<string, number | null>; focus: string } | null>(null);
  const stops = fixed?.stops ?? below;
  const lights = fixed?.lights ?? light;
  const before = fixed?.before ?? new Map<string, number | null>();
  const [stage, setStage] = useState<Stage>({ kind: "start" });
  // The focus step lists every role, strong or not, so the list never shrinks while scores arrive.
  const items = scoredItems(cv).map((p) => {
    const s = scores.get(p.item.id);
    return { ...p, score: scoreOf(s), scoring: s?.state === "scoring", strong: !belowTarget(s) };
  });
  const quick = LIGHT_SECTIONS.map((section) => ({ section, count: light.filter((l) => l.section === section).length })).filter((q) => q.count > 0);
  const afterRoles = () => setStage(lights.length ? { kind: "light", index: 0 } : { kind: "achievements" });
  // 5A: the skills the path added, so Undo removes exactly those.
  const [skills, setSkills] = useState<{ ids: string[]; names: string[]; undone: boolean }>({ ids: [], names: [], undone: false });
  // 6B: how many Key achievements the path added.
  const [achievementsAdded, setAchievementsAdded] = useState(0);

  if (stage.kind === "start") {
    return <PathStart items={items} quick={quick} locale={cv.locale} speech={getLanguage()} onNotNow={onClose}
      onStart={(chosen, focus) => {
        setFixed({ stops: chosen, lights: light, focus, before: new Map(scoredItems(cv).map(({ item }) => [item.id, scoreOf(scores.get(item.id))])) });
        if (chosen.length) setStage({ kind: "role", index: 0 });
        else setStage(light.length ? { kind: "light", index: 0 } : { kind: "achievements" });
      }} />;
  }
  if (stage.kind === "role") {
    const roleId = stops[stage.index]!;
    const last = stage.index === stops.length - 1;
    const kind = findScored(cv, roleId)?.kind ?? "role";
    const ofKind = stops.filter((id) => findScored(cv, id)?.kind === kind);
    const nextKind = last ? null : findScored(cv, stops[stage.index + 1]!)?.kind;
    return (
      <FocusMode
        key={roleId}
        target={{ roleId, mode: "improve" }}
        cv={cv}
        dispatch={dispatch}
        scores={scores}
        waitForSave={waitForSave}
        onClose={onClose}
        focus={fixed?.focus || undefined}
        context={t(OF_KEY[kind], { n: ofKind.indexOf(roleId) + 1, total: ofKind.length })}
        next={{
          label: t(last ? "enrich.focus.continue" : nextKind === "role" ? "enrich.path.nextRole" : "enrich.path.next"),
          onNext: () => (last ? afterRoles() : setStage({ kind: "role", index: stage.index + 1 })),
        }}
      />
    );
  }
  if (stage.kind === "light") {
    const stop = lights[stage.index]!;
    const ofSection = lights.filter((l) => l.section === stop.section);
    const onNext = () => setStage(stage.index + 1 < lights.length ? { kind: "light", index: stage.index + 1 } : { kind: "achievements" });
    return (
      <LightStop key={`${stop.section}:${stop.itemId}`} section={stop.section} itemId={stop.itemId} cv={cv} dispatch={dispatch} waitForSave={waitForSave}
        onClose={onClose} onNext={onNext}
        context={t("enrich.path.lightOf", { section: t(`enrich.path.section.${stop.section}`), n: ofSection.indexOf(stop) + 1, total: ofSection.length })} />
    );
  }
  if (stage.kind === "achievements") {
    return (
      <PathScreen context={t("enrich.path.achievements")} onClose={onClose}>
        <AchievementsStop cv={cv} waitForSave={waitForSave} onDone={(texts) => {
          if (texts.length) dispatch({ type: "addAchievements", texts });
          setAchievementsAdded(texts.length);
          setStage({ kind: "skills" });
        }} />
      </PathScreen>
    );
  }
  if (stage.kind === "skills") {
    return (
      <PathScreen context={t("enrich.path.skills")} onClose={onClose}>
        <SkillsStop waitForSave={waitForSave} onDone={(added) => {
          if (added.length) dispatch({ type: "addSkills", skills: added });
          setSkills({ ids: added.map((s) => s.id), names: added.map((s) => s.name), undone: false });
          setStage({ kind: "end" });
        }} />
      </PathScreen>
    );
  }
  if (stage.kind === "improve") {
    return (
      <FocusMode key={`improve:${stage.roleId}`} target={{ roleId: stage.roleId, mode: "improve" }} cv={cv} dispatch={dispatch} scores={scores}
        waitForSave={waitForSave} onClose={onClose} next={{ label: t("enrich.focus.continue"), onNext: () => setStage({ kind: "end" }) }} />
    );
  }
  const notice = <SkillsNotice names={skills.names} undone={skills.undone} onUndo={() => {
    dispatch({ type: "removeSkills", ids: skills.ids });
    setSkills((s) => ({ ...s, undone: true }));
  }} />;
  return (
    <PathScreen context={t("enrich.path.result")} onClose={onClose}>
      <EndStop cv={cv} scores={scores} waitForSave={waitForSave} before={before} stops={stops} lights={lights} achievementsAdded={achievementsAdded}
        skillsAdded={skills.undone ? 0 : skills.names.length} notice={notice} dispatch={dispatch} onClose={onClose}
        onImprove={(roleId) => {
          // The role now counts as worked on, so the result shows how far it moved.
          setFixed((f) => (f && !f.stops.includes(roleId) ? { ...f, stops: [...f.stops, roleId] } : f));
          setStage({ kind: "improve", roleId });
        }} />
    </PathScreen>
  );
}

/**
 * The CV's strength: the average of every score given (roles, projects and volunteering with a score), rounded;
 * null when none has one. With weights, a recent role counts more than the rest.
 */
export function averageScore(scores: ReadonlyMap<string, number | null>, weights?: ReadonlyMap<string, number>): number | null {
  let sum = 0;
  let total = 0;
  for (const [id, n] of scores) {
    if (n === null) continue;
    const w = weights?.get(id) ?? 1;
    sum += n * w;
    total += w;
  }
  return total ? Math.round(sum / total) : null;
}

/** How much each role counts in the CV's strength: the most recent role 3 times, the one before it twice, the rest once. */
export function strengthWeights(cv: Pick<CvContent, "experience">): ReadonlyMap<string, number> {
  return new Map(cv.experience.map((role, i) => [role.id, i === 0 ? 3 : i === 1 ? 2 : 1]));
}
const scoreOf = (s: RoleScoreState | undefined) => (s && s.state !== "none" ? (s.result?.score ?? null) : null);

/** Waits for the last scores, then shows the result. An average of 80 or more marks the CV as enriched (saved once). */
function EndStop({ cv, scores, waitForSave, before, stops, lights, achievementsAdded, skillsAdded, notice, dispatch, onClose, onImprove }: {
  cv: CvContent; scores: ReadonlyMap<string, RoleScoreState>; waitForSave(): Promise<void>; before: ReadonlyMap<string, number | null>; stops: string[];
  lights: { section: LightSection; itemId: string }[]; achievementsAdded: number; skillsAdded: number; notice: ReactNode; dispatch(a: CvAction): void; onClose(): void; onImprove(roleId: string): void;
}) {
  const navigate = useNavigate();
  // Q1: every scored item counts (projects and volunteering only when the CV has them). One still being scored
  // (or waiting for it) would give a wrong average: wait for it.
  const scored = scoredItems(cv);
  const settled = scored.every(({ item }) => !["scoring", "previous"].includes(scores.get(item.id)?.state ?? ""));
  const now = new Map(scored.map(({ item }) => [item.id, scoreOf(scores.get(item.id))]));
  const weights = strengthWeights(cv);
  const average = averageScore(now, weights) ?? 0;
  const enriched = settled && average >= ENRICHED_AVERAGE;
  useEffect(() => {
    if (enriched) dispatch({ type: "markEnriched", at: new Date().toISOString() });
  }, [enriched, dispatch]);
  if (!settled) {
    return (
      <div className="fm-working" role="status">
        <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
        <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.end.checking")}</h2>
      </div>
    );
  }
  const rows: RoleRow[] = scored.map(({ item: r, kind }) => ({
    roleId: r.id, kind, label: [r.title.trim(), r.company.trim()].filter(Boolean).join(", ") || roleName(r, SCORED_LIST[kind]),
    before: before.get(r.id) ?? null, after: now.get(r.id) ?? null, visited: stops.includes(r.id),
    offered: (before.get(r.id) ?? null) === null || before.get(r.id)! < ENRICHED_AT,
  }));
  const lowest = rows.filter((r) => r.after !== null).sort((a, b) => a.after! - b.after!)[0] ?? null;
  // What would help it most: the next step its score names, with the line it is about.
  const lowestItem = lowest ? findScored(cv, lowest.roleId)?.item : undefined;
  const step = lowest ? scores.get(lowest.roleId)?.result?.nextStep : undefined;
  const line = step ? lowestItem?.bullets.find((b) => b.id === step.bulletId)?.text.trim() : undefined;
  const tip = step && line ? { line, text: issueTip(step.issue, step.tip) } : undefined;
  // The lighter items the path visited had no lines, so their lines now are the ones it added.
  const also = LIGHT_SECTIONS.map((section) => ({
    section,
    n: lights.filter((l) => l.section === section).reduce((sum, l) => {
      const found = (cv[section] as { id: string; bullets?: { text: string }[] }[]).find((i) => i.id === l.itemId);
      return sum + (found?.bullets ?? []).filter((b) => b.text.trim() !== "").length;
    }, 0),
  })).filter((a) => a.n > 0);
  return (
    <EnrichedScreen start={averageScore(before, weights)} average={average} rows={rows} also={also} achievementsAdded={achievementsAdded} skillsAdded={skillsAdded}
      notice={notice} lowest={lowest ? { ...lowest, label: roleName(findScored(cv, lowest.roleId)!.item, SCORED_LIST[lowest.kind]), tip } : null}
      onFinish={onClose} onImprove={onImprove}
      onFindJob={() => void (async () => {
        // Leaving /cv drops a save still waiting: "enriched" and the added skills must be saved first.
        await waitForSave().catch(() => undefined);
        onClose();
        void navigate("/jobs");
      })()} />
  );
}

/** A full-screen step of the path that isn't a role: the top bar, then one thing in the middle. Esc closes too. */
function PathScreen({ context, onClose, children }: { context: string; onClose(): void; children: ReactNode }) {
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
