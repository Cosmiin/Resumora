import { blockText, collectJsonLd } from "./generic";
import type { ReaderResult } from "./index";

const ABOUT_JOB_HEADINGS = ["about the job"];
const DETAILS_PANE = '[data-testid="lazy-column"]';
const DESCRIPTION_BOX = '[data-testid="expandable-text-box"]';

export function linkedInJobId(loc: Location): string | null {
  const pathId = loc.pathname.match(/^\/jobs\/view\/[^/]*?(\d+)\/?$/)?.[1];
  if (pathId) return pathId;
  const queryId = new URLSearchParams(loc.search).get("currentJobId");
  return queryId && /^\d+$/.test(queryId) ? queryId : null;
}

export function readLinkedIn(doc: Document, loc: Location): ReaderResult | null {
  const id = linkedInJobId(loc);
  if (!id) return null;

  for (const pane of Array.from(doc.querySelectorAll(DETAILS_PANE))) {
    const heading = Array.from(pane.querySelectorAll("h2")).find((element) =>
      ABOUT_JOB_HEADINGS.includes((element.textContent ?? "").trim().toLowerCase()));
    if (!heading) continue;

    let section = heading.parentElement;
    let description: Element | null = null;
    for (let depth = 0; depth < 3 && section && section !== pane; depth++) {
      description = section.querySelector(DESCRIPTION_BOX);
      if (description || section.tagName === "SECTION") break;
      section = section.parentElement;
    }
    if (!description) return null;

    const range = doc.createRange();
    range.setStart(pane, 0);
    range.setEndBefore(heading);
    const topCard = doc.createElement("div");
    topCard.append(range.cloneContents());

    return {
      url: `https://www.linkedin.com/jobs/view/${id}/`,
      pageText: `${blockText(topCard)}\n\n${blockText(description)}`,
      jsonLd: collectJsonLd(doc),
    };
  }
  return null;
}
