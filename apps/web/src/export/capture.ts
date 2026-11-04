import type { PdfExpectation } from "./pdf";
export type PrintCapture = {
  html: string;
  expected: PdfExpectation;
};
const escapeAttribute = (value: string) =>
  value.replace(
    /[&"<>]/g,
    (char) =>
      ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[char]!,
  );

async function dataUrl(response: Response): Promise<string> {
  if (!response.ok) throw new Error("PRINT_RESOURCE_UNAVAILABLE");
  const blob = await response.blob();
  if (blob.size > 2_000_000) throw new Error("PRINT_RESOURCE_LIMIT");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Captures ONLY the shared read-only document DOM, local CSS/fonts and decoded portrait.
 * This is a rendering input, not proof of acceptance/ownership: the Worker must pin
 * its owned accepted version before authorizing rendering. Never accepts arbitrary URLs.
 */
export async function capturePrintDocument(
  article: HTMLElement,
  paper: "A4" | "Letter" = "A4",
): Promise<PrintCapture> {
  if (
    !article.matches("article.document") ||
    article.querySelector("[contenteditable], .preview-edit")
  )
    throw new Error("PRINT_READ_ONLY_REQUIRED");
  if (article.querySelector(".photo-unavailable, [role=status]"))
    throw new Error("PRINT_PHOTO_NOT_READY");
  await document.fonts.ready;
  if (document.fonts.status !== "loaded")
    throw new Error("PRINT_FONTS_NOT_READY");
  const clone = article.cloneNode(true) as HTMLElement;
  for (const [index, canvas] of [
    ...article.querySelectorAll("canvas"),
  ].entries()) {
    if (canvas.dataset.photoReady !== "true")
      throw new Error("PRINT_PHOTO_NOT_READY");
    const image = document.createElement("img");
    image.src = canvas.toDataURL("image/png");
    image.className = canvas.className;
    image.alt = "";
    clone.querySelectorAll("canvas")[index]?.replaceWith(image);
  }
  if (
    clone.querySelector(
      "script, iframe, object, embed, input, button, video, audio, svg",
    )
  )
    throw new Error("PRINT_UNSUPPORTED_CONTENT");
  const links = [...clone.querySelectorAll("a[href]")].map((a) =>
    a.getAttribute("href")!,
  );
  if (links.some((url) => !/^(https?:|mailto:|tel:)/i.test(url)))
    throw new Error("PRINT_LINK_INVALID");
  let css = "";
  for (const sheet of [...document.styleSheets]) {
    if (sheet.href && new URL(sheet.href).origin !== location.origin)
      throw new Error("PRINT_EXTERNAL_STYLE");
    css += [...sheet.cssRules].map((rule) => rule.cssText).join("\n") + "\n";
  }
  const resources = [
    ...new Set(
      [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]),
    ),
  ];
  for (const resource of resources) {
    if (resource.startsWith("data:")) continue;
    const url = new URL(resource, document.baseURI);
    if (
      url.origin !== location.origin ||
      !/\.(woff2?|ttf)(\?|$)/.test(url.pathname)
    )
      throw new Error("PRINT_EXTERNAL_RESOURCE");
    const encoded = await dataUrl(
      await fetch(url, { credentials: "omit", redirect: "error" }),
    );
    css = css.split(resource).join(encoded);
  }
  // A dedicated page contains the same article/styles without application chrome.
  // Print rules are shared; paper is a deterministic presentation choice.
  css += `\n@page { size: ${paper}; margin: 15mm 17mm; }\nhtml, body { margin:0; padding:0; background:white; }`;
  if (css.includes("</style")) throw new Error("PRINT_STYLE_INVALID");
  return {
    html: `<!doctype html><html lang="${escapeAttribute(article.lang)}" dir="${article.dir === "rtl" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>${css}</style></head><body>${clone.outerHTML}</body></html>`,
    expected: { text: article.textContent ?? "", links, paper },
  };
}
