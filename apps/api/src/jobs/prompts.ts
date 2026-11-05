export const JOB_PROMPT_VERSION = "job.v1";

export const jobExtractPrompt = `Copy facts from the page. Never invent a company, salary, date or requirement.
Use unknown or null when the page doesn't say.
Keep the posting's original language.
A requirement is must unless the page marks it optional ("nice to have", "a plus", "preferred", "bonus").
One requirement per item; split lists that mix several.
Ignore page chrome: navigation, cookie banners, "similar jobs", ads.
If a JSON-LD JobPosting is given, trust it for title, company, location, salary and dates, and use the text for the rest.
Set isJobPosting: false for pages that are not a single job posting (search results, company home pages, articles).`;

export function buildJobUserPrompt(work: { rawText: string; jsonLd: Record<string, unknown> | null }): string {
  const jsonLd = work.jsonLd === null ? "" : `JSON-LD JobPosting:\n${JSON.stringify(work.jsonLd)}\n\n`;
  return `${jsonLd}Page text:\n${work.rawText.slice(0, 30_000)}`;
}
