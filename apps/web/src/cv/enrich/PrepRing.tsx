import { useEffect, useState } from "react";
import type { MessageKey } from "../../i18n/en.ts";
import { useT } from "../../i18n/t.ts";

/** One role being prepared: its name, how many answers it got this round, and where it stands. */
export type PrepRow = { id: string; name: string; answers: number; state: "working" | "done" | "failed" };
type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const RADIUS = 76;
const CIRCLE = 2 * Math.PI * RADIUS;
/** How long the line under the ring names one working role before the next. */
export const RING_TURN_MS = 1600;

/** The handwritten line for a working role. Romanian puts "de" before 20 and up (and before whole hundreds). */
export function ringLine(t: T, row: PrepRow): string {
  const n = row.answers;
  if (n === 0) return t("enrich.path.prep.workingOn", { role: row.name });
  if (n === 1) return t("enrich.path.prep.placingOne", { role: row.name });
  const de = n % 100 === 0 || n % 100 >= 20;
  return t(de ? "enrich.path.prep.placingMany" : "enrich.path.prep.placing", { n, role: row.name });
}

/**
 * The prepare screen (owner's pick, 20 Nov 2026: "One ring"): one ring piece per role, filled when that role is done,
 * red when it failed; the finished roles counted in the middle; one line naming a role still working, in turn; and
 * the finished roles as chips.
 */
export function PrepRing({ rows }: { rows: readonly PrepRow[] }) {
  const t = useT();
  const working = rows.filter((r) => r.state === "working");
  const anyWorking = working.length > 0;
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!anyWorking) return;
    const id = setInterval(() => setTurn((n) => n + 1), RING_TURN_MS);
    return () => clearInterval(id);
  }, [anyWorking]);

  const total = rows.length;
  const ready = total - working.length;
  const slot = CIRCLE / Math.max(total, 1);
  // A gap between pieces that stays visible past the round line ends, and shrinks for many roles.
  const gap = total > 1 ? Math.min(22, slot * 0.4) : 0;
  const current = anyWorking ? working[turn % working.length] : undefined;
  const finished = rows.filter((r) => r.state !== "working");

  return (
    <div className="prep-ring">
      <svg className="prep-ring-svg" viewBox="0 0 190 190" role="img" aria-label={t("enrich.path.prep.ring", { done: ready, total })}>
        {rows.map((r, i) => (
          <circle key={r.id} className="prep-ring-seg" data-state={r.state} cx="95" cy="95" r={RADIUS}
            strokeDasharray={total > 1 ? `${slot - gap} ${CIRCLE - slot + gap}` : undefined}
            strokeDashoffset={total > 1 ? CIRCLE / 4 - i * slot - gap / 2 : undefined} />
        ))}
        <text x="95" y="100" textAnchor="middle" className="prep-ring-count">{ready}/{total}</text>
        <text x="95" y="124" textAnchor="middle" className="prep-ring-sub">{t("enrich.path.prep.rolesReady")}</text>
      </svg>
      {current && <p className="prep-ring-now" aria-live="off">{ringLine(t, current)}</p>}
      {finished.length > 0 && (
        <ul className="prep-ring-chips">
          {finished.map((r) => (
            <li key={r.id} className="prep-ring-chip" data-state={r.state}>
              {r.state === "done" ? `✓ ${r.name}` : t("enrich.path.prep.notPlaced", { role: r.name })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
