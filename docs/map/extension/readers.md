---
id: extension/readers
area: extension
files: ["apps/extension/src/readers/index.ts","apps/extension/src/readers/generic.ts","apps/extension/src/readers/readers.test.ts"]
depends_on: ["extension/linkedin","shared/jobs","api-core/job-processing"]
contract: true
checked_hash: c87ab78f
cited: [66850c, 2421ca, d83705, 5d31f3, e98289, baef26, 3ac02b, d4e1e7, d15b6c, 101740, b9b4de, 88caeb, ea35ef, fa8ed6, 0a9870, 8283d7, 101740, 6dc729, 5d31f3, 713516, f4181c, 444473, 204036, 713516, 8ebad0, f5905b, 204036, 713516, ddebb1, 0b1568, ddebb1, dd5a08, ae1dad, c6b07e, dcdd9c, 1671f9, f19fe4, 4bd115, b3babc, baef26]
decisions: []
open: []
---
Return a common page capture and extract generic text plus bounded JSON-LD script values.

- ReaderResult contains url:string, pageText:string and jsonLd:unknown[]. `apps/extension/src/readers/index.ts:4` -> `ReaderResult`
- Only www.linkedin.com paths beginning /jobs/ attempt the specialized reader; any null result falls through to generic reading. `apps/extension/src/readers/index.ts:11` -> `loc.hostname`
- JSON-LD collection parses application/ld+json scripts independently, ignores malformed JSON and stops at 20 successfully parsed values. `apps/extension/src/readers/generic.ts:5` -> `querySelectorAll`
- Parsed values are preserved without requiring a JobPosting object at collection time. `apps/extension/src/readers/generic.ts:7` -> `JSON.parse`
- Text root priority is main, role=main, article, then body. `apps/extension/src/readers/generic.ts:38` -> `querySelector`
- The selected root is cloned before removing descendant nav, header, footer, aside, script, style, noscript and form elements. `apps/extension/src/readers/generic.ts:40` -> `cloneNode`
- Text traversal collapses whitespace and adds newlines around headings, list items, paragraphs, divs, sections, breaks, table rows and definition-list items. `apps/extension/src/readers/generic.ts:18` -> `blocks`; `apps/extension/src/readers/generic.ts:25` -> `const block`
- The final text drops empty lines and joins remaining lines with newline separators. `apps/extension/src/readers/generic.ts:32` -> `parts.join`
- Generic reading always returns loc.href, cloned-root text and collected JSON-LD; pages without JSON-LD still produce text. `apps/extension/src/readers/generic.ts:43` -> `pageText`
- tested by `apps/extension/src/readers/readers.test.ts:112` -> `general pages`
- tested by `apps/extension/src/readers/readers.test.ts:156` -> `JSON-LD`

## Connections
- Injected entry calls readPage, which dispatches or falls back to readGeneric. `apps/extension/src/reader-entry.ts:8` -> `readPage`; `apps/extension/src/readers/index.ts:10` -> `readPage`; `apps/extension/src/readers/index.ts:15` -> `readGeneric`; `apps/extension/src/readers/generic.ts:37` -> `readGeneric`
- Text size is capped later by the saver, not by DOM traversal. `apps/extension/src/readers/generic.ts:43` -> `blockText`; `apps/extension/src/save.ts:39` -> `30_000`
- Collected JSON-LD is reduced by the API to one JobPosting before being supplied to extraction. `apps/extension/src/readers/generic.ts:7` -> `JSON.parse`; `apps/api/src/jobs/routes.ts:60` -> `findJobPosting`; `packages/shared/src/jobs.ts:112` -> `findJobPosting`
- LinkedIn captures the selected job's URL and text but collects JSON-LD from the whole document; the API takes the first JobPosting among each object and its @graph candidates without matching it to the captured URL. `apps/extension/src/readers/linkedin.ts:40` -> `url`; `apps/extension/src/readers/linkedin.ts:42` -> `collectJsonLd(doc)`; `apps/api/src/jobs/routes.ts:60` -> `findJobPosting`; `packages/shared/src/jobs.ts:116` -> `candidates`; `packages/shared/src/jobs.ts:121` -> `return posting`
- Extraction's system prompt directs the model to trust that JSON-LD for title, company, location, salary and dates over captured text, so document-wide metadata for another job can override the selected job's text for those fields. `apps/extension/src/readers/linkedin.ts:42` -> `collectJsonLd(doc)`; `apps/api/src/jobs/routes.ts:60` -> `findJobPosting`; `apps/api/src/jobs/process.ts:17` -> `jobExtractPrompt`; `apps/api/src/jobs/prompts.ts:15` -> `trust it`
- Downstream processing invokes the system and user prompt templates; the user prompt includes selected JSON-LD and at most 30,000 page-text characters after cutting at the first exact trailing-job marker line. `apps/api/src/jobs/process.ts:17` -> `jobExtractPrompt`; `apps/api/src/jobs/prompts.ts:3` -> `jobExtractPrompt`; `apps/api/src/jobs/process.ts:18` -> `buildJobUserPrompt`; `apps/api/src/jobs/prompts.ts:23` -> `JSON.stringify`; `apps/api/src/jobs/prompts.ts:24` -> `trailingJobs`; `apps/api/src/jobs/prompts.ts:26` -> `slice(0, 30_000)`

## Assumptions
- Text extraction does not check computed visibility; it walks text nodes in the cloned subtree, so CSS-hidden content can be included. `apps/extension/src/readers/generic.ts:21` -> `node.nodeType`; `apps/extension/src/readers/generic.ts:27` -> `childNodes`
- The generic fallback assumes a document body exists when no preferred root is found. `apps/extension/src/readers/generic.ts:39` -> `doc.body`; `apps/extension/src/readers/generic.ts:40` -> `root.cloneNode`
