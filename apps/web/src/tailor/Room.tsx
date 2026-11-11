import type { ReactNode } from "react";
import { t } from "../i18n/t.ts";

/** One stop on the map: a role, a project, Skills, Summary, the last touches, the result. */
export type Stop = { id: string; name: string; sub?: string; state: "ok" | "now" | "todo"; group: string; gain?: number };

type Props = {
  /** The job being tailored for, and the way out. */
  jobName?: string;
  onExit(): void;
  skip?: { label: string; onSkip(): void };
  /** The match with the base CV, and with the tailored CV as it stands. */
  base: number | null;
  now: number | null;
  stops: Stop[];
  /** Which of a stop's three moments is on screen (questions, writing, review); absent between stops. */
  moment?: 0 | 1 | 2;
  children: ReactNode;
};

const MOMENTS = ["questions", "writing", "review"] as const;

/**
 * The room tailoring happens in, from the first question to the result: one bar (the job, the match, the way
 * out), the map of every stop on the left, and the stop's own screen in the middle.
 */
export function Room({ jobName, onExit, skip, base, now, stops, moment, children }: Props) {
  const groups = [...new Set(stops.map((stop) => stop.group))];
  let n = 0;
  return <div className="ui-page tailor-room">
    <header className="tailor-room-bar">
      <span className="fm-brand">{t("app.name")}</span>
      <p className="fm-ctx">{jobName && <><span>{t("tailor.for")}</span>: <b>{jobName}</b></>}</p>
      {base !== null && <p className="tailor-room-score" aria-label={t("tailor.room.match")}>
        <span>{t("tailor.room.match")}</span> <b>{base}</b>
        {now !== null && now !== base && <> <span aria-hidden="true">→</span> <b className={now > base ? "is-up" : undefined}>{now}</b></>}
      </p>}
      <div className="fm-bar-actions">
        {skip && <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={skip.onSkip}>{skip.label}</button>}
        <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onExit}>{t("tailor.back")}</button>
      </div>
    </header>
    <div className="tailor-room-body">
      <nav className="tailor-map" aria-label={t("tailor.steps")}>
        {groups.map((group) => <div key={group} className="tailor-map-group">
          {group && <p className="ui-label">{group}</p>}
          <ol>{stops.filter((stop) => stop.group === group).map((stop) => {
            const numbered = stop.id.startsWith("item:");
            if (numbered) n++;
            return <li key={stop.id} className={`tailor-stop is-${stop.state}`} aria-current={stop.state === "now" ? "step" : undefined}>
              <span className="tailor-stop-dot" aria-hidden="true">{stop.state === "ok" ? "✓" : numbered ? n : ""}</span>
              <span className="tailor-stop-name">{stop.name}{stop.sub && <small>{stop.sub}</small>}</span>
              {stop.state === "ok" && !!stop.gain && stop.gain > 0 && <span className="tailor-stop-gain">+{stop.gain}</span>}
            </li>;
          })}</ol>
        </div>)}
      </nav>
      <main className="tailor-room-main">
        {moment !== undefined && <ol className="tailor-moments" aria-hidden="true">
          {MOMENTS.map((key, i) => <li key={key} className={i === moment ? "is-on" : i < moment ? "is-done" : undefined}>{i < moment ? "✓ " : ""}{t(`tailor.room.moment.${key}`)}</li>)}
        </ol>}
        {children}
      </main>
    </div>
  </div>;
}

/** Between two stops: the match before and after the stop just finished, what earned the points, and the way on. */
export function StopDone({ name, from, to, won, left, nextName, onNext }: {
  name: string; from: number; to: number; won: string[]; left: number; nextName?: string; onNext(): void;
}) {
  return <section className="ui-sheet tailor-stopdone" aria-labelledby="tailor-stopdone-title">
    <p className="ui-label" id="tailor-stopdone-title">{t("tailor.stop.done", { name })}</p>
    <p className="tailor-bigscore" role="status">
      {to !== from ? <><s>{from}</s> <span aria-hidden="true">→</span> <b className={to > from ? "is-up" : undefined}>{to}</b></> : <b>{to}</b>}
      <span className="ui-sr">{t(to === from ? "tailor.stop.same" : "tailor.stop.moved", { from, to })}</span>
    </p>
    {to === from && <p className="ui-muted">{t("tailor.stop.same", { from, to })}</p>}
    {won.length > 0 && <ul className="tailor-wins">{won.map((item) => <li key={item}>{t("tailor.stop.won", { name: item })}</li>)}</ul>}
    <p className="ui-coach ui-coach--sm">{t(left === 0 ? "tailor.stop.leftNone" : left === 1 ? "tailor.stop.leftOne" : "tailor.stop.left", { n: left })}</p>
    <div className="tailor-foot">
      <span />
      <button type="button" className="ui-btn ui-btn--primary" onClick={onNext}>{nextName ? t("tailor.stop.next", { name: nextName }) : t("tailor.stop.nextResult")}</button>
    </div>
  </section>;
}
