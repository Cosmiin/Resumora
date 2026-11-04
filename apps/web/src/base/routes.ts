import { canonicalContentLocale } from "@resumora/contracts/editor/content-language";
/** Established Base aliases retain their historical identity. */
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
  "account",
] as const;
export type Route = (typeof routes)[number] | "missing";

export type WorkspaceLocation = {
  destination: "profile";
  view: "profile" | "enrich" | "import" | "history" | "profile-cv" | "missing";
  targetId?: string;
  importId?: string;
  locale?: string;
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
    account: "/profile",
  };
  const raw = hash.replace(/^#/, "");
  let path = legacy[raw] ?? (raw || "/profile");
  try {
    const url = new URL(path, "http://local"),
      parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const canonical = "#" + url.pathname;
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
  } catch {}
  return { destination: "profile", view: "missing", canonical: "#/profile" };
}
