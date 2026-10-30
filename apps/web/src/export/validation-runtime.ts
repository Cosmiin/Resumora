// Runs in the SAME bounded browser session on a separate network-denied page.
import { validatePdf } from "./validate";
import * as pdfjsWorker from "pdfjs-dist-export/build/pdf.worker.mjs";
Object.assign(globalThis, { pdfjsWorker, resumoraValidatePdf: validatePdf });
