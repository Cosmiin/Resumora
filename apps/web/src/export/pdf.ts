import { GlobalWorkerOptions } from "pdfjs-dist-export";
import workerUrl from "pdfjs-dist-export/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
export { validatePdf, comparableText } from "./validate";
export type { PdfExpectation, PdfReport } from "./validate";
