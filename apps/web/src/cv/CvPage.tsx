import { useQuery } from "@tanstack/react-query";
import { t } from "../i18n/t.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { getCv } from "./cv-api.ts";
import { Editor } from "./Editor.tsx";

/**
 * The signed-in user's CV. Keyed by user id and dropped from the cache as soon as the
 * editor unmounts (e.g. on sign-out), so a later sign-in always loads fresh data and
 * never shows another account's CV.
 */
export function useMyCv() {
  const userId = useAuth().session?.user.id ?? "anonymous";
  return useQuery({ queryKey: ["cv", userId], queryFn: getCv, staleTime: Infinity, gcTime: 0 });
}

export function CvPage() {
  const cv = useMyCv();
  const userId = useAuth().session?.user.id ?? "anonymous";

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
      <Editor key={userId} initial={cv.data} />
    </main>
  );
}
