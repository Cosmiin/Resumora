import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Experience } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  roles: readonly Experience[];
  scores: ReadonlyMap<string, RoleScoreState>;
  onStart(): void;
  onNotNow(): void;
};

/** A role's score on the start screen: the number when ready, "…" while scoring. */
function scoreText(s: RoleScoreState | undefined): string {
  if (s?.state === "scoring") return "…";
  return s?.result?.score != null ? String(s.result.score) : "–";
}

/** 1A: the start screen of the guided path. */
export function PathStart({ roles, scores, onStart, onNotNow }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNotNow();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onNotNow]);
  const first = roles[0];

  return createPortal(
    <div className="focus-mode fm-path" role="dialog" aria-modal="true" aria-label={t("enrich.path.dialog")}>
      <section className="fm-path-start">
        <p className="fm-eyebrow">{t("enrich.path.eyebrow")}</p>
        <h2 className="fm-q is-big" id="fm-step-title">{t("enrich.path.title")}</h2>
        <p className="fm-hint">{t("enrich.path.line")}</p>
        {roles.length > 0 && (
          <ul className="fm-path-roles">
            {roles.map((r) => (
              <li key={r.id}>
                <span>{[roleName(r, "experience"), r.company.trim()].filter(Boolean).join(" · ")}</span>
                <span className="fm-tag is-low">{scoreText(scores.get(r.id))}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="fm-fine">{t("enrich.path.skipped")}</p>
        <div className="fm-foot">
          <button type="button" className="fm-ghost" onClick={onNotNow}>{t("enrich.path.notNow")}</button>
          <button type="button" className="fm-btn" onClick={onStart} autoFocus>
            {first ? t("enrich.path.start", { title: roleName(first, "experience") }) : t("enrich.focus.continue")}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
