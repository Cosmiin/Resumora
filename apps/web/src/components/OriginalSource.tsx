import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type {
  Candidate,
  ImportReview,
} from "@resumora/contracts/intelligence/model";
import type { IntelligenceClient } from "../base/intelligence";
import {
  LocalFontData,
  LocalWasmData,
  LocalCMapData,
} from "../base/pdf-assets";
import {
  locateQuote,
  sourceBox,
  type SourceBox,
  type SourceRun,
} from "../base/source-location";
import { Button, useCopy } from "./ui";
export function OriginalSource({
  review,
  candidate,
  client,
}: {
  review: ImportReview;
  candidate?: Candidate;
  client?: IntelligenceClient;
}) {
  const t = useCopy(),
    canvas = useRef<HTMLCanvasElement>(null),
    scroll = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(400);
  const [pdf, setPdf] = useState<PDFDocumentProxy>(),
    [error, setError] = useState(false),
    [attempt, retry] = useState(0);
  const [page, setPage] = useState(candidate?.page ?? 1),
    [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0);
  const [size, setSize] = useState({ width: 1, height: 1 }),
    [boxes, setBoxes] = useState<SourceBox[]>([]),
    [rendered, setRendered] = useState(false);
  useEffect(() => {
    const node = scroll.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width) setPaneWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [error]);
  useEffect(() => {
    if (boxes[0])
      scroll.current?.scrollTo({
        top: Math.max(0, boxes[0].y - 80),
        left: Math.max(0, boxes[0].x - 40),
      });
  }, [boxes]);
  useEffect(() => {
    setPage(candidate?.page ?? 1);
  }, [candidate?.id]);
  useEffect(() => {
    const controller = new AbortController();
    let document: PDFDocumentProxy | undefined;
    setPdf(undefined);
    setError(false);
    setRendered(false);
    setBoxes([]);
    if (canvas.current) canvas.current.width = 0;
    if (review.format !== "pdf" || !client?.original) {
      setError(true);
      return;
    }
    void (async () => {
      const bytes = await client.original!(review.id, controller.signal);
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            bytes as Uint8Array<ArrayBuffer>,
          ),
        ),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== review.sourceHash) throw new Error("SOURCE_MISMATCH");
      if (controller.signal.aborted) return;
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = workerUrl;
      if (controller.signal.aborted) return;
      const loading = getDocument({
        data: bytes,
        isEvalSupported: false,
        maxImageSize: 16_000_000,
        canvasMaxAreaInBytes: 64_000_000,
        useSystemFonts: false,
        useWorkerFetch: false,
        StandardFontDataFactory: LocalFontData,
        WasmFactory: LocalWasmData,
        CMapReaderFactory: LocalCMapData,
      });
      controller.signal.addEventListener(
        "abort",
        () => {
          void loading.destroy();
        },
        { once: true },
      );
      document = await loading.promise;
      if (!controller.signal.aborted) setPdf(document);
    })().catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => {
      controller.abort();
      void document?.destroy();
    };
  }, [client, review.id, review.sourceHash, review.format, attempt]);
  useEffect(() => {
    setBoxes([]);
    setRendered(false);
    if (!pdf) return;
    let active = true,
      task: { cancel(): void } | undefined;
    void (async () => {
      const original = await pdf.getPage(page);
      if (!active || !canvas.current) return;
      const angle = (original.rotate + rotation) % 360;
      const natural = original.getViewport({ scale: 1, rotation: angle });
      const viewport = original.getViewport({
        scale: (paneWidth / natural.width) * zoom,
        rotation: angle,
      });
      if (
        ![viewport.width, viewport.height].every(
          (n) => Number.isFinite(n) && n >= 1 && n <= 16_384,
        ) ||
        viewport.width * viewport.height > 16_000_000
      )
        throw new Error("SOURCE_RENDER_LIMIT");
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      setSize({ width: viewport.width, height: viewport.height });
      const render = original.render({ canvas: canvas.current, viewport });
      task = render;
      await render.promise;
      const text = await original.getTextContent();
      if (!active) return;
      const runs = text.items.filter(
        (item): item is typeof item & SourceRun => "str" in item,
      );
      const matched =
        candidate?.page === page ? locateQuote(runs, candidate.quote) : [];
      // Without the embedded font metrics there is no verified vertical text extent.
      const located = matched.flatMap((run) => {
        const style = text.styles[run.fontName];
        if (!Number.isFinite(style?.ascent) || !Number.isFinite(style?.descent))
          return [];
        return [
          sourceBox(run, style.ascent, style.descent, (x, y) =>
            viewport.convertToViewportPoint(x, y),
          ),
        ];
      });
      setBoxes(located.length === matched.length ? located : []);
      setRendered(true);
    })().catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
      task?.cancel();
    };
  }, [pdf, page, zoom, rotation, candidate?.id, paneWidth]);
  return (
    <aside
      className="card original-source"
      aria-label={t("CV original", "Original CV")}
    >
      <h3>{t("CV original", "Original CV")}</h3>
      <p className="small muted">
        {t(
          "Compară informația cu documentul încărcat.",
          "Compare each field with your uploaded document.",
        )}
      </p>
      {error ? (
        <div role="status">
          <p>
            {t(
              "Previzualizarea originalului nu este disponibilă. Locația nu poate fi verificată. Documentele Word nu au previzualizare PDF.",
              "Original preview unavailable. Source location cannot be verified. Word documents have no PDF preview.",
            )}
          </p>
          <Button onClick={() => retry((n) => n + 1)}>
            {t("Reîncearcă", "Retry")}
          </Button>
        </div>
      ) : (
        <>
          <div className="actions source-controls">
            <Button
              disabled={page <= 1}
              onClick={() => setPage((n) => n - 1)}
              aria-label={t("Pagina anterioară", "Previous page")}
            >
              ←
            </Button>
            <span>
              {page} / {review.pages}
            </span>
            <Button
              disabled={page >= (review.pages ?? 1)}
              onClick={() => setPage((n) => n + 1)}
              aria-label={t("Pagina următoare", "Next page")}
            >
              →
            </Button>
            <Button
              onClick={() => setZoom((n) => Math.max(0.5, n - 0.25))}
              aria-label={t("Micșorează", "Zoom out")}
            >
              −
            </Button>
            <Button
              onClick={() => setZoom((n) => Math.min(2, n + 0.25))}
              aria-label={t("Mărește", "Zoom in")}
            >
              +
            </Button>
            <Button onClick={() => setRotation((n) => (n + 90) % 360)}>
              {t("Rotește", "Rotate")}
            </Button>
          </div>
          <p role="status" className="small">
            {!rendered
              ? t("Deschidem pagina…", "Opening page…")
              : boxes.length
                ? t(
                    "Potrivire exactă în textul original, marcată mai jos.",
                    "Exact match in original text, boxed below.",
                  )
                : t(
                    "Locație indisponibilă: scanare, text diferit sau potrivire ambiguă. Verifică pagina originală.",
                    "Location unavailable: scan, differing text or ambiguous match. Check the original page.",
                  )}
          </p>
          <div
            ref={scroll}
            className="source-scroll"
            style={{ visibility: rendered ? "visible" : "hidden" }}
          >
            <div
              className="source-page"
              style={{ width: size.width, height: size.height }}
            >
              <canvas
                ref={canvas}
                aria-label={t(
                  "Pagina documentului original",
                  "Original document page",
                )}
              />
              {boxes.map((box, i) => (
                <span
                  key={i}
                  className="source-box"
                  style={{
                    left: box.x,
                    top: box.y,
                    width: box.width,
                    height: box.height,
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
      {candidate && (
        <blockquote>
          <p>{candidate.quote}</p>
          <small>
            {t("Citat extras · pagina", "Extracted quote · page")}{" "}
            {candidate.page ?? "?"}
          </small>
        </blockquote>
      )}
    </aside>
  );
}
