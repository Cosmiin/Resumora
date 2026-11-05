import { useState, type FormEvent } from "react";
import { JobExtractionSchema, type Job, type JobExtraction } from "@resumora/shared";
import { ApiClientError } from "../lib/api.ts";
import { t } from "../i18n/t.ts";
import { patchJob } from "./jobs-api.ts";

type Props = {
  id: string;
  version: number;
  extracted: JobExtraction;
  onSaved: (job: Job) => Promise<void>;
  onCancel: () => void;
  onReload: () => Promise<void>;
};

const fields = JobExtractionSchema.shape;
const lines = (value: string, limit: number) => value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, limit);

export function JobEditForm({ id, version: currentVersion, extracted, onSaved, onCancel, onReload }: Props) {
  const [version] = useState(currentVersion);
  const [draft, setDraft] = useState(extracted);
  const [salaryMin, setSalaryMin] = useState(extracted.salary?.min?.toString() ?? "");
  const [salaryMax, setSalaryMax] = useState(extracted.salary?.max?.toString() ?? "");
  const [currency, setCurrency] = useState(extracted.salary?.currency ?? "");
  const [period, setPeriod] = useState<NonNullable<JobExtraction["salary"]>["period"]>(extracted.salary?.period ?? null);
  const [responsibilities, setResponsibilities] = useState(extracted.responsibilities.join("\n"));
  const [benefits, setBenefits] = useState(extracted.benefits.join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!draft.title.trim()) {
      setError({ code: "title", message: t("edit.job.titleRequired") });
      return;
    }
    if ([responsibilities, benefits].some((value) => value.split("\n").some((line) => line.trim().length > 500))) {
      setError({ code: "lineTooLong", message: t("edit.job.lineTooLong") });
      return;
    }
    setSaving(true);
    setError(null);
    const value: JobExtraction = {
      ...draft,
      title: draft.title.trim(), company: draft.company?.trim() || null, location: draft.location?.trim() || null,
      summary: draft.summary.trim(), applyBy: draft.applyBy || null,
      requirements: draft.requirements.map((row) => ({ ...row, text: row.text.trim() })).filter((row) => row.text),
      responsibilities: lines(responsibilities, 40), benefits: lines(benefits, 30),
      salary: !salaryMin && !salaryMax && !currency.trim() && !period ? null : {
        min: salaryMin === "" ? null : Number(salaryMin), max: salaryMax === "" ? null : Number(salaryMax),
        currency: currency.trim() || null, period,
      },
    };
    try {
      await onSaved(await patchJob(id, version, value));
    } catch (cause) {
      const code = cause instanceof ApiClientError ? cause.code : "unknown";
      setError({ code, message: cause instanceof ApiClientError && (code === "version_conflict" || code === "wrong_status")
        ? cause.message : t(code === "network" ? "api.network" : "jobs.error.generic") });
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    try {
      await onReload();
    } catch (cause) {
      setError({ code: "version_conflict", message: t(
        cause instanceof ApiClientError && cause.code === "network" ? "api.network" : "jobs.error.generic",
      ) });
    }
  }

  function changeRequirement(index: number, value: Partial<JobExtraction["requirements"][number]>) {
    setDraft((previous) => ({ ...previous,
      requirements: previous.requirements.map((row, i) => i === index ? { ...row, ...value } : row),
    }));
  }

  return <form className="form job-panel" onSubmit={(event) => void save(event)}>
    <div><h1 className="vtitle">{t("edit.job.title")}</h1><p className="jobs-note">{t("edit.job.hint")}</p></div>
    <label className="field">{t("edit.job.jobTitle")}
      <input value={draft.title} aria-invalid={error?.code === "title"} aria-describedby={error?.code === "title" ? "job-edit-error" : undefined}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
    </label>
    <div className="grid2">
      {(["company", "location"] as const).map((key) => <label className="field" key={key}>{t(`edit.job.${key}`)}
        <input value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
      </label>)}
    </div>
    <div className="grid3">
      {([
        ["workMode", "workMode", "job.workMode"], ["employmentType", "type", "job.type"], ["seniority", "seniority", "job.seniority"],
      ] as const).map(([key, label, prefix]) => <label className="field" key={key}>{t(`edit.job.${label}`)}
        <select value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}>
          {fields[key].options.map((value) => <option key={value} value={value}>{t(`${prefix}.${value}` as Parameters<typeof t>[0])}</option>)}
        </select>
      </label>)}
    </div>
    <label className="field">{t("edit.job.summary")}
      <textarea rows={3} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
    </label>
    <div className="grid2">
      <label className="field">{t("edit.job.salaryMin")}<input type="number" step="any" value={salaryMin} onChange={(event) => setSalaryMin(event.target.value)} /></label>
      <label className="field">{t("edit.job.salaryMax")}<input type="number" step="any" value={salaryMax} onChange={(event) => setSalaryMax(event.target.value)} /></label>
      <label className="field">{t("edit.job.currency")}<input value={currency} onChange={(event) => setCurrency(event.target.value)} /></label>
      <label className="field">{t("edit.job.period")}
        <select value={period ?? ""} onChange={(event) => setPeriod(event.target.value as typeof period || null)}>
          <option value="">{t("edit.job.periodNone")}</option>
          {fields.salary.unwrap().shape.period.unwrap().options.map((value) => <option key={value} value={value}>{t(`job.period.${value}`)}</option>)}
        </select>
      </label>
    </div>
    <label className="field">{t("edit.job.applyBy")}
      <input type="date" value={draft.applyBy ?? ""} onChange={(event) => setDraft({ ...draft, applyBy: event.target.value })} />
    </label>
    <div className="field">
      <span className="lbl">{t("edit.job.requirements", { n: draft.requirements.length })}</span>
      {draft.requirements.map((row, index) => <div className="req-edit" key={index}>
        <input aria-label={t("edit.job.requirement", { n: index + 1 })} maxLength={500} value={row.text}
          onChange={(event) => changeRequirement(index, { text: event.target.value })} />
        <div className="seg" role="group" aria-label={t("edit.job.kind")}>
          {(["must", "nice"] as const).map((kind) => <button key={kind} type="button" aria-pressed={row.kind === kind}
            onClick={() => changeRequirement(index, { kind })}>{t(kind === "must" ? "edit.job.mustShort" : "edit.job.niceShort")}</button>)}
        </div>
        <select aria-label={t("edit.job.category")} value={row.category}
          onChange={(event) => changeRequirement(index, { category: event.target.value as typeof row.category })}>
          {fields.requirements.element.shape.category.options.map((value) => <option key={value} value={value}>{t(`job.category.${value}`)}</option>)}
        </select>
        <button className="x" type="button" aria-label={t("edit.job.remove", { n: index + 1 })}
          onClick={() => setDraft({ ...draft, requirements: draft.requirements.filter((_, i) => i !== index) })}>×</button>
      </div>)}
      <button className="link" type="button" disabled={draft.requirements.length >= 60}
        onClick={() => setDraft({ ...draft, requirements: [...draft.requirements, { text: "", kind: "must", category: "skill" }] })}>{t("edit.job.addRequirement")}</button>
    </div>
    <div className="field">
      <label htmlFor="job-responsibilities">{t("edit.job.responsibilities")}</label>
      <textarea id="job-responsibilities" rows={3} aria-describedby="job-responsibilities-hint" value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} />
      <p id="job-responsibilities-hint" className="jobs-note">{t("edit.job.onePerLine")}</p>
    </div>
    <div className="field">
      <label htmlFor="job-benefits">{t("edit.job.benefits")}</label>
      <textarea id="job-benefits" rows={3} aria-describedby="job-benefits-hint" value={benefits} onChange={(event) => setBenefits(event.target.value)} />
      <p id="job-benefits-hint" className="jobs-note">{t("edit.job.onePerLine")}</p>
    </div>
    {error && <div role="alert" id="job-edit-error" className="jobs-field-error">{error.message}
      {error.code === "version_conflict" && <> <button className="link" type="button" disabled={saving} onClick={() => void reload()}>{t("edit.job.reload")}</button></>}
    </div>}
    <div className="form-foot">
      <button type="submit" disabled={saving}>{t(saving ? "edit.job.saving" : "edit.job.save")}</button>
      <button type="button" className="secondary" disabled={saving} onClick={onCancel}>{t("edit.job.cancel")}</button>
    </div>
  </form>;
}
