import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { SectionKey, TailoredCv, TailorSection } from "@resumora/shared";
import { CoverLetterTab, pickLetter, type LetterOverride } from "./CoverLetterTab.tsx";
import { getJob } from "../jobs/jobs-api.ts";
import { RetailorDialog } from "./RetailorDialog.tsx";
import { remember } from "./TailorFlow.tsx";
import { t } from "../i18n/t.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { AppShell } from "../layout/AppShell.tsx";
import { Editor, type CvSource } from "../cv/Editor.tsx";
import { getTailored, listTailored, retailor, saveTailored } from "./tailored-api.ts";
import { getTemplate } from "../cv/page/templates.ts";
import { LanguageMenu, TailorToolbar, type TailoredTab } from "./TailorToolbar.tsx";
import { GuidedReview } from "./GuidedReview.tsx";
import "../styles/tailor.css";

type ItemReview = { kept?: boolean; inferred?: boolean; reviewed?: boolean };

/** Green = a kept tailoring change; amber = a kept inferred item nobody has reviewed yet. */
export function reviewMarks(review: TailoredCv["review"], content: TailoredCv["content"] | null) {
  const highlights = new Set<string>();
  const inferred = new Set<string>();
  // An added skill is reviewed as "new-skill:<name>" (accept gives it a fresh id): find it by name.
  const skillIds = new Map([...(content?.technicalSkills ?? []), ...(content?.professionalSkills ?? [])]
    .map((skill) => [skill.name.trim().toLowerCase(), skill.id]));
  for (const items of Object.values(review ?? {})) {
    if (!items || typeof items !== "object") continue;
    for (const [key, item] of Object.entries(items as Record<string, ItemReview>)) {
      if (!item?.kept) continue;
      const id = key.startsWith("new-skill:") ? skillIds.get(key.slice("new-skill:".length).trim().toLowerCase()) : key;
      if (!id) continue;
      highlights.add(id);
      if (item.inferred && !item.reviewed) inferred.add(id);
    }
  }
  return { highlights, inferred };
}

/** The page section each tailoring section rewrites ("achievements" in tailoring are the CV's awards). */
const TAILOR_SECTION_OF: Partial<Record<SectionKey, TailorSection>> = {
  experience: "experience", projects: "projects", volunteering: "projects", skills: "skills", summary: "summary", awards: "achievements",
  courses: "courses", publications: "publications", interests: "interests", languages: "languages",
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
  // ?tab=letter opens the cover letter.
  const [tab, setTab] = useState<TailoredTab>(search.get("tab") === "letter" ? "letter" : "cv");
  // GuideA: the guided review of the AI guesses (?review=1 from the done screen, or the Export menu's Review).
  const [guiding, setGuiding] = useState(search.get("review") === "1");
  // Letters written or edited since each copy's row was loaded (switching tabs doesn't refetch the row).
  const [letters, setLetters] = useState<Record<string, LetterOverride>>({});
  const cv = doc.data ?? null;
  const tailoredId = cv?.id;
  const source = useMemo<CvSource | null>(() => tailoredId ? {
    load: async () => asResponse(await getTailored(tailoredId)),
    save: (content, version) => saveTailored(tailoredId, content, version),
  } : null, [tailoredId]);
  // Marks follow the review as loaded; the content only maps added skills to their chips.
  const marks = useMemo(() => reviewMarks(cv?.review ?? null, cv?.content ?? null), [cv?.review, cv?.content]);
  const job = useQuery({ queryKey: ["job", userId, jobId], queryFn: () => getJob(jobId) });
  const navigate = useNavigate();
  // "Tailor again" on the job page opens this page with the Re-tailor dialog already open.
  const [dialog, setDialog] = useState(search.get("retailor") === "1");
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
    return <AppShell><main className="ui-page"><div className="ui-wrap ui-main"><p role="status">{t("app.loading")}</p></div></main></AppShell>;
  }
  if (doc.isError || !cv || !source) {
    return (
      <AppShell>
        <main className="ui-page"><div className="ui-wrap ui-main ui-stack">
          <p role="alert" className="ui-notice ui-notice--bad">{t(doc.isError ? "tailored.loadError" : "tailored.none")}</p>
          <p className="ui-row">
            {doc.isError && <button type="button" className="ui-btn" onClick={() => void doc.refetch()}>{t("tailor.retry")}</button>}
            <Link className="ui-btn ui-btn--quiet" to={`/jobs/${encodeURIComponent(jobId)}`}>{t("tailored.toJob")}</Link>
          </p>
        </div></main>
      </AppShell>
    );
  }

  // updatedAt moves only on the user's own extraction edits (thoughts and status saves leave it).
  const jobChanged = !!job.data?.editedByUser && Date.parse(job.data.updatedAt) > Date.parse(cv.createdAt);
  const template = getTemplate(cv.template).id;
  const page = `/jobs/${encodeURIComponent(jobId)}/cv`;
  const query = `?cv=${encodeURIComponent(cv.id)}`;
  const links = { template: `${page}/template${query}`, export: `${page}/export${query}` };
  const openDialog = () => { setRetailoring({ busy: false, error: false }); setDialog(true); };
  const toolbar = (
    <>
      <TailorToolbar tab={tab} onTab={setTab} template={template} links={links}>
        <LanguageMenu key={cv.id} jobId={jobId} current={{ id: cv.id, language: cv.language }} />
        <button type="button" className="ui-btn ui-btn--sm" onClick={openDialog}>{t("tailored.retailor")}</button>
      </TailorToolbar>
      {jobChanged && (
        <p className="ui-notice tailored-notice" role="status">
          <span>{t("tailored.jobChanged")}</span>{" "}
          <button type="button" className="ui-btn ui-btn--sm" onClick={openDialog}>{t("tailored.jobChangedAction")}</button>
        </p>
      )}
      {dialog && <RetailorDialog busy={retailoring.busy} error={retailoring.error}
        onStart={(sections) => void startRetailor(sections)} onClose={() => setDialog(false)} />}
    </>
  );
  // The guided review saved its own versions: reload the row, and the editor starts again from it.
  const closeGuide = (exporting: boolean) => {
    setGuiding(false);
    if (exporting) return void navigate(links.export);
    void doc.refetch();
  };
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
      key={`${cv.id}:${cv.version}`}
      initial={asResponse(cv)}
      source={source}
      mode="tailored"
      tailored={{
        original: cv.baseSnapshot,
        highlights: marks.highlights,
        inferred: marks.inferred,
        template,
        toolbar,
        sectionAction,
        replacePage: guiding ? <GuidedReview key={cv.id} load={() => getTailored(cv.id)} template={template}
          onClose={() => closeGuide(false)} onExport={() => closeGuide(true)} /> : tab === "letter" ? <CoverLetterTab key={cv.id} cv={cv} job={job.data}
          letter={pickLetter(cv, letters[cv.id])}
          onLetter={(letter) => setLetters((all) => ({ ...all, [cv.id]: { letter, loadedAt: cv.updatedAt } }))} /> : undefined,
      }}
    />
  );
}
