import type { ReaderResult } from "./readers";

export const JOB_HOSTS = [
  "greenhouse.io", "lever.co", "myworkdayjobs.com", "ashbyhq.com", "smartrecruiters.com",
  "workable.com", "recruitee.com", "teamtailor.com", "personio.de", "personio.com",
  "bamboohr.com", "ejobs.ro", "bestjobs.eu", "hipo.ro",
] as const;

export const JOB_SIGNALS = [
  "responsibilities", "requirements", "qualifications", "apply now", "apply for this",
  "benefits", "full-time", "full time", "part-time", "salary", "job description",
  "about the role", "what you'll do", "what you will do", "years of experience", "we offer",
  "responsabilitati", "cerinte", "aplica", "beneficii", "norma intreaga", "salariu",
  "descrierea jobului", "oferim", "experienta",
] as const;

function hasJobPosting(item: unknown): boolean {
  if (Array.isArray(item)) return item.some(hasJobPosting);
  if (!item || typeof item !== "object") return false;
  const data = item as Record<string, unknown>;
  const types = Array.isArray(data["@type"]) ? data["@type"] : [data["@type"]];
  return types.includes("JobPosting") || hasJobPosting(data["@graph"]);
}

export function looksLikeJob(read: ReaderResult): boolean {
  if (read.jsonLd.some(hasJobPosting)) return true;
  let signals = 0;
  try {
    const url = new URL(read.url);
    const hostMatches = (host: string) => url.hostname === host || url.hostname.endsWith("." + host);
    if (JOB_HOSTS.some(hostMatches)
      || (hostMatches("linkedin.com") && url.pathname.startsWith("/jobs/"))
      || (hostMatches("indeed.com") && (url.pathname.startsWith("/viewjob")
        || url.pathname.startsWith("/rc/clk")))) return true;
    if (/\/(job|jobs|career|careers|cariere|vacancy|vacancies|position|positions|posting)(\/|$)/i.test(url.pathname)) {
      ++signals;
    }
  } catch { /* An invalid URL contributes no job signals. */ }
  const text = read.pageText.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  for (const phrase of JOB_SIGNALS) {
    if (text.includes(phrase) && ++signals >= 2) return true;
  }
  return false;
}
