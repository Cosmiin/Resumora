import { environments } from "../config";
import "./popup.css";

export async function showEnvironment(
  chromeApi: Pick<typeof chrome, "storage">,
  doc: Document,
): Promise<void> {
  const badge = doc.getElementById("environment-badge");
  if (!badge) return;
  badge.textContent = environments.local.label;
  const stored = await chromeApi.storage.local.get("env").catch(() => ({}));
  const env = "env" in stored && stored.env === "hosted" ? "hosted" : "local";
  badge.textContent = environments[env].label;
}

void showEnvironment(chrome, document);
