import { useEffect, useRef, useState, type CSSProperties } from "react";
import { band } from "@resumora/shared";
import { t } from "../../i18n/t.ts";

type Props = { from: number | null; to: number; role: string; onNext(): void };

const COUNT_MS = 1400;
const CONFETTI = [
  ["--marigold-500", -140, -120], ["--pine-600", 150, -110], ["--pine-400", -90, 110], ["--marigold-300", 120, 100],
  ["--rose-400", -170, 10], ["--pine-600", 180, 30], ["--marigold-500", 20, -150], ["--pine-400", -30, 140],
] as const;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The line under the praise: where the role stands now. */
function contextLine(from: number | null, to: number, role: string): string {
  if (from === null) return t("enrich.focus.celebrate.firstScore");
  if (to === 100) return t("enrich.focus.celebrate.hundred", { role });
  if (band(to) === "clear") return t(band(from) === "clear" ? "enrich.focus.celebrate.stronger" : "enrich.focus.celebrate.nowClear", { role });
  return t(to >= 65 ? "enrich.focus.celebrate.almost" : "enrich.focus.celebrate.onTheWay", { role });
}

/** A short full-panel moment: the role score counts up, a confetti burst, one line of praise. */
export function CelebrateMoment({ from, to, role, onNext }: Props) {
  const still = useRef(reducedMotion()).current;
  const start = from ?? 0;
  const [shown, setShown] = useState(still ? to : start);
  const next = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    next.current?.focus();
    if (still) return;
    let frame = 0;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const p = Math.min(1, (now - t0) / COUNT_MS);
      setShown(Math.round(start + (to - start) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [start, to, still]);

  return (
    <div className="fm-moment" role="status">
      <div className="fm-moment-body">
        <div className="fm-moment-num" aria-hidden="true">{shown}</div>
        <h2 className="fm-moment-title">
          {from === null ? t("enrich.focus.celebrate.first") : t("enrich.focus.celebrate.up", { from })}
        </h2>
        <p className="fm-moment-line">{contextLine(from, to, role)}</p>
        <span className="visually-hidden">{t("enrich.focus.bulletScore", { n: to })}</span>
        <button ref={next} type="button" className="fm-btn" onClick={onNext}>
          {t("enrich.focus.celebrate.next")}
        </button>
      </div>
      {!still && CONFETTI.map(([color, x, y], i) => (
        <span
          key={i}
          className="fm-confetti"
          data-testid="confetti"
          style={{ background: `var(${color})`, "--x": `${x}px`, "--y": `${y}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}
