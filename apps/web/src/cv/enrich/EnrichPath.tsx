import { useState } from "react";
import { createPortal } from "react-dom";
import type { CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
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

type Stage = { kind: "start" } | { kind: "role"; index: number } | { kind: "achievements" };

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
  return createPortal(
    <div className="focus-mode fm-path" role="dialog" aria-modal="true" aria-label={t("enrich.path.dialog")}>
      <PathBar label={t("enrich.path.achievements")} at={stops.length} total={total} />
      <section className="fm-path-start">
        <div className="fm-foot">
          <button type="button" className="fm-btn" onClick={onClose}>{t("enrich.focus.done.back")}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
