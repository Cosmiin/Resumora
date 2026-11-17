import { useState } from "react";
import { findScored, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { Change } from "./prepare.ts";
import { Piece, type Pick } from "./ReviewPieces.tsx";

export type ReviewGroup = { roleId: string; changes: Change[]; tidied: ReadonlySet<string> };
type Props = {
  cv: CvContent;
  groups: ReviewGroup[];
  busy: boolean;
  onApply(decisions: { roleId: string; id: string; text: string }[]): void;
};

/**
 * The short path's last step: every change across the CV, grouped by role, each role closed to one line until opened.
 * Every change is used unless the person keeps their own; "Apply all" puts them on the CV at once.
 */
export function ReviewSheet({ cv, groups, busy, onApply }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picks, setPicks] = useState<Record<string, Pick>>(() => Object.fromEntries(
    groups.flatMap((g) => g.changes.map((c) => [`${g.roleId}|${c.id}`, { use: true, text: c.after }])),
  ));

  if (groups.length === 0) {
    return (
      <>
        <p className="fm-eyebrow">{t("enrich.path.step", { n: 4, total: 4 })}</p>
        <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.path.review.nothing")}</h2>
        <div className="fm-foot">
          <button type="button" className="fm-btn" disabled={busy} onClick={() => onApply([])}>{t("enrich.focus.continue")}</button>
        </div>
      </>
    );
  }

  const apply = () => onApply(groups.flatMap((g) => g.changes.flatMap((c) => {
    const pick = picks[`${g.roleId}|${c.id}`];
    return pick?.use ? [{ roleId: g.roleId, id: c.id, text: pick.text }] : [];
  })));

  return (
    <>
      <p className="fm-eyebrow">{t("enrich.path.step", { n: 4, total: 4 })}</p>
      <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.path.review.title")}</h2>
      <p className="rr-lead">{t("enrich.path.review.lead")}</p>
      <div className="ep-rows">
        {groups.map((g) => {
          const role = findScored(cv, g.roleId)?.item;
          const name = [role?.title, role?.company].filter((s) => s?.trim()).join(" · ");
          const isOpen = open.has(g.roleId);
          const label = t(g.changes.length === 1 ? "enrich.path.review.groupOne" : "enrich.path.review.group", { role: name, n: g.changes.length });
          return (
            <section key={g.roleId} className="ep-row">
              <button type="button" className="ep-group" aria-expanded={isOpen}
                onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(g.roleId)) n.delete(g.roleId); else n.add(g.roleId); return n; })}>
                {label}
              </button>
              {isOpen && (
                <ul className="ep-changes" lang={cv.locale}>
                  {g.changes.map((c) => {
                    const key = `${g.roleId}|${c.id}`;
                    return (
                      <li key={c.id} className="rr-piece">
                        <Piece change={c} pick={picks[key] ?? { use: true, text: c.after }} was={false} locale={cv.locale} busy={busy} tidied={g.tidied.has(c.id)}
                          onPick={(pick) => setPicks((p) => ({ ...p, [key]: pick }))} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <div className="fm-foot">
        <button type="button" className="fm-btn" disabled={busy} onClick={apply}>{t("enrich.path.review.apply")}</button>
      </div>
    </>
  );
}
