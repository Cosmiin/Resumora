// Zips the built extension (dist/) into the web app's public folder, where the
// "Download the extension" button points. Run through `npm run package -w @resumora/extension`.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const out = resolve(root, "../web/public/downloads/resumora-extension.zip");

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)])));
  return nested.flat();
}

const zip = new JSZip();
// One top folder, so unzipping gives a folder to pick in "Load unpacked".
const folder = zip.folder("resumora-extension");
for (const file of await files(dist)) {
  folder.file(relative(dist, file).replaceAll("\\", "/"), await readFile(file));
}
await mkdir(dirname(out), { recursive: true });
await writeFile(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`Wrote ${relative(resolve(root, "../.."), out)}`);
