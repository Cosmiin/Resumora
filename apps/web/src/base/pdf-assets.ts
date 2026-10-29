// Bundle PDF.js resources locally. Uploaded documents and render dependencies never use a CDN.
const resources = import.meta.glob<string>(
  "../../../../node_modules/pdfjs-dist/{standard_fonts,cmaps,wasm}/*.{pfb,ttf,bcmap,wasm}",
  { eager: true, query: "?url&no-inline", import: "default" },
);
async function resource(filename: string) {
  const entry = Object.entries(resources).find(([path]) =>
    path.endsWith(`/${filename}`),
  );
  if (!entry) throw new Error("PDF_RESOURCE_UNAVAILABLE");
  const response = await fetch(entry[1], {
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok) throw new Error("PDF_RESOURCE_UNAVAILABLE");
  return new Uint8Array(await response.arrayBuffer());
}
export class LocalFontData {
  fetch({ filename }: { filename: string }) {
    return resource(filename);
  }
}
export class LocalWasmData {
  fetch({ filename }: { filename: string }) {
    return resource(filename);
  }
}
export class LocalCMapData {
  async fetch({ name }: { name: string }) {
    return { cMapData: await resource(`${name}.bcmap`), compressionType: 1 };
  }
}
