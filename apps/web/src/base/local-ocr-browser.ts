import workerUrl from "tesseract.js/dist/worker.min.js?url&no-inline";
import coreUrl from "tesseract.js-core/tesseract-core-lstm.wasm.js?url&no-inline";
import englishUrl from "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url&no-inline";
import romanianUrl from "@tesseract.js-data/ron/4.0.0_best_int/ron.traineddata.gz?url&no-inline";
import { LocalPageOcr } from "./local-ocr";
// Explicit local bytes disable Tesseract's default language/CDN and IndexedDB paths.
export function browserPageOcr() {
  return new LocalPageOcr({
    corePath: new URL(coreUrl, location.href).href,
    createPort: () => {
      const worker = new Worker(new URL(workerUrl, location.href));
      return {
        send: (packet) => worker.postMessage(packet),
        onMessage: (receive) =>
          worker.addEventListener("message", (event) => receive(event.data)),
        onError: (receive) => worker.addEventListener("error", () => receive()),
        terminate: () => worker.terminate(),
      };
    },
    models: (signal) =>
      Promise.all(
        [
          ["ron", romanianUrl],
          ["eng", englishUrl],
        ].map(async ([code, url]) => {
          const response = await fetch(url, {
            signal,
            credentials: "same-origin",
            redirect: "error",
          });
          if (!response.ok) throw new Error("OCR_ASSET_UNAVAILABLE");
          return { code, data: new Uint8Array(await response.arrayBuffer()) };
        }),
      ),
  });
}
