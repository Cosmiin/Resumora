import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { TailoredCv } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { AppShell } from "../layout/AppShell.tsx";
import { Editor, type CvSource } from "../cv/Editor.tsx";
import { getScores } from "./tailor-api.ts";
import { getTailored, listTailored, saveTailored } from "./tailored-api.ts";
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

const asResponse = (cv: TailoredCv) => ({ content: cv.content, version: cv.version, updatedAt: cv.updatedAt });

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

  const toolbar = (
    <TailorToolbar tab={tab} onTab={setTab} base={scores.data?.base ?? null} latest={cv.score ?? scores.data?.tailored ?? null}>
      <button type="button" className="secondary" aria-disabled="true" title={t("tailored.soon")}>{t("tailored.language")}</button>
      <button type="button" className="secondary" aria-disabled="true" title={t("tailored.soon")}>{t("tailored.retailor")}</button>
    </TailorToolbar>
  );

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
        replacePage: tab === "letter" ? <p className="tailored-letter">{t("tailored.letterSoon")}</p> : undefined,
      }}
    />
  );
}
