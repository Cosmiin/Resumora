import { supabase } from "./supabase.ts";

/**
 * What the browser saw go wrong, recorded in `app_errors` so a red message can be traced to its cause: a red message
 * shown (`message`), a failed request to our API (`request`; no status when it never came back), or a failed step of
 * preparing Enrich changes (`step`). Diagnostics only.
 */
export type ErrorRecord = {
  kind: "message" | "request" | "step";
  step?: string; roleId?: string; path?: string; status?: number; code?: string; message?: string; requestId?: string;
};

const cut = (text: string | undefined, n: number) => (text === undefined ? undefined : text.slice(0, n));

/** Sends one record, with the page it happened on. Signed out: nothing is sent. Never throws, never retries. */
export async function reportError(record: ErrorRecord): Promise<void> {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const body = {
      ...record, page: cut(location.pathname, 200), step: cut(record.step, 40), roleId: cut(record.roleId, 100),
      path: cut(record.path, 200), code: cut(record.code, 100), message: cut(record.message, 500), requestId: cut(record.requestId, 100),
    };
    await fetch("/v1/errors", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    // A lost record changes nothing for the person.
  }
}

/** A field's own check while typing (too long, required) is not an error of the app; neither is a plain notice. */
const NOT_AN_ERROR = ".ui-field-error, .sh-error, .ui-notice:not(.ui-notice--bad)";

/** Records every red message (`role="alert"`) as it appears anywhere on the page. Returns the stop function. */
export function watchRedMessages(root: Node = document.body): () => void {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        const alerts = [...(node.matches('[role="alert"]') ? [node] : []), ...node.querySelectorAll('[role="alert"]')];
        for (const el of alerts) {
          const text = el.textContent?.trim() ?? "";
          if (text && !el.matches(NOT_AN_ERROR)) void reportError({ kind: "message", message: text });
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
