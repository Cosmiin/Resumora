// Compile the SAME renderer without importing browser DOM types into Worker TS.
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const outdir = new URL("../apps/api/.generated/", import.meta.url);
await mkdir(outdir, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ["apps/web/src/export/render.tsx"],
  outfile: fileURLToPath(new URL("renderer.mjs", outdir)),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2023",
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
const styles = await build({
  absWorkingDir: root,
  stdin: {
    contents:
      '@import "./apps/web/src/styles.css"; @import "./apps/web/src/templates/templates.css";',
    resolveDir: root,
    loader: "css",
  },
  bundle: true,
  write: false,
  loader: { ".woff2": "dataurl", ".woff": "dataurl" },
  minify: true,
});
const css = styles.outputFiles[0].text;
await writeFile(
  new URL("print-assets.mjs", outdir),
  `export { renderPrintHtml } from './renderer.mjs';\nexport const css = ${JSON.stringify(css)};\n`,
);

const validator = await build({
  absWorkingDir: root,
  entryPoints: ["apps/web/src/export/validation-runtime.ts"],
  write: false,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2023",
  minify: true,
});
await writeFile(
  new URL("validation-source.mjs", outdir),
  `export const validationSource = ${JSON.stringify(validator.outputFiles[0].text)};\n`,
);
