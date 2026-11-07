import type { ReaderResult } from "./index";

export function collectJsonLd(doc: Document): unknown[] {
  const items: unknown[] = [];
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      items.push(JSON.parse(script.textContent ?? ""));
      if (items.length === 20) break;
    } catch {
      // A broken script should not hide the remaining structured data.
    }
  }
  return items;
}

export function blockText(root: Element): string {
  const parts: string[] = [];
  const blocks = /^(H[1-6]|LI|P|DIV|SECTION|BR|TR|DD|DT)$/;

  function visit(node: Node): void {
    if (node.nodeType === 3) {
      parts.push((node.textContent ?? "").replace(/\s+/g, " "));
      return;
    }
    const block = node.nodeType === 1 && blocks.test((node as Element).tagName);
    if (block) parts.push("\n");
    node.childNodes.forEach(visit);
    if (block) parts.push("\n");
  }

  visit(root);
  return parts.join("").split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean).join("\n");
}

export function readGeneric(doc: Document, loc: Location): ReaderResult {
  const root = doc.querySelector("main") ?? doc.querySelector('[role="main"]')
    ?? doc.querySelector("article") ?? doc.body;
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll("nav, header, footer, aside, script, style, noscript, form")
    .forEach((element) => element.remove());
  return { url: loc.href, pageText: blockText(clone), jsonLd: collectJsonLd(doc) };
}
