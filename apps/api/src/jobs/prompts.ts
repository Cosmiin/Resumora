export const JOB_PROMPT_VERSION = "job.v3";

export const jobExtractPrompt = `Copy facts from the page. Never invent a company, salary, date or requirement.
Use unknown or null when the page doesn't say.
Write applyBy as YYYY-MM-DD, copying the year exactly as the page writes it; when the page gives a day and month without a year, use the next such date on or after today.
Keep the posting's original language.
A requirement is must unless the page marks it optional ("nice to have", "a plus", "preferred", "bonus").
One requirement per item; split lists that mix several.
Keep every text short and skimmable:
summary: at most two sentences: what the company is or does, and what the role is for. No benefits, no hype, no requirements.
requirements: one requirement per item, a short line (aim for under 10 words); keep the ad's exact terms for tools, methods, degrees and languages, because they are ATS keywords ("BPMN", "Power BI", "Fluent English"). No duplicates.
responsibilities: short phrases starting with a verb, no duplicates, nothing already listed as a requirement.
benefits: short phrases ("Private medical care"), no duplicates.
Ignore page chrome: navigation, cookie banners, "similar jobs", ads.
If a JSON-LD JobPosting is given, trust it for title, company, location, salary and dates, and use the text for the rest.
If the page says the position is closed or no longer accepting applications ("This position is no longer open for recruitment"), it is still a job posting: set isJobPosting: true and positionClosed: true. Otherwise set positionClosed: false.
Set isJobPosting: false for pages that are not a single job posting (search results, company home pages, articles).`;

export function buildJobUserPrompt(
  work: { rawText: string; jsonLd: Record<string, unknown> | null },
  today: string,
): string {
  const jsonLd = work.jsonLd === null ? "" : `JSON-LD JobPosting:\n${JSON.stringify(work.jsonLd)}\n\n`;
  const trailingJobs = work.rawText.search(/^[^\S\r\n]*(?:Similar jobs|Next job|See all)[^\S\r\n]*\r?$/im);
  const pageText = trailingJobs < 0 ? work.rawText : work.rawText.slice(0, trailingJobs);
  return `Today's date: ${today}.\n${jsonLd}Page text:\n${pageText.slice(0, 30_000)}`;
}
