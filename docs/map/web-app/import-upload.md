---
id: web-app/import-upload
area: web-app
files: ["apps/web/src/imports/ImportButton.tsx","apps/web/src/imports/imports.test.tsx"]
depends_on: ["web-app/import-client","web-app/api-client","web-app/i18n","api-core/import-files"]
contract: false
checked_hash: 9723d2d3
cited: [8a6a0f, 528469, ed1694, cc7e47, 12ab40, 8cd913, 58a96c, bdc7eb, cc7e47, 2409e3, 0ad34a, ed80ae, 483263, e463aa]
decisions: ["docs/decisions/0004-imports-go-through-a-queue.md"]
open: []
---
Choose and upload a CV file before opening review.

- The local size limit is 5 * 1024 * 1024 bytes and the filename must end in pdf or docx, case-insensitively. `apps/web/src/imports/ImportButton.tsx:7` -> `MAX_BYTES`
- Selection resets the hidden input before inspecting the file, so selecting the same file can trigger again. `apps/web/src/imports/ImportButton.tsx:17` -> `input.current.value = ""`
- An absent file does nothing; unsupported extensions and oversized files set localized errors before any upload. `apps/web/src/imports/ImportButton.tsx:18` -> `if (!file)`
- Successful upload calls onStarted with the response ID, and busy clears in finally. `apps/web/src/imports/ImportButton.tsx:24` -> `onStarted`
- ApiClientError messages are exposed only for nonzero statuses below 500; network, server and other failures use generic upload copy. `apps/web/src/imports/ImportButton.tsx:26` -> `err.status !== 0`
- A forwarded button ref supports caller focus restoration; the button is disabled while uploading. `apps/web/src/imports/ImportButton.tsx:42` -> `ref={ref}`
- tested by `apps/web/src/imports/imports.test.tsx:83` -> `over 5 MB`
- tested by `apps/web/src/imports/imports.test.tsx:90` -> `server's reason`
## Connections
- Uses the multipart client: `apps/web/src/imports/ImportButton.tsx:24` -> `startImport`; `apps/web/src/imports/imports-api.ts:7` -> `apiFetch`
- Filename checks are backed by server byte-format checking, not trusted as proof of file type: `apps/web/src/imports/ImportButton.tsx:20` -> `ACCEPTED.test`; `apps/api/src/imports/routes.ts:36` -> `sniffFormat`
## Assumptions
- The browser check is only early feedback; server-side size and format checks remain authoritative. `apps/web/src/imports/ImportButton.tsx:21` -> `file.size`; `apps/api/src/imports/routes.ts:33` -> `MAX_UPLOAD_BYTES`
