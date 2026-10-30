import type { Browser, Page } from "@cloudflare/puppeteer";
import { inspectExportPdf } from "./pdf-structure.ts";
import { validationSource } from "../../.generated/validation-source.mjs";
export type RenderReport = { pages: number; characters: number; bytes: number };
export async function renderAndValidatePdf(
  browser: Browser,
  html: string,
): Promise<{ bytes: Uint8Array; report: RenderReport }> {
  async function page(): Promise<Page> {
    const p = await browser.newPage();
    p.setDefaultTimeout(12000);
    await p.setRequestInterception(true);
    p.on("request", (request) => {
      void (request.url().startsWith("data:") ||
      request.url().startsWith("blob:")
        ? request.continue()
        : request.abort());
    });
    return p;
  }
  const print = await page();
  await print.setJavaScriptEnabled(false);
  await print.setViewport({ width: 665, height: 1000 });
  await print.emulateMediaType("print");
  await print.setContent(html, { waitUntil: "load", timeout: 12000 });
  await print.evaluate(
    "document.fonts.ready.then(()=>Promise.all([...document.images].map(i=>i.decode())))",
  );
  const state = await print.evaluate(`(() => {
    const article=document.querySelector('article.document');
    if(!article || !article.textContent.trim() || document.fonts.status!=='loaded') throw new Error('PRINT_NOT_READY');
    // scrollWidth includes harmless trailing inline whitespace. Check actual
    // non-whitespace text ranges instead, including every wrapped URL line.
    const bounds=article.getBoundingClientRect(), walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()){
      const value=node.textContent ?? '', start=value.search(/\\S/), end=value.trimEnd().length;
      if(start<0)continue;
      const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);
      for(const rect of range.getClientRects())if(rect.width && (rect.left<bounds.left-1 || rect.right>bounds.right+1))throw new Error('PRINT_OVERFLOW');
    }
    return {text:article.textContent,links:[...article.querySelectorAll('a[href]')].map(a=>a.href),paper:'A4'};
  })()`);
  const bytes = await print.pdf({
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    timeout: 12000,
  });
  await inspectExportPdf(bytes);
  const validator = await page();
  await validator.setContent(
    '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'">',
  );
  await validator.addScriptTag({ content: validationSource });
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const report = (await validator.evaluate(
    `globalThis.resumoraValidatePdf(Uint8Array.from(atob(${JSON.stringify(btoa(binary))}),c=>c.charCodeAt(0)),${JSON.stringify(state)})`,
  )) as RenderReport;
  return { bytes, report };
}
