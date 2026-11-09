import { useEffect, useRef, useState, type CSSProperties } from "react";

const COUNT_MS = 1400;
// Same burst as enrichment's CelebrateMoment (its copy is about one role's score, so it isn't reused as is).
const CONFETTI = [
  ["--marigold-500", -140, -120], ["--pine-600", 150, -110], ["--pine-400", -90, 110], ["--marigold-300", 120, 100],
  ["--rose-400", -170, 10], ["--pine-600", 180, 30], ["--marigold-500", 20, -150], ["--pine-400", -30, 140],
] as const;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = { from: number | null; to: number | null; title: string; line?: string | null; button: string; onNext(): void };

/** A tailoring celebration in the enrichment look: the job score counts up, confetti, one line, one button. */
export function TailorMoment({ from, to, title, line, button, onNext }: Props) {
  const still = useRef(reducedMotion()).current;
  const start = from ?? to ?? 0;
  const [shown, setShown] = useState(still || to === null ? to : start);
  const next = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    next.current?.focus();
    if (still || to === null) return;
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

  return <section className="tailor-card tailor-moment">
    <div className="fm-moment" role="status">
      <div className="fm-moment-body">
        {shown !== null && <div className="fm-moment-num" aria-hidden="true">{shown}</div>}
        <h2 className="fm-moment-title">{title}</h2>
        {line && <p className="fm-moment-line">{line}</p>}
        <button ref={next} type="button" className="fm-btn" onClick={onNext}>{button}</button>
      </div>
      {!still && to !== null && from !== null && to > from && CONFETTI.map(([color, x, y], i) => <span key={i} className="fm-confetti"
        style={{ background: `var(${color})`, "--x": `${x}px`, "--y": `${y}px` } as CSSProperties} />)}
    </div>
  </section>;
}
