import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import type { Experience, ScoredKind } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { SCORED_LIST, type LineList } from "../edit/lists.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

export type PathItem = { item: Experience; kind: ScoredKind };

type Props = {
  /** The scored items to visit, in path order: roles first, then projects and volunteering. */
  items: readonly PathItem[];
  /** The lighter sections with items to visit, and how many (Q3: items with no lines yet). */
  quick: readonly { section: LineList; count: number }[];
  scores: ReadonlyMap<string, RoleScoreState>;
  onStart(): void;
  onNotNow(): void;
};

/** An item's score on the start screen: the number when ready, "…" while scoring. */
function scoreText(s: RoleScoreState | undefined): string {
  if (s?.state === "scoring") return "…";
  return s?.result?.score != null ? String(s.result.score) : "–";
}

const nameOf = ({ item, kind }: PathItem) => roleName(item, SCORED_LIST[kind]);

function Group({ title, items, scores }: { title: string; items: readonly PathItem[]; scores: ReadonlyMap<string, RoleScoreState> }) {
  const id = useId();
  if (!items.length) return null;
  return (
    <>
      <p className="fm-eyebrow" id={id}>{title}</p>
      <ul className="fm-path-roles" aria-labelledby={id}>
        {items.map((p) => (
          <li key={p.item.id}>
            <span>{[p.item.title.trim(), p.item.company.trim()].filter(Boolean).join(" · ") || nameOf(p)}</span>
            <span className="fm-tag is-low">{scoreText(scores.get(p.item.id))}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** 1A: the start screen of the guided path. One button, one path: roles, projects and volunteering, then a quick pass. */
export function PathStart({ items, quick, scores, onStart, onNotNow }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNotNow();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onNotNow]);
  const first = items[0];

  return createPortal(
    <div className="focus-mode fm-path" role="dialog" aria-modal="true" aria-label={t("enrich.path.dialog")}>
      <section className="fm-path-start">
        <p className="fm-eyebrow">{t("enrich.path.eyebrow")}</p>
        <h2 className="fm-q is-big" id="fm-step-title">{t("enrich.path.title")}</h2>
        <p className="fm-hint">{t("enrich.path.line")}</p>
        <Group title={t("enrich.path.group.roles")} items={items.filter((p) => p.kind === "role")} scores={scores} />
        <Group title={t("enrich.path.group.other")} items={items.filter((p) => p.kind !== "role")} scores={scores} />
        {quick.length > 0 && (
          <>
            <p className="fm-eyebrow">{t("enrich.path.quick")}</p>
            <p className="fm-path-quick">{quick.map((q) => `${t(`enrich.path.section.${q.section}`)} · ${q.count}`).join(" · ")}</p>
          </>
        )}
        <p className="fm-fine">{t("enrich.path.skipped")}</p>
        <div className="fm-foot">
          <button type="button" className="fm-ghost" onClick={onNotNow}>{t("enrich.path.notNow")}</button>
          <button type="button" className="fm-btn" onClick={onStart} autoFocus>
            {first ? t("enrich.path.start", { title: nameOf(first) }) : t("enrich.focus.continue")}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
