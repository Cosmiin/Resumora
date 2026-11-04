declare module "*print-assets.mjs" {
  export const css: string;
  export function renderPrintHtml(
    draft: import("@resumora/contracts/editor/model").BaseDraft,
    css: string,
    photo?: { dataUrl: string; width: number; height: number },
    asOf?: import("@resumora/contracts/editor/model").PartialDate,
  ): string;
}

declare module "*validation-source.mjs" {
  export const validationSource: string;
}
