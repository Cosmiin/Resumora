import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { localProcessEnvironment } from "./dev-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

export function startDevServers({
  quiet = false,
  webPort = 5173,
  configuration,
  imports = false,
  spawnProcess = spawn,
} = {}) {
  const specs = [
    [
      "api",
      "node_modules/wrangler/bin/wrangler.js",
      ["dev", "--local", "--ip", "127.0.0.1", "--port", "8787"],
      "apps/api",
    ],
    [
      "web",
      "node_modules/vite/bin/vite.js",
      ["--port", String(webPort)],
      "apps/web",
    ],
  ];
  if (imports)
    specs.push(["imports", "scripts/import-worker.mjs", ["--watch"], ""]);
  const children = specs.map(([name, entry, args, cwd]) => {
    const worker = name === "imports";
    const env = localProcessEnvironment(
      process.env,
      worker ? configuration : undefined,
    );
    if (name === "web") {
      env.APP_ORIGIN = env.API_ORIGIN = `http://127.0.0.1:${webPort}`;
    }
    const child = spawnProcess(
      process.execPath,
      [
        ...(worker ? ["--experimental-strip-types"] : []),
        root + entry,
        ...args,
      ],
      {
        cwd: root + cwd,
        env,
        stdio: quiet ? "ignore" : "inherit",
        detached: process.platform !== "win32",
      },
    );
    return { name, child };
  });

  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const { child } of children) {
      if (!child.pid) continue;
      if (process.platform === "win32") {
        // Only terminate the process tree started by this launcher.
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
    }
  }

  return { children, stop };
}
