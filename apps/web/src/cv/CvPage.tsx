import { useQuery } from "@tanstack/react-query";
import { t } from "../i18n/t.ts";
import { getCv } from "./cv-api.ts";
import { Editor } from "./Editor.tsx";

export function useMyCv() {
  return useQuery({ queryKey: ["cv"], queryFn: getCv, staleTime: Infinity });
}

export function CvPage() {
  const cv = useMyCv();

  if (cv.isPending) return <p className="page-loading">{t("app.loading")}</p>;
  if (cv.isError) {
    return (
      <main className="cv-page">
        <p role="alert">{t("cv.loadError")}</p>
        <button type="button" onClick={() => cv.refetch()}>{t("cv.retry")}</button>
      </main>
    );
  }
  return (
    <main className="cv-page">
      <Editor initial={cv.data} />
    </main>
  );
}
