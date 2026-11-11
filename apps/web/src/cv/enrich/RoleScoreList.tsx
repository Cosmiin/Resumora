import { useState } from "react";
import { band, type Experience, type ScoredKind } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { SCORED_LIST, type RoleList } from "../edit/lists.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { useOpenFocus } from "./focus-context.ts";
import { ScoreCard } from "./ScoreCard.tsx";
import { ScorePillBadge } from "./ScorePill.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  /** Every scored item in CV order: roles, then projects, then volunteering. */
  items: readonly { item: Experience; kind: ScoredKind }[];
  scores: ReadonlyMap<string, RoleScoreState>;
  /** Put the cursor in the item's title, so the panel switches to that item's tools. */
  onOpen(itemId: string, list: RoleList): void;
  /** Contents column: a row opens the role's score card under it (why this score, what to fix, a way to act). */
  expandable?: boolean;
  onRetry?(roleId: string): void;
};

function labelOf(s: RoleScoreState): string {
  if (s.state === "none") return t("enrich.pill.noBullets");
  if (s.state === "unavailable" && !s.result) return t("enrich.card.unavailable");
  const n = s.result?.score ?? null;
  return n === null ? "" : t(`enrich.band.${band(n)}`);
}

function nameOf(name: string, s: RoleScoreState): string {
  const n = s.result?.score ?? null;
  if (n !== null && s.state !== "none" && s.state !== "unavailable") return t("enrich.roles.rowLabel", { name, n, band: t(`enrich.band.${band(n)}`) });
  return `${name}, ${labelOf(s) || t("enrich.pill.scoring")}`;
}

function Rows({ items, scores, onOpen, expandable, onRetry }: Props) {
  const openFocus = useOpenFocus();
  const [openId, setOpenId] = useState<string | null>(null);
  // Without focus mode (a tailored CV) there is nothing to act on: the row moves the cursor, as before.
  const inline = expandable === true && openFocus !== null;
  return (
    <ul className="role-scores">
      {items.map(({ item, kind }) => {
        const state = scores.get(item.id) ?? { state: "scoring" as const };
        const list = SCORED_LIST[kind];
        const name = roleName(item, list);
        const open = inline && openId === item.id;
        const step = state.result?.nextStep;
        const weak = step ? item.bullets.find((b) => b.id === step.bulletId)?.text.trim() : undefined;
        return (
          <li key={item.id}>
            <button type="button" className="role-open" aria-label={nameOf(name, state)} aria-expanded={inline ? open : undefined}
              onClick={() => (inline ? setOpenId(open ? null : item.id) : onOpen(item.id, list))}>
              <ScorePillBadge state={state} />
              <span className="rname">{name}</span>
              <span className="rband">{labelOf(state)}</span>
            </button>
            {open && openFocus && (
              <div className="role-why">
                {weak && <p className="role-weak"><b>{t("cv.roles.weakest")}</b> “{weak}”</p>}
                <ScoreCard role={item} score={state} onImprove={(mode) => openFocus({ roleId: item.id, mode })} onRetry={() => onRetry?.(item.id)} />
                <button type="button" className="role-goto" onClick={() => onOpen(item.id, list)}>{t("cv.roles.goTo")}</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "Your roles", then "Projects and volunteering", in the panel overview: one row per item, in CV order. */
export function RoleScoreList({ items, scores, onOpen, expandable, onRetry }: Props) {
  if (items.length === 0) return null;
  const roles = items.filter((i) => i.kind === "role");
  const others = items.filter((i) => i.kind !== "role");
  const explain = <p className="role-explain">{t("cv.roles.explain")}</p>;
  return (
    <div>
      {roles.length > 0 && <p className="p-sub">{t("enrich.roles.title")}</p>}
      {roles.length > 0 && explain}
      {roles.length > 0 && <Rows items={roles} scores={scores} onOpen={onOpen} expandable={expandable} onRetry={onRetry} />}
      {others.length > 0 && <p className="p-sub">{t("enrich.roles.other")}</p>}
      {roles.length === 0 && explain}
      {others.length > 0 && <Rows items={others} scores={scores} onOpen={onOpen} expandable={expandable} onRetry={onRetry} />}
    </div>
  );
}
