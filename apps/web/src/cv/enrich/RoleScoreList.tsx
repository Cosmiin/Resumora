import { band, type Experience, type ScoredKind } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { SCORED_LIST, type RoleList } from "../edit/lists.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { ScorePillBadge } from "./ScorePill.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  /** Every scored item in CV order: roles, then projects, then volunteering. */
  items: readonly { item: Experience; kind: ScoredKind }[];
  scores: ReadonlyMap<string, RoleScoreState>;
  /** Put the cursor in the item's title, so the panel switches to that item's tools. */
  onOpen(itemId: string, list: RoleList): void;
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

function Rows({ items, scores, onOpen }: Props) {
  return (
    <ul className="role-scores">
      {items.map(({ item, kind }) => {
        const state = scores.get(item.id) ?? { state: "scoring" as const };
        const list = SCORED_LIST[kind];
        const name = roleName(item, list);
        return (
          <li key={item.id}>
            <button type="button" className="role-open" aria-label={nameOf(name, state)} onClick={() => onOpen(item.id, list)}>
              <ScorePillBadge state={state} />
              <span className="rname">{name}</span>
              <span className="rband">{labelOf(state)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** "Your roles", then "Projects and volunteering", in the panel overview: one row per item, in CV order. */
export function RoleScoreList({ items, scores, onOpen }: Props) {
  if (items.length === 0) return null;
  const roles = items.filter((i) => i.kind === "role");
  const others = items.filter((i) => i.kind !== "role");
  return (
    <div>
      {roles.length > 0 && <p className="p-sub">{t("enrich.roles.title")}</p>}
      {roles.length > 0 && <Rows items={roles} scores={scores} onOpen={onOpen} />}
      {others.length > 0 && <p className="p-sub">{t("enrich.roles.other")}</p>}
      {others.length > 0 && <Rows items={others} scores={scores} onOpen={onOpen} />}
      <p className="fine">{t("enrich.roles.fine")}</p>
    </div>
  );
}
