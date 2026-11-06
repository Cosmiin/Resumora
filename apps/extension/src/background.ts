export function registerMessages(chromeApi: Pick<typeof chrome, "runtime">): void {
  chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (typeof message === "object" && message !== null &&
        "type" in message && message.type === "ping") {
      sendResponse({ ok: true });
    }
  });
}

registerMessages(chrome);
