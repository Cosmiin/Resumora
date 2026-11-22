import { useState } from "react";
import type { CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { SkillSuggestion } from "./enrich-api.ts";

type Group = SkillSuggestion["group"];
type Props = {
  cv: CvContent;
  suggestions: readonly SkillSuggestion[];
  /** Adds these to the CV in one change. */
  onAdd(skills: { name: string; group: Group }[]): void;
};

/** Tags shown before "+N more" while the block is closed. */
const SHOWN = 9;
const GROUPS: Group[] = ["technicalSkills", "professionalSkills"];
const key = (name: string) => name.trim().toLowerCase();

/**
 * The end screen's skills block (owner's pick C, 22 Nov 2026): the skills the roles show, with Add all, or Look through
 * to remove any and see the lines each one rests on. Nothing is added until a button is pressed.
 */
export function SkillsFound({ cv, suggestions, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  if (added !== null) {
    return <p className="sf-added" role="status">{added === 1 ? t("enrich.path.skills.addedOne") : t("enrich.path.skills.added", { n: added })}</p>;
  }
  const listed = new Set([...cv.technicalSkills, ...cv.professionalSkills, ...cv.unclearSkills].map((s) => key(s.name)));
  // Grouped, technical first; a skill put on the CV meanwhile drops out.
  const fresh = GROUPS.flatMap((g) => suggestions.filter((s) => s.group === g && !listed.has(key(s.name))));
  if (fresh.length === 0) return null;

  const add = (list: readonly SkillSuggestion[]) => {
    onAdd(list.map((s) => ({ name: s.name, group: s.group })));
    setAdded(list.length);
  };
  const tech = fresh.filter((s) => s.group === "technicalSkills").length;
  const tagClass = (s: SkillSuggestion) => `sf-tag ${s.group === "technicalSkills" ? "is-tech" : "is-pro"}`;
  const roleOf = (roleId: string) => {
    const role = cv.experience.find((r) => r.id === roleId);
    return role ? [role.title, role.company].filter(Boolean).join(" · ") : "";
  };

  if (!open) {
    return (
      <section className="sf-block" aria-labelledby="sf-title">
        <h3 className="sf-title" id="sf-title">{fresh.length === 1 ? t("enrich.path.skills.titleOne") : t("enrich.path.skills.title", { n: fresh.length })}</h3>
        <p className="sf-counts">{t("enrich.path.skills.counts", { t: tech, p: fresh.length - tech })}</p>
        <ul className="sf-tags">
          {fresh.slice(0, SHOWN).map((s) => <li key={key(s.name)} className={tagClass(s)}>{s.name}</li>)}
          {fresh.length > SHOWN && <li className="sf-tag is-more">{t("enrich.path.skills.more", { n: fresh.length - SHOWN })}</li>}
        </ul>
        <div className="sf-actions">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => add(fresh)}>
            {fresh.length === 1 ? t("enrich.path.skills.addOne") : t("enrich.path.skills.addAll", { n: fresh.length })}
          </button>
          <button type="button" className="ui-btn" onClick={() => setOpen(true)}>{t("enrich.path.skills.look")}</button>
        </div>
      </section>
    );
  }

  const kept = fresh.filter((s) => !removed.has(key(s.name)));
  return (
    <section className="sf-block is-open" aria-labelledby="sf-title">
      <h3 className="sf-title" id="sf-title">{fresh.length === 1 ? t("enrich.path.skills.titleOne") : t("enrich.path.skills.title", { n: fresh.length })}</h3>
      <p className="sf-counts">{t("enrich.path.skills.lookNote")}</p>
      {GROUPS.map((g) => {
        const list = kept.filter((s) => s.group === g);
        if (list.length === 0) return null;
        const open = list.find((s) => key(s.name) === shown);
        return (
          <div className="sf-group" key={g}>
            <h4 className="sf-group-title">{t(g === "technicalSkills" ? "enrich.skills.technical" : "enrich.skills.professional")}</h4>
            <ul className="sf-tags">
              {list.map((s) => (
                <li key={key(s.name)} className={tagClass(s)}>
                  <button type="button" className="sf-name" aria-expanded={shown === key(s.name)}
                    onClick={() => setShown((was) => (was === key(s.name) ? null : key(s.name)))}>
                    {s.name}
                    {s.picked && <small className="sf-picked">{t("enrich.path.skills.picked")}</small>}
                  </button>
                  <button type="button" className="sf-remove" aria-label={t("enrich.path.skills.remove", { name: s.name })}
                    onClick={() => setRemoved((r) => new Set([...r, key(s.name)]))}>×</button>
                </li>
              ))}
            </ul>
            {open && (
              <div className="sf-why">
                {open.lines.map((l, i) => (
                  <p key={i}><span className="sf-quote">“{l.text}”</span>{roleOf(l.roleId) && <span className="sf-role">{roleOf(l.roleId)}</span>}</p>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="sf-actions">
        <button type="button" className="ui-btn ui-btn--primary" disabled={kept.length === 0} onClick={() => add(kept)}>
          {t("enrich.path.skills.add", { n: kept.length })}
        </button>
        <button type="button" className="ui-btn" onClick={() => { setOpen(false); setRemoved(new Set()); setShown(null); }}>
          {t("enrich.path.skills.back")}
        </button>
      </div>
    </section>
  );
}
