import { readGeneric } from "./generic";
import { readLinkedIn } from "./linkedin";

export type ReaderResult = {
  url: string;
  pageText: string;
  jsonLd: unknown[];
};

export function readPage(doc: Document, loc: Location): ReaderResult {
  if (loc.hostname === "www.linkedin.com" && loc.pathname.startsWith("/jobs/")) {
    const result = readLinkedIn(doc, loc);
    if (result) return result;
  }
  return readGeneric(doc, loc);
}
