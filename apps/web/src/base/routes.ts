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
