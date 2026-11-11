/**
 * Where to go after logging in: the page that asked for the login (kept in the router state by RequireAuth
 * and carried along the links between the sign-in pages), or My CV. Only paths on this site are accepted.
 */
export function returnTo(state: unknown): string {
  const from = (state as { from?: { pathname?: unknown; search?: unknown } } | null)?.from;
  if (typeof from?.pathname !== "string" || !from.pathname.startsWith("/") || from.pathname.startsWith("//")) return "/cv";
  return from.pathname + (typeof from.search === "string" ? from.search : "");
}
