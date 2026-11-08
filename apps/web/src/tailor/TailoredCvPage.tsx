import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { SectionKey, TailoredCv, TailorSection } from "@resumora/shared";
import { getJob } from "../jobs/jobs-api.ts";
import { RetailorDialog } from "./RetailorDialog.tsx";
import { remember } from "./TailorFlow.tsx";
import { t } from "../i18n/t.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { AppShell } from "../layout/AppShell.tsx";
import { Editor, type CvSource } from "../cv/Editor.tsx";
import { getScores } from "./tailor-api.ts";
import { getTailored, listTailored, retailor, saveTailored } from "./tailored-api.ts";
import { TailorToolbar, type TailoredTab } from "./TailorToolbar.tsx";
import "../styles/tailor.css";

type ItemReview = { kept?: boolean; inferred?: boolean; reviewed?: boolean };

/** Green = a kept tailoring change; amber = a kept inferred item nobody has reviewed yet. */
export function reviewMarks(review: TailoredCv["review"]) {
  const highlights = new Set<string>();
  const inferred = new Set<string>();
  for (const items of Object.values(review ?? {})) {
    if (!items || typeof items !== "object") continue;
    for (const [key, item] of Object.entries(items as Record<string, ItemReview>)) {
      if (!item?.kept) continue;
      highlights.add(key);
      if (item.inferred && !item.reviewed) inferred.add(key);
    }
  }
  return { highlights, inferred };
}

/** The page section each tailoring section rewrites ("achievements" in tailoring are the CV's awards). */
const TAILOR_SECTION_OF: Partial<Record<SectionKey, TailorSection>> = {
  experience: "experience", skills: "skills", summary: "summary", awards: "achievements", languages: "languages",
};

const asResponse =(cv: TailoredCv) => ({ content: cv.content, version: cv.version, updatedAt: cv.updatedAt });

/** The job's tailored CV (`?cv=<id>` picks a language copy; otherwise the original) in the editor. */
export function TailoredCvPage() {
  const { id: jobId = "" } = useParams();
  const [search] = useSearchParams();
  const wanted = search.get("cv");
  const userId = useAuth().session?.user.id ?? "anonymous";
  const doc = useQuery({
    queryKey: ["tailored", userId, jobId, wanted],
    queryFn: async () => {
      const items = await listTailored(jobId);
      const pick = items.find((i) => i.id === wanted) ?? items.find((i) => i.translatedFrom === null) ?? items[0];
      return pick ? getTailored(pick.id) : null;
    },
    staleTime: Infinity,
    gcTime: 0,
  });
  const scores = useQuery({ queryKey: ["tailored-scores", userId, jobId], queryFn: () => getScores(jobId) });
  const [tab, setTab] = useState<TailoredTab>("cv");
  const cv = doc.data ?? null;
  const tailoredId = cv?.id;
  const source = useMemo<CvSource | null>(() => tailoredId ? {
    load: async () => asResponse(await getTailored(tailoredId)),
    save: (content, version) => saveTailored(tailoredId, content, version),
  } : null, [tailoredId]);
  const marks = useMemo(() => reviewMarks(cv?.review ?? null), [cv?.review]);
  const job = useQuery({ queryKey: ["job", userId, jobId], queryFn: () => getJob(jobId) });
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(false);
  const [retailoring, setRetailoring] = useState<{ busy: boolean; error: boolean }>({ busy: false, error: false });

  /** Starts a run over the picked sections and hands it to the tailoring flow, which resumes the remembered run. */
  async function startRetailor(sections: TailorSection[]) {
    if (!tailoredId || retailoring.busy) return;
    setRetailoring({ busy: true, error: false });
    try {
      const { run } = await retailor(tailoredId, sections);
      remember(jobId, run.id);
      void navigate(`/jobs/${encodeURIComponent(jobId)}/tailor`);
    } catch {
      setRetailoring({ busy: false, error: true });
      setDialog(true);
    }
  }

  if (doc.isPending) {
    return <AppShell><p className="page-loading">{t("app.loading")}</p></AppShell>;
  }
  if (doc.isError || !cv || !source) {
    return (
      <AppShell>
        <main className="page-error">
          <p role="alert">{t(doc.isError ? "tailored.loadError" : "tailored.none")}</p>
          {doc.isError && <button type="button" onClick={() => doc.refetch()}>{t("tailor.retry")}</button>}
          <Link to={`/jobs/${encodeURIComponent(jobId)}`}>{t("tailored.toJob")}</Link>
        </main>
      </AppShell>
    );
  }

  // updatedAt moves only on the user's own extraction edits (thoughts and status saves leave it).
  const jobChanged = !!job.data?.editedByUser && Date.parse(job.data.updatedAt) > Date.parse(cv.createdAt);
  const openDialog = () => { setRetailoring({ busy: false, error: false }); setDialog(true); };
  const toolbar = (
    <>
      <TailorToolbar tab={tab} onTab={setTab} base={scores.data?.base ?? null} latest={cv.score ?? scores.data?.tailored ?? null}>
        <button type="button" className="secondary" aria-disabled="true" title={t("tailored.soon")}>{t("tailored.language")}</button>
        <button type="button" className="secondary" onClick={openDialog}>{t("tailored.retailor")}</button>
      </TailorToolbar>
      {jobChanged && (
        <p className="tailored-notice" role="status">
          <span>{t("tailored.jobChanged")}</span>{" "}
          <button type="button" className="link" onClick={openDialog}>{t("tailored.jobChangedAction")}</button>
        </p>
      )}
      {dialog && <RetailorDialog busy={retailoring.busy} error={retailoring.error}
        onStart={(sections) => void startRetailor(sections)} onClose={() => setDialog(false)} />}
    </>
  );
  const sectionAction = (key: SectionKey) => {
    const section = TAILOR_SECTION_OF[key];
    if (!section) return null;
    const name = t(`tailor.section.${section}`);
    return (
      <button type="button" className="icon-btn tailored-redo" aria-label={t("tailored.retailor.section", { section: name })}
        title={t("tailored.retailor.section", { section: name })} disabled={retailoring.busy} onClick={() => void startRetailor([section])}>↻</button>
    );
  };

  return (
    <Editor
      key={cv.id}
      initial={asResponse(cv)}
      source={source}
      mode="tailored"
      tailored={{
        original: cv.baseSnapshot,
        highlights: marks.highlights,
        inferred: marks.inferred,
        template: cv.template,
        toolbar,
        sectionAction,
        replacePage: tab === "letter" ? <p className="tailored-letter">{t("tailored.letterSoon")}</p> : undefined,
      }}
    />
  );
}
