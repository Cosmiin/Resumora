import { CreateJobBodySchema, type CreateJobBody } from "@resumora/shared";
import { postJob } from "./api";
import type { Auth } from "./auth";
import { copy } from "./copy";
import type { EnvConfig } from "./environments";
import type { SaveResult } from "./messages";
import type { ReaderResult } from "./readers";

export function createSaver(deps: {
  activeTab(): Promise<{ id: number; url?: string } | null>;
  runReader(tabId: number): Promise<ReaderResult>;
  auth: Pick<Auth, "accessToken" | "refresh" | "signOut">;
  fetch: typeof fetch;
  environment(): Promise<EnvConfig>;
}): { saveActiveTab(): Promise<SaveResult> } {
  const running = new Map<string, Promise<SaveResult>>();
  const error = (message: string, requestId: string | null = null): SaveResult => ({
    kind: "error", message, requestId,
  });
  const save = async (tabId: number, env: EnvConfig): Promise<SaveResult> => {
    let read: ReaderResult;
    try {
      read = await deps.runReader(tabId);
    } catch {
      return { kind: "cantRead" };
    }
    const couldntRead = (): SaveResult => ({
      kind: "couldntRead", pasteUrl: `${env.webUrl}/jobs?add=${encodeURIComponent(read.url)}`,
    });
    const text = read.pageText.trim();
    if (text.length < 200) return couldntRead();
    const body: CreateJobBody = {
      url: read.url, pageText: text.slice(0, 30_000), jsonLd: read.jsonLd.slice(0, 20),
    };
    const size = () => new TextEncoder().encode(JSON.stringify(body)).byteLength;
    if (size() > 100_000) delete body.jsonLd;
    if (size() > 100_000) return error(copy.tooLarge);
    const parsed = CreateJobBodySchema.safeParse(body);
    if (!parsed.success) return error(copy.somethingWrong);
    const access = await deps.auth.accessToken(env.id);
    if (access === null) return { kind: "signedOut", message: null };
    if ("expired" in access) return { kind: "signedOut", message: copy.expired };
    if ("offline" in access) return error(copy.cantReach(env.id));
    const post = (token: string) => postJob({
      fetch: deps.fetch, apiUrl: env.apiUrl, token, body: parsed.data,
    });
    let outcome = await post(access.token);
    if (outcome.kind === "unauthorized") {
      const token = await deps.auth.refresh(env.id).catch(() => null);
      if (token) outcome = await post(token);
      if (!token || outcome.kind === "unauthorized") {
        await deps.auth.signOut(env.id);
        return { kind: "signedOut", message: copy.expired };
      }
    }
    switch (outcome.kind) {
      case "saved":
      case "existing":
        return { kind: outcome.kind, openUrl: `${env.webUrl}/jobs/${outcome.id}` };
      case "network":
        return error(copy.cantReach(env.id));
      case "failed":
        switch (outcome.code) {
          case "invalid_url": return error(copy.invalidUrl);
          case "text_too_short": return couldntRead();
          case "payload_too_large": return error(copy.tooLarge);
          case "job_limit": return error(outcome.message ?? copy.somethingWrong);
          default: return error(copy.somethingWrong, outcome.requestId);
        }
      default:
        return error(copy.somethingWrong);
    }
  };
  return {
    async saveActiveTab() {
      try {
        const tab = await deps.activeTab();
        if (!tab?.url || !["http:", "https:"].includes(new URL(tab.url).protocol)) {
          return { kind: "cantRead" };
        }
        const env = await deps.environment();
        const key = `${env.id}:${tab.id}`;
        const current = running.get(key);
        if (current) return current;
        const promise = save(tab.id, env).catch(() => error(copy.somethingWrong))
          .finally(() => { running.delete(key); });
        running.set(key, promise);
        return promise;
      } catch {
        return { kind: "cantRead" };
      }
    },
  };
}
