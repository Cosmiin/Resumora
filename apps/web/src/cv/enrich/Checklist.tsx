import { worthAdding, type RoleResult } from "@resumora/shared";
import { t } from "../../i18n/t.ts";

const SHAPE_CHECKS = ["amount", "repeats", "order"] as const;

type Item = { key: string; ok: boolean; label: string; fix?: string };

/** A short list of checks: a tick when it holds, otherwise a bullet with a plain-words fix under it. */
export function Checklist({ items }: { items: Item[] }) {
  return (
    <ul className="check">
      {items.map((it) => (
        <li key={it.key}>
          <span className={it.ok ? "ok" : "no"} aria-hidden="true">
            {it.ok ? "✓" : "•"}
          </span>
          <span>
            {it.label}
            {!it.ok && it.fix && <small>{it.fix}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A role's checklist (score/9): its shape (3 to 6 lines, no repeats, strongest line first) and the "worth adding" items
 * that apply to it, ✓ when met, ○ when not. None of it changes the score.
 */
export function RoleChecklist({ result }: { result: RoleResult }) {
  const coverage = result.coverage;
  if (!coverage) return null;
  const groups = [
    { key: "shape", title: t("enrich.explain.checklist.shape"), items: SHAPE_CHECKS.map((s) => ({ key: s, ok: coverage.shape[s], label: t(`enrich.explain.checklist.${s}`) })) },
    { key: "worth", title: t("enrich.explain.checklist.worth"), items: worthAdding(coverage).map((w) => ({ key: w.param, ok: w.shown, label: t(`enrich.explain.param.${w.param}`) })) },
  ].filter((g) => g.items.length > 0);
  return (
    <div className="rc">
      {groups.map((g) => (
        <div key={g.key} className="rc-group">
          <p className="rc-title">{g.title}</p>
          <ul className="rc-list" aria-label={g.title}>
            {g.items.map((it) => (
              <li key={it.key} className={`rc-item ${it.ok ? "is-yes" : "is-no"}`}>
                <span className="rc-mark" aria-hidden="true">{it.ok ? "✓" : "○"}</span>
                <span className="visually-hidden">{t(`enrich.explain.state.${it.ok ? "yes" : "no"}`)} </span>
                <span>{it.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
