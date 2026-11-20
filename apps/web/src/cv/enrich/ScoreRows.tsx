import { band } from "@resumora/shared";
import { t } from "../../i18n/t.ts";

/** One role on the start or end screen: its title, company and period, its score now and, at the end, before. */
export type ScoreRow = { id: string; title: string; meta: string; now: number | null; was?: number | null };

/** A score's change written for the row: "+15" up, "−5" down (a real minus sign), "" when it did not move. */
export function scoreChange(was: number, now: number): string {
  if (now === was) return "";
  return now > was ? `+${now - was}` : `−${was - now}`;
}

/**
 * The roles as a score column (owner's pick B, 20 Nov 2026): a big score coloured by its band on the left, the title
 * and its company and period beside it. With a before score (the end screen) the change sits under the score and a bar
 * shows the role growing from before to after; unchanged roles get a quieter bar.
 */
export function ScoreRows({ rows, idPrefix }: { rows: readonly ScoreRow[]; idPrefix: string }) {
  return (
    <div className="sr-rows">
      {rows.map((r) => {
        const titleId = `${idPrefix}-${r.id}`;
        const was = r.was ?? null;
        const change = r.now !== null && was !== null ? scoreChange(was, r.now) : "";
        return (
          <section key={r.id} className="sr-row" role="group" aria-labelledby={titleId}>
            <p className="sr-score" data-band={r.now === null ? undefined : band(r.now)}>
              <span className="sr-num">{r.now ?? "–"}</span>
              {change && <small className={`sr-change ${change.startsWith("+") ? "is-up" : "is-down"}`}>{change}</small>}
            </p>
            <div className="sr-body">
              <h3 className="sr-title" id={titleId}>{r.title}</h3>
              {r.meta && <p className="sr-meta">{r.meta}</p>}
              {r.now !== null && was !== null && (
                <div className={`sr-bar ${change ? "" : "is-flat"}`} data-band={band(r.now)} aria-hidden="true">
                  <span className="sr-was" style={{ width: `${was}%` }} />
                  <span className="sr-now" style={{ width: `${r.now}%` }} />
                </div>
              )}
              {change && <span className="visually-hidden">{t("enrich.path.rows.was", { n: was ?? 0 })}</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
