import { canonicalContentLocale } from "@resumora/contracts/editor/content-language";
/** Established base/job aliases retain their historical identity. */
export function documentLocaleKey(locale: string) {
  const canonical = canonicalContentLocale(locale) ?? locale;
  return canonical === "ro-RO"
    ? "ro"
    : canonical === "en-GB"
      ? "en"
      : canonical;
}
export const routes = [
  "home",
  "start",
  "base",
  "review",
  "enrich",
  "history",
  "jobs",
  "account",
] as const;
export type Route = (typeof routes)[number] | "missing";

export type WorkspaceLocation = {
  destination: "profile" | "jobs";
  view:
    | "profile"
    | "enrich"
    | "import"
    | "history"
    | "profile-cv"
    | "jobs"
    | "intake"
    | "job"
    | "missing";
  jobId?: string;
  targetId?: string;
  importId?: string;
  draftId?: string;
  locale?: string;
  panel?: "details" | "cv" | "answers" | "appearance";
  canonical: string;
};
const resource =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function workspaceLocation(hash: string): WorkspaceLocation {
  const legacy: Record<string, string> = {
    home: "/profile",
    base: "/profile",
    start: "/profile/import",
    review: "/profile",
    enrich: "/profile/enrich",
    history: "/profile/history",
    jobs: "/jobs",
    account: "/profile",
  };
  const raw = hash.replace(/^#/, "");
  let path = legacy[raw] ?? (raw || "/profile");
  try {
    const url = new URL(path, "http://local"),
      parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const panel = url.searchParams.get("panel");
    const mode =
      panel && ["details", "cv", "answers", "appearance"].includes(panel)
        ? (panel as WorkspaceLocation["panel"])
        : undefined;
    const canonical = "#" + url.pathname + (mode ? "?panel=" + mode : "");
    if (parts[0] === "profile") {
      if (parts.length === 1)
        return { destination: "profile", view: "profile", canonical };
      if (parts[1] === "history" && parts.length === 2)
        return { destination: "profile", view: "history", canonical };
      if (
        parts[1] === "import" &&
        parts.length <= 3 &&
        (!parts[2] || resource.test(parts[2]))
      )
        return {
          destination: "profile",
          view: "import",
          importId: parts[2],
          canonical,
        };
      if (parts[1] === "enrich" && parts.length <= 3)
        return {
          destination: "profile",
          view: "enrich",
          targetId: parts[2],
          canonical,
        };
      if (
        parts[1] === "cv" &&
        parts.length === 3 &&
        !!canonicalContentLocale(parts[2])
      )
        return {
          destination: "profile",
          view: "profile-cv",
          locale: canonicalContentLocale(parts[2])!,
          canonical,
        };
    }
    if (parts[0] === "jobs") {
      if (parts.length === 1)
        return { destination: "jobs", view: "jobs", canonical };
      if (parts[1] === "new" && parts.length === 3 && resource.test(parts[2]))
        return {
          destination: "jobs",
          view: "intake",
          draftId: parts[2],
          canonical,
        };
      if (
        resource.test(parts[1] ?? "") &&
        (parts.length === 2 ||
          (parts.length === 4 &&
            parts[2] === "cv" &&
            !!canonicalContentLocale(parts[3])))
      )
        return {
          destination: "jobs",
          view: "job",
          jobId: parts[1],
          locale: parts[3] ? canonicalContentLocale(parts[3])! : undefined,
          panel: mode ?? (parts[2] === "cv" ? "cv" : "details"),
          canonical,
        };
    }
  } catch {}
  return { destination: "profile", view: "missing", canonical: "#/profile" };
}
