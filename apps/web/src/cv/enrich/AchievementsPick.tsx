import { useState } from "react";
import type { Experience } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";

type Props = {
  suggestions: { id: string; text: string; roleId: string }[];
  roles: readonly Experience[];
  /** The ticked suggestions' texts; an empty list is "None of these". */
  onDone(texts: string[]): void;
};

/** 4A: Key achievements as pick cards, the same look as "Pick the ones that are true", none ticked to start with. */
export function AchievementsPick({ suggestions, roles, onDone }: Props) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const from = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return null;
    const company = role.company.trim();
    return t(company ? "enrich.achievements.from" : "enrich.achievements.fromRole", { role: roleName(role, "experience"), company });
  };

  return (
    <>
      <p className="fm-eyebrow">{t("enrich.achievements.eyebrow")}</p>
      <h2 className="fm-q" id="fm-step-title">{t("enrich.achievements.title")}</h2>
      <p className="fm-hint">{t("enrich.achievements.line")}</p>
      <ul className="fm-picks">
        {suggestions.map((s) => (
          <li key={s.id}>
            <label className={picked.has(s.id) ? "fm-pick is-on" : "fm-pick"}>
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
              <span className="fm-pick-text">
                {s.text}
                {from(s.roleId) && <small className="fm-pick-from">{from(s.roleId)}</small>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="fm-foot">
        <button type="button" className="fm-ghost" onClick={() => onDone([])}>{t("enrich.achievements.none")}</button>
        <button type="button" className="fm-btn" disabled={picked.size === 0}
          onClick={() => onDone(suggestions.filter((s) => picked.has(s.id)).map((s) => s.text))}>
          {picked.size === 1 ? t("enrich.achievements.addOne") : t("enrich.achievements.add", { n: picked.size })}
        </button>
      </div>
    </>
  );
}
