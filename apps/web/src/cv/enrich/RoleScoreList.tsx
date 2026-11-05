import { band, type Experience } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { ScorePill } from "./ScorePill.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  roles: readonly Experience[];
  scores: ReadonlyMap<string, RoleScoreState>;
  /** Put the cursor in the role's title, so the panel switches to that role's tools. */
  onOpen(roleId: string): void;
};

function labelOf(s: RoleScoreState): string {
  if (s.state === "none") return t("enrich.pill.noBullets");
  if (s.state === "unavailable" && !s.result) return t("enrich.card.unavailable");
  const n = s.result?.score ?? null;
  return n === null ? "" : t(`enrich.band.${band(n)}`);
}

/** "Your roles" in the panel overview: one row per experience, in CV order. */
export function RoleScoreList({ roles, scores, onOpen }: Props) {
  if (roles.length === 0) return null;
  return (
    <div>
      <p className="p-sub">{t("enrich.roles.title")}</p>
      <ul className="role-scores">
        {roles.map((role) => {
          const state = scores.get(role.id) ?? { state: "scoring" as const };
          return (
            <li key={role.id}>
              <ScorePill roleId={role.id} state={state} onOpen={() => onOpen(role.id)} />
              <button type="button" className="role-open" onClick={() => onOpen(role.id)}>
                <span className="rname">{roleName(role, "experience")}</span>
                <span className="rband">{labelOf(state)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="fine">{t("enrich.roles.fine")}</p>
    </div>
  );
}
