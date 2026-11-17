import { useEffect, useMemo, useState } from "react";
import { gradedItems, newId, toolShown, type CvContent, type Note } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { formatRange } from "../page/blocks.ts";
import { suggestTools } from "./enrich-api.ts";

type Saved = { roleId: string; note: Note }[];

/** At most this many tool columns from the AI; tools the person adds come on top. */
const MAX_COLUMNS = 8;
const norm = (tool: string) => tool.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The short path's second screen: one grid of roles × tools. A tool the role's text already names starts ticked. A
 * tool ticked on one role is offered on the roles just before and after it. Continuing saves a note on each role
 * whose ticks changed.
 */
export function ToolsStep({ cv, onDone }: { cv: CvContent; onDone(notes: Saved): void }) {
  const roles = useMemo(() => gradedItems(cv).map(({ item }) => item), [cv]);
  const [loading, setLoading] = useState(true);
  const [suggested, setSuggested] = useState<Record<string, string[]>>({});
  const [added, setAdded] = useState<string[]>([]);
  const [ticks, setTicks] = useState<Record<string, Set<string>>>({});
  const [initial, setInitial] = useState<Record<string, Set<string>>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Tools the person added, by the role they were added on: their cell stays even when unticked. */
  const [own, setOwn] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    let alive = true;
    suggestTools()
      .then(({ roles: answer }) => {
        if (!alive) return;
        const byRole: Record<string, string[]> = {};
        for (const r of answer) byRole[r.roleId] = r.tools;
        // Every tool on the grid starts ticked on each role whose own text names it.
        const all = answer.flatMap((r) => r.tools);
        const start: Record<string, Set<string>> = {};
        for (const role of roles) start[role.id] = new Set(all.filter((tool) => toolShown(role, tool)).map(norm));
        setSuggested(byRole);
        setTicks(Object.fromEntries(Object.entries(start).map(([k, v]) => [k, new Set(v)])));
        setInitial(start);
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Asked once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Columns: the tools suggested most often first (ties in the order they came), then the tools the person added.
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
    // A tool a role already names always has a column, even past the first eight.
    const named = new Set(Object.values(initial).flatMap((set) => [...set]));
    const shown = ranked.filter((c, i) => i < MAX_COLUMNS || named.has(norm(c.name))).map((c) => c.name);
    const keys = new Set(shown.map(norm));
    return [...shown, ...added.filter((name) => !keys.has(norm(name)))];
  }, [roles, suggested, added, initial]);

  const ticked = (roleId: string, tool: string) => ticks[roleId]?.has(norm(tool)) ?? false;
  const offered = (index: number, tool: string) => {
    const role = roles[index]!;
    if (ticked(role.id, tool) || own[role.id]?.has(norm(tool)) || initial[role.id]?.has(norm(tool))) return true;
    if ((suggested[role.id] ?? []).some((s) => norm(s) === norm(tool))) return true;
    return [roles[index - 1], roles[index + 1]].some((r) => r && ticked(r.id, tool));
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
    const askedAt = new Date().toISOString();
    const saved: Saved = [];
    for (const role of roles) {
      const now = ticks[role.id] ?? new Set<string>();
      const was = initial[role.id] ?? new Set<string>();
      if (now.size === was.size && [...now].every((k) => was.has(k))) continue;
      const names = columns.filter((c) => now.has(norm(c)));
      // Every column exists for a ticked tool (see columns), so names holds every tick.
      saved.push({ roleId: role.id, note: {
        id: newId(), question: t("enrich.path.tools.note"), answer: names.length ? names.join(", ") : t("enrich.path.tools.none"), via: ["pick"], askedAt,
      } });
    }
    onDone(saved);
  };

  return (
    <>
      <p className="fm-eyebrow">{t("enrich.path.step", { n: 2, total: 4 })}</p>
      <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.path.tools.title")}</h2>
      <p className="rr-lead">{t("enrich.path.tools.lead")}</p>
      {loading && <p className="fm-note" role="status">{t("enrich.path.tools.loading")}</p>}
      {!loading && (
        <div className="ep-grid-wrap">
          <table className="ep-grid">
            <thead>
              <tr>
                <th scope="col"><span className="visually-hidden">{t("enrich.path.tools.role")}</span></th>
                {columns.map((tool) => <th key={norm(tool)} scope="col">{tool}</th>)}
                <th scope="col"><span className="visually-hidden">{t("enrich.path.tools.addHeading")}</span></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role, index) => (
                <tr key={role.id}>
                  <th scope="row">
                    <span className="ep-grid-title">{role.title || role.company}</span>
                    <span className="ep-row-meta">{[role.title ? role.company : "", formatRange(role.startDate, role.endDate, role.current, cv.locale)].filter(Boolean).join(" · ")}</span>
                  </th>
                  {columns.map((tool) => (
                    <td key={norm(tool)}>
                      {offered(index, tool) && (
                        <input type="checkbox" aria-label={t("enrich.path.tools.cell", { tool, role: role.title || role.company })}
                          checked={ticked(role.id, tool)} onChange={(e) => toggle(role.id, tool, e.target.checked)} />
                      )}
                    </td>
                  ))}
                  <td>
                    <input type="text" className="ep-add" maxLength={40} placeholder={t("enrich.path.tools.addPlaceholder")}
                      aria-label={t("enrich.path.tools.add", { role: role.title || role.company })} value={drafts[role.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [role.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTool(role.id); } }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="fm-foot">
        <button type="button" className="fm-btn" disabled={loading} onClick={finish}>{t("enrich.focus.continue")}</button>
      </div>
    </>
  );
}
