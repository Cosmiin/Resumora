import { GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
export { validatePdf, comparableText } from "./validate";
export type { PdfExpectation, PdfReport } from "./validate";
