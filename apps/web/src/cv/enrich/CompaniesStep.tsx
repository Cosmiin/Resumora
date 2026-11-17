import { useEffect, useMemo, useState } from "react";
import { MAX_LONG_TEXT, companyKey, gradedItems, newId, questionKey, type CvContent, type Experience, type Note } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { suggestCompanies } from "./enrich-api.ts";

type Saved = { roleId: string; note: Note }[];
type Row = { key: string; name: string; location: string; roles: Experience[]; done: string | null };
type Draft = { text: string; edited: boolean };

const companyQuestion = (name: string) => t("enrich.path.companies.note", { company: name });

/** One row per company on the CV (roles and volunteering), in CV order; roles at the same company share it. */
export function companyRows(cv: CvContent): Row[] {
  const rows = new Map<string, Row>();
  for (const { item } of gradedItems(cv)) {
    const key = companyKey(item.company);
    if (key === "") continue;
    const row = rows.get(key) ?? { key, name: item.company.trim(), location: "", roles: [], done: null };
    if (!row.location) row.location = item.location.trim();
    row.roles.push(item);
    rows.set(key, row);
  }
  for (const row of rows.values()) {
    // Already answered on one of its roles (this question, or the role says it in its description): nothing to ask.
    const asked = questionKey(companyQuestion(row.name));
    const note = row.roles.flatMap((r) => r.notes).find((n) => questionKey(n.question) === asked);
    const described = row.roles.find((r) => r.description.trim() !== "");
    row.done = note?.answer ?? described?.description.trim() ?? null;
  }
  return [...rows.values()];
}

/**
 * The short path's first screen: what each company does. The AI's sentence when it knows the company for sure
 * (confirmed by continuing, or edited), an empty field otherwise. Continuing saves one note per role.
 */
export function CompaniesStep({ cv, onDone }: { cv: CvContent; onDone(notes: Saved): void }) {
  const rows = useMemo(() => companyRows(cv), [cv]);
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    if (rows.every((r) => r.done !== null)) { setLoading(false); return; }
    suggestCompanies()
      .then(({ companies }) => {
        if (!alive) return;
        const found: Record<string, string> = {};
        for (const c of companies) if (c.proposal) found[c.key] = c.proposal;
        setProposals(found);
        setDrafts(Object.fromEntries(Object.entries(found).map(([k, text]) => [k, { text, edited: false }])));
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Asked once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = () => {
    const saved: Saved = [];
    const askedAt = new Date().toISOString();
    for (const row of rows) {
      if (row.done !== null) continue;
      const draft = drafts[row.key];
      const text = draft?.text.trim().slice(0, MAX_LONG_TEXT) ?? "";
      if (!text) continue;
      const picked = !draft!.edited && text === proposals[row.key];
      for (const role of row.roles) {
        saved.push({ roleId: role.id, note: { id: newId(), question: companyQuestion(row.name), answer: text, via: [picked ? "pick" : "type"], askedAt } });
      }
    }
    onDone(saved);
  };

  return (
    <>
      <p className="fm-eyebrow">{t("enrich.path.step", { n: 1, total: 4 })}</p>
      <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.path.companies.title")}</h2>
      <p className="rr-lead">{t("enrich.path.companies.lead")}</p>
      {loading && <p className="fm-note" role="status">{t("enrich.path.companies.loading")}</p>}
      <div className="ep-rows">
        {rows.map((row) => {
          const proposal = proposals[row.key];
          const draft = drafts[row.key] ?? { text: "", edited: false };
          const open = row.done === null && !loading && (!proposal || editing[row.key]);
          const titleId = `ep-co-${row.key.replace(/[^a-z0-9]+/g, "-")}`;
          return (
            <section key={row.key} className="ep-row" role="group" aria-labelledby={titleId}>
              <h3 className="ep-row-title" id={titleId}>{[row.name, row.location].filter(Boolean).join(" · ")}</h3>
              {row.roles.length > 1 && <p className="ep-row-meta">{row.roles.map((r) => r.title).filter(Boolean).join(", ")}</p>}
              {row.done === null && loading ? (
                <p className="ep-row-meta" aria-hidden="true">…</p>
              ) : row.done !== null ? (
                <p className="ep-done">{row.done}</p>
              ) : open ? (
                <textarea className="ep-input" rows={2} maxLength={MAX_LONG_TEXT} value={draft.text} aria-label={companyQuestion(row.name)}
                  placeholder={t("enrich.path.companies.placeholder")}
                  onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: { text: e.target.value, edited: true } }))} />
              ) : proposal ? (
                <div className="rr-guess">
                  <p className="rr-guess-label">{t("enrich.run.guess.label")}</p>
                  <p className="rr-guess-text" lang={cv.locale}>{draft.text}</p>
                  <button type="button" className="ui-btn ui-btn--sm" onClick={() => setEditing((e) => ({ ...e, [row.key]: true }))}>{t("enrich.focus.describe.edit")}</button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <div className="fm-foot">
        <button type="button" className="fm-btn" disabled={loading} onClick={confirm}>{t("enrich.path.companies.confirm")}</button>
      </div>
    </>
  );
}
