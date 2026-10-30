import { validateDocumentLocale } from "@resumora/contracts/intelligence/translation";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { DocumentPreview } from "../components/DocumentContent";
import { resolveTemplate } from "../templates/registry";
import type { BaseDraft } from "@resumora/contracts/editor/model";
import { cropRectangle } from "@resumora/contracts/editor/photo";
export type PrintPhoto = { dataUrl: string; width: number; height: number };
/** One content renderer for browser preview and server print, with trusted bundled CSS. */
export function renderPrintHtml(
  draft: BaseDraft,
  css: string,
  photo?: PrintPhoto,
): string {
  validateDocumentLocale(draft.documentLocale ?? (draft.language==="ro"?"ro-RO":"en-GB"));
  if (
    draft.presentation.templateVersionId &&
    !resolveTemplate(draft.presentation.templateVersionId)
  )
    throw new Error("PRINT_TEMPLATE_UNAVAILABLE");
  if (
    !css ||
    css.length > 2_000_000 ||
    css.includes("</style") ||
    /@import|https?:\/\//i.test(css)
  )
    throw new Error("PRINT_STYLES_INVALID");
  if (draft.presentation.photo?.visible && !photo)
    throw new Error("PRINT_PHOTO_NOT_READY");
  const html = renderToStaticMarkup(
    <DocumentPreview
      draft={draft}
      asOf={{ year: "", month: "" }}
      documentOnly
      renderPhoto={(settings) => {
        if (!settings?.visible) return null;
        if (
          !photo ||
          !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(photo.dataUrl)
        )
          throw new Error("PRINT_PHOTO_NOT_READY");
        const rect = cropRectangle(photo.width, photo.height, settings.crop);
        return (
          <span
            className={`document-photo photo-${settings.shape}`}
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: settings.shape === "circle" ? "50%" : 0,
            }}
          >
            <img
              alt=""
              src={photo.dataUrl}
              style={{
                position: "absolute",
                maxWidth: "none",
                width: `${(photo.width / rect.size) * 100}%`,
                height: `${(photo.height / rect.size) * 100}%`,
                left: `${(-rect.x / rect.size) * 100}%`,
                top: `${(-rect.y / rect.size) * 100}%`,
              }}
            />
          </span>
        );
      }}
    />,
  );
  return `<!doctype html><html lang="${draft.documentLocale ?? draft.language}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>${css}\nhtml,body{margin:0;padding:0;background:white}</style></head><body>${html}</body></html>`;
}
