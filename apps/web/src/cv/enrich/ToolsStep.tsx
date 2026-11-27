import { useEffect, useMemo, useRef, useState } from "react";
import { gradedItems, newId, toolShown, type CvContent, type Note, type ToolsAnswer } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { formatRange } from "../page/blocks.ts";
import { suggestTools } from "./enrich-api.ts";

type Saved = { roleId: string; note: Note }[];
type Ticks = Record<string, Set<string>>;

/** At most this many suggested tools across the CV; tools a role names and tools the person adds come on top. */
const MAX_COLUMNS = 8;
const norm = (tool: string) => tool.trim().replace(/\s+/g, " ").toLowerCase();

/** Where a tool on a role's card comes from, in the order they are shown. */
const GROUPS = ["named", "usual", "own", "near"] as const;
type Group = (typeof GROUPS)[number];

/**
 * The short path's tools step, one screen (owner, 27 Nov 2026): every role with a written line is a card with its tools
 * as toggle buttons. A tool the role's text already names starts ticked. A tool ticked on one role is offered (dashed)
 * on the roles just before and after it. A role with no written line has no score and no line to name a tool in: it is
 * not shown. Continue saves a note on each role whose ticks changed; a role left alone stays as its text has it.
 * prepared: the AI's answer asked for while the import was still on screen.
 */
export function ToolsStep({ cv, prepared, onDone }: { cv: CvContent; prepared?: Promise<ToolsAnswer>; onDone(notes: Saved): void }) {
  const roles = useMemo(() => gradedItems(cv).map(({ item }) => item).filter((r) => r.bullets.some((b) => b.text.trim() !== "")), [cv]);
  const [loading, setLoading] = useState(true);
  const [suggested, setSuggested] = useState<Record<string, string[]>>({});
  const [added, setAdded] = useState<string[]>([]);
  const [ticks, setTicks] = useState<Ticks>({});
  const [initial, setInitial] = useState<Ticks>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Continue works once: a second click must not save the notes again.
  const [sent, setSent] = useState(false);
  /** Tools the person added, by the role they were added on: they stay offered there when unticked. */
  const [own, setOwn] = useState<Ticks>({});
  /** The cards whose "Add a tool" field is open, and the one whose field takes the focus when it appears. */
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());
  const focusAdd = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    // The prepared answer may have failed (the import was used before it was asked for): then ask now.
    (prepared ? prepared.catch(() => suggestTools()) : suggestTools())
      .then(({ roles: answer }) => {
        if (!alive) return;
        const byRole: Record<string, string[]> = {};
        for (const r of answer) byRole[r.roleId] = r.tools;
        // Every suggested tool starts ticked on each role whose own text names it.
        const all = answer.flatMap((r) => r.tools);
        const start: Ticks = {};
        for (const role of roles) start[role.id] = new Set(all.filter((tool) => toolShown(role, tool)).map(norm));
        setSuggested(byRole);
        setTicks(Object.fromEntries(Object.entries(start).map(([k, v]) => [k, new Set(v)])));
        setInitial(start);
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Asked once, when the step opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every tool in the step: the ones suggested most often first (ties in the order they came), then the ones the person added.
  const columns = useMemo(() => {
    const count = new Map<string, { name: string; n: number; first: number }>();
    let order = 0;
    for (const role of roles) for (const tool of suggested[role.id] ?? []) {
      const key = norm(tool);
      const c = count.get(key) ?? { name: tool.trim(), n: 0, first: order++ };
      c.n++;
      count.set(key, c);
    }
    const ranked = [...count.values()].sort((a, b) => b.n - a.n || a.first - b.first);
    // A tool a role already names is always kept, even past the first eight.
    const named = new Set(Object.values(initial).flatMap((set) => [...set]));
    const shown = ranked.filter((c, i) => i < MAX_COLUMNS || named.has(norm(c.name))).map((c) => c.name);
    const keys = new Set(shown.map(norm));
    return [...shown, ...added.filter((name) => !keys.has(norm(name)))];
  }, [roles, suggested, added, initial]);

  const ticked = (roleId: string, tool: string) => ticks[roleId]?.has(norm(tool)) ?? false;
  /** The group a tool is shown under on a role's screen; null when that role is not offered it. */
  const groupOf = (at: number, tool: string): Group | null => {
    const role = roles[at]!;
    const key = norm(tool);
    if (initial[role.id]?.has(key)) return "named";
    if ((suggested[role.id] ?? []).some((s) => norm(s) === key)) return "usual";
    if (own[role.id]?.has(key)) return "own";
    // Ticked on a neighbour, or ticked here after a neighbour offered it.
    if (ticked(role.id, tool) || [roles[at - 1], roles[at + 1]].some((r) => r && ticked(r.id, tool))) return "near";
    return null;
  };
  const toggle = (roleId: string, tool: string, on: boolean) => setTicks((all) => {
    const next = new Set(all[roleId] ?? []);
    if (on) next.add(norm(tool)); else next.delete(norm(tool));
    return { ...all, [roleId]: next };
  });
  const addTool = (roleId: string) => {
    const name = (drafts[roleId] ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name) return;
    if (!columns.some((c) => norm(c) === norm(name))) setAdded((a) => [...a, name]);
    setOwn((o) => ({ ...o, [roleId]: new Set([...(o[roleId] ?? []), norm(name)]) }));
    toggle(roleId, name, true);
    setDrafts((d) => ({ ...d, [roleId]: "" }));
  };

  const finish = () => {
    if (sent) return;
    setSent(true);
    const askedAt = new Date().toISOString();
    const saved: Saved = [];
    for (const role of roles) {
      const mine = ticks[role.id] ?? new Set<string>();
      const was = initial[role.id] ?? new Set<string>();
      if (mine.size === was.size && [...mine].every((k) => was.has(k))) continue;
      const names = columns.filter((c) => mine.has(norm(c)));
      // Every ticked tool is in columns (see there), so names holds every tick.
      saved.push({ roleId: role.id, note: {
        id: newId(), question: t("enrich.path.tools.note"), answer: names.length ? names.join(", ") : t("enrich.path.tools.none"), via: ["pick"], askedAt,
      } });
    }
    onDone(saved);
  };

  return (
    <>
      <p className="fm-eyebrow">{t("enrich.path.step", { n: 3, total: 4 })}</p>
      <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.path.tools.title")}</h2>
      {loading ? <p className="fm-note" role="status">{t("enrich.path.tools.loading")}</p> : (
        <>
          {roles.length > 0 && <p className="rr-lead">{t("enrich.path.tools.lead")}</p>}
          <div className="ep-rows">
            {roles.map((role, at) => {
              const titleId = `ep-tools-${role.id}`;
              const tools = GROUPS.flatMap((group) => columns.filter((tool) => groupOf(at, tool) === group).map((tool) => ({ tool, group })));
              return (
                <section key={role.id} className="ep-row" role="group" aria-labelledby={titleId}>
                  <h3 className="ep-row-title" id={titleId}>{role.title || role.company}</h3>
                  <p className="ep-row-meta">
                    {[role.title ? role.company : "", formatRange(role.startDate, role.endDate, role.current, cv.locale)].filter(Boolean).join(" · ")}
                  </p>
                  <div className="ep-tools">
                    {tools.map(({ tool, group }) => {
                      const on = ticked(role.id, tool);
                      return (
                        <button key={norm(tool)} type="button" className={group === "near" ? "ep-tool is-near" : "ep-tool"} aria-pressed={on} disabled={sent}
                          onClick={() => toggle(role.id, tool, !on)}>
                          <ToolMark on={on} />{tool}
                        </button>
                      );
                    })}
                    {adding.has(role.id) ? (
                      <span className="ep-addfield">
                        <input type="text" className="ui-input" maxLength={40} value={drafts[role.id] ?? ""} aria-label={t("enrich.path.tools.addName")}
                          ref={(node) => { if (node && focusAdd.current === role.id) { focusAdd.current = null; node.focus(); } }}
                          onChange={(e) => setDrafts((d) => ({ ...d, [role.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTool(role.id); } }} />
                        <button type="button" className="ui-btn" disabled={sent} onClick={() => addTool(role.id)}>{t("enrich.path.tools.addButton")}</button>
                      </span>
                    ) : (
                      <button type="button" className="ep-tool is-add" disabled={sent} onClick={() => {
                        focusAdd.current = role.id;
                        setAdding((all) => new Set(all).add(role.id));
                      }}>
                        <ToolMark on={false} />{t("enrich.path.tools.addLabel")}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      <div className="fm-foot">
        <button type="button" className="fm-btn" disabled={loading || sent} onClick={finish}>{t("enrich.focus.continue")}</button>
      </div>
    </>
  );
}

/** A tick on a chosen tool, a plus on one that can be added. */
function ToolMark({ on }: { on: boolean }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={on ? "M3 8.5l3.2 3.2L13 5" : "M8 3v10M3 8h10"} />
    </svg>
  );
}
