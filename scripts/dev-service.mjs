import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDevOrigin, readDevAiSummary, readDevConfiguration, importWorkerEnabled, jobWorkerEnabled, serviceUnit } from "./dev-config.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url)).replace(
  /\/$/,
  "",
);
const unit = "resumora-dev.service";
function systemctl(args, capture = false) {
  const result = spawnSync("systemctl", ["--user", ...args], {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error || result.status !== 0)
    throw Error(
      "Local service command failed. Check systemctl --user status resumora-dev.service.",
    );
  return result.stdout?.trim();
}
async function ready(origin) {
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin + "/v1/auth/session", {
        signal: AbortSignal.timeout(1500),
      });
      const body = await response.json().catch(() => null);
      if (
        response.ok &&
        body &&
        typeof body.csrfToken === "string" &&
        typeof body.recovery === "boolean" &&
        "user" in body
      )
        return true;
      if (body?.error?.code === "AUTH_UNCONFIGURED")
        throw Error("AUTH_UNCONFIGURED");
    } catch (error) {
      if (error.message === "AUTH_UNCONFIGURED")
        throw Error(
          "Servers are running, but authentication needs configuration in apps/api/.dev.vars. See docs/setup/authentication.md.",
        );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw Error(
    "Authentication did not become ready. Run npm run dev:status and inspect journalctl --user -u resumora-dev.service.",
  );
}
export function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) =>
      reject(
        new Error(
          error.code === "EADDRINUSE"
            ? `Port ${port} is already in use. Stop the other development server before running npm run dev:start.`
            : `Could not check local port ${port}: ${error.code ?? "unknown error"}.`,
        ),
      ),
    );
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
}
export async function runService(
  command,
  {
    root = workspaceRoot,
    home = homedir(),
    node = process.execPath,
    control = systemctl,
    checkReady = ready,
    checkPort = assertPortFree,
  } = {},
) {
  const directory = path.join(home, ".config/systemd/user");
  const destination = path.join(directory, unit);
  if (!["start", "stop", "status"].includes(command))
    throw Error(
      "Use npm run dev:start, npm run dev:stop, or npm run dev:status.",
    );
  if (process.platform !== "linux")
    throw Error(
      "Persistent startup uses Linux/WSL systemd. Use npm run dev in a terminal on other systems.",
    );
  if (
    existsSync(destination) &&
    !readFileSync(destination, "utf8").startsWith(`# Workspace: ${root}\n`)
  )
    throw Error(
      "A Resumora service belongs to another workspace. Manage it from that workspace before replacing it.",
    );
  if (command === "stop") {
    control(["disable", "--now", unit]);
    return "Resumora stopped; automatic startup disabled.";
  }
  const origin = readDevOrigin(root);
  if (command === "start") {
    // Validate before stopping a healthy instance; a partial config must not replace it.
    const configuration = readDevConfiguration(root);
    importWorkerEnabled(configuration);
    jobWorkerEnabled(configuration);
    mkdirSync(directory, { recursive: true });
    const contents = serviceUnit(root, node);
    const changed =
      !existsSync(destination) ||
      readFileSync(destination, "utf8") !== contents;
    if (changed) writeFileSync(destination, contents, { mode: 0o600 });
    control(["daemon-reload"]);
    // Explicit startup reloads .dev.vars and the selected frontend port.
    // Stop only our owned unit before checking for unrelated listeners.
    control(["stop", unit]);
    await checkPort(Number(new URL(origin).port));
    await checkPort(8787);
    control(["enable", unit]);
    control(["reset-failed", unit]);
    control(["start", unit]);
    await checkReady(origin);
    if (control(["is-active", unit], true) !== "active")
      throw Error(
        "The local service is not active. Run npm run dev:status and inspect journalctl --user -u resumora-dev.service.",
      );
    return `Resumora local development: ${origin}/#/profile\nFrontend, API and configured background processors are managed together.\n${readDevAiSummary(root)}\nRun npm run dev:doctor for the environment report.`;
  } else {
    const state = control(["is-active", unit], true);
    await checkReady(origin);
    return `Service: ${state}\nAuthentication: ready at ${origin}\n${readDevAiSummary(root)}`;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(await runService(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
