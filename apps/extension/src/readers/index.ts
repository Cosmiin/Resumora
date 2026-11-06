export type ReaderResult = {
  url: string;
  pageText: string;
  jsonLd: unknown[];
};

export function readPage(_doc: Document, loc: Location): ReaderResult {
  return { url: loc.href, pageText: "", jsonLd: [] };
}
