import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_LONG_TEXT, companyKey, gradedItems, newId, questionKey, type CompaniesAnswer, type CvContent, type Experience, type Note } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { suggestCompanies } from "./enrich-api.ts";

type Saved = { roleId: string; note: Note }[];
type Row = { key: string; name: string; location: string; roles: Experience[]; done: string | null };

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
 * The short path's first screen: what each company does. A company the AI knows for sure is filled in without
 * asking (owner, 17 Nov 2026); the screen asks only about the rest, and moves on by itself when there is none.
 * Continuing saves one note per role. prepared: the AI's answer asked for while the import was still on screen.
 */
export function CompaniesStep({ cv, prepared, onDone }: { cv: CvContent; prepared?: Promise<CompaniesAnswer>; onDone(notes: Saved): void }) {
  const rows = useMemo(() => companyRows(cv), [cv]);
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  // Continue works once: a second click (or a second run of the effect below) must not save the notes again.
  const [sent, setSent] = useState(false);
  const sentRef = useRef(false);

  useEffect(() => {
    let alive = true;
    if (rows.every((r) => r.done !== null)) { setLoading(false); return; }
    // The prepared answer may have failed (the import was used before it was asked for): then ask now.
    (prepared ? prepared.catch(() => suggestCompanies()) : suggestCompanies())
      .then(({ companies }) => {
        if (!alive) return;
        const found: Record<string, string> = {};
        for (const c of companies) if (c.proposal) found[c.key] = c.proposal;
        setProposals(found);
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Asked once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = rows.filter((r) => r.done === null);
  const known = open.filter((r) => proposals[r.key]);
  const ask = open.filter((r) => !proposals[r.key]);

  const confirm = () => {
    if (sentRef.current) return;
    sentRef.current = true;
    setSent(true);
    const saved: Saved = [];
    const askedAt = new Date().toISOString();
    for (const row of open) {
      const proposal = proposals[row.key];
      const text = (proposal ?? typed[row.key] ?? "").trim().slice(0, MAX_LONG_TEXT);
      if (!text) continue;
      for (const role of row.roles) {
        saved.push({ roleId: role.id, note: { id: newId(), question: companyQuestion(row.name), answer: text, via: [proposal ? "pick" : "type"], askedAt } });
      }
    }
    onDone(saved);
  };

  // Nothing to ask: every company is known or already answered.
  const nothingToAsk = !loading && ask.length === 0;
  useEffect(() => {
    if (nothingToAsk) confirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nothingToAsk]);

  return (
    <>
      <p className="fm-eyebrow">{t("enrich.path.step", { n: 1, total: 4 })}</p>
      <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.path.companies.title")}</h2>
      <p className="rr-lead">{t("enrich.path.companies.lead")}</p>
      {loading && <p className="fm-note" role="status">{t("enrich.path.companies.loading")}</p>}
      {!loading && known.length > 0 && ask.length > 0 && (
        <p className="fm-note">{known.length === 1 ? t("enrich.path.companies.filledOne") : t("enrich.path.companies.filled", { n: known.length })}</p>
      )}
      {!loading && (
        <div className="ep-rows">
          {ask.map((row) => {
            const titleId = `ep-co-${row.key.replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <section key={row.key} className="ep-row" role="group" aria-labelledby={titleId}>
                <h3 className="ep-row-title" id={titleId}>{[row.name, row.location].filter(Boolean).join(" · ")}</h3>
                {row.roles.length > 1 && <p className="ep-row-meta">{row.roles.map((r) => r.title).filter(Boolean).join(", ")}</p>}
                <textarea className="ep-input" rows={2} maxLength={MAX_LONG_TEXT} value={typed[row.key] ?? ""} aria-label={companyQuestion(row.name)}
                  placeholder={t("enrich.path.companies.placeholder")}
                  onChange={(e) => setTyped((d) => ({ ...d, [row.key]: e.target.value }))} />
              </section>
            );
          })}
        </div>
      )}
      <div className="fm-foot">
        <button type="button" className="fm-btn" disabled={loading || sent} onClick={confirm}>{t("enrich.path.companies.confirm")}</button>
      </div>
    </>
  );
}
