import { createAuth } from "./auth";
import { environments } from "./config";
import { copy } from "./copy";
import { createHandler } from "./handler";
import type { Request } from "./messages";
import { chromeStorage, getEnvId } from "./storage";
import { createSaver } from "./save";
import type { ReaderResult } from "./readers";

type BackgroundChrome = typeof chrome & {
  tabs: { query(query: { active: true; currentWindow: true }): Promise<{ id?: number; url?: string }[]> };
  scripting: {
    executeScript(details: {
      target: { tabId: number }; files?: string[]; func?: () => ReaderResult;
    }): Promise<{ result?: ReaderResult }[]>;
  };
};

export function createBackground(chromeApi: BackgroundChrome, fetchApi: typeof fetch) {
  const storage = chromeStorage(chromeApi);
  const auth = createAuth({ storage, environments, fetch: fetchApi });
  const saver = createSaver({
    auth,
    fetch: fetchApi,
    environment: async () => environments[await getEnvId(storage)],
    activeTab: async () => {
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
      return tab?.id === undefined ? null : { id: tab.id, url: tab.url };
    },
    runReader: async (tabId) => {
      const target = { tabId };
      await chromeApi.scripting.executeScript({ target, files: ["reader.js"] });
      const [read] = await chromeApi.scripting.executeScript({
        target,
        func: () => (globalThis as typeof globalThis & {
          __resumoraReadPage(): ReaderResult;
        }).__resumoraReadPage(),
      });
      if (!read?.result) throw new Error("Reader returned no result");
      return read.result;
    },
  });
  return createHandler({ storage, auth, environments, saver });
}

export function registerMessages(
  chromeApi: Pick<typeof chrome, "runtime">,
  handler: (req: Request) => Promise<unknown>,
): void {
  chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void Promise.resolve().then(() => handler(message as Request)).then(sendResponse).catch(() => {
      sendResponse({ kind: "error", message: copy.somethingWrong, requestId: null });
    });
    return true;
  });
}

registerMessages(chrome, createBackground(chrome as BackgroundChrome, fetch));
