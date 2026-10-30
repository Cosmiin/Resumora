// Compatibility module name. Current-only routes are authoritative; historical
// version/restore paths return 410 and cannot read retained content.
export { currentJobDocumentsRoute as jobDocumentsRoute } from './current-documents.ts';
