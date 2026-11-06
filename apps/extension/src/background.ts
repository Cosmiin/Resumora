import { createAuth } from "./auth";
import { environments } from "./config";
import { copy } from "./copy";
import { createHandler } from "./handler";
import type { Request } from "./messages";
import { chromeStorage } from "./storage";

export function registerMessages(
  chromeApi: Pick<typeof chrome, "runtime">,
  handler: (req: Request) => Promise<unknown>,
): void {
  chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void Promise.resolve().then(() => handler(message as Request)).then(sendResponse).catch(() => {
      sendResponse({ kind: "error", message: copy.somethingWrong });
    });
    return true;
  });
}

const storage = chromeStorage();
registerMessages(chrome, createHandler({
  storage,
  auth: createAuth({ storage, environments }),
  environments,
}));
