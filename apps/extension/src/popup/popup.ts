import { copy } from "../copy";
import type { EnvId } from "../environments";
import type { PopupState, Request, SaveResult, SignInReply } from "../messages";
import { renderView, type View, type ViewActions } from "./view";
import "./popup.css";

type PopupChrome = {
  runtime: { sendMessage(request: Request): Promise<unknown> };
  tabs: {
    query(query: { active: true; currentWindow: true }): Promise<{ url?: string }[]>;
    create(details: { url: string }): Promise<unknown>;
  };
};

function isPopupState(reply: unknown): reply is PopupState {
  return !!reply && typeof reply === "object"
    && "env" in reply && (reply.env === "local" || reply.env === "hosted")
    && "environments" in reply && Array.isArray(reply.environments)
    && reply.environments.every((env) => env && typeof env === "object"
      && (env.id === "local" || env.id === "hosted")
      && typeof env.label === "string" && typeof env.configured === "boolean");
}

function isSignInReply(reply: unknown): reply is SignInReply {
  return !!reply && typeof reply === "object" && "ok" in reply && typeof reply.ok === "boolean"
    && (reply.ok ? "state" in reply && isPopupState(reply.state)
      : "message" in reply && typeof reply.message === "string");
}

function isSaveResult(reply: unknown): reply is SaveResult {
  return !!reply && typeof reply === "object" && "kind" in reply && typeof reply.kind === "string"
    && ["saved", "existing", "couldntRead", "cantRead", "signedOut", "error"].includes(reply.kind);
}

export async function startPopup(
  chromeApi: PopupChrome,
  doc: Document,
): Promise<void> {
  const root = doc.querySelector("main")!;
  const footer = doc.querySelector("footer")!;
  const badge = doc.getElementById("environment-badge")!;
  let state: PopupState | undefined;
  let version = 0;
  const send = (request: Request) => chromeApi.runtime.sendMessage(request);
  const show = (view: View) => {
    const current = isPopupState(state) ? state : undefined;
    badge.textContent = current?.environments.find((env) => env.id === current.env)?.label ?? "";
    footer.replaceChildren();
    if (current?.email) {
      const email = doc.createElement("p");
      email.textContent = current.email;
      const signOut = doc.createElement("button");
      signOut.textContent = copy.signOut;
      signOut.addEventListener("click", actions.signOut);
      const label = doc.createElement("label");
      label.textContent = copy.connectTo;
      const select = doc.createElement("select");
      for (const env of current.environments) {
        const unavailable = env.id === "hosted" && !env.configured;
        const option = doc.createElement("option");
        option.value = env.id;
        option.textContent = `${env.label}${unavailable ? ` ${copy.notSetUp}` : ""}`;
        option.disabled = unavailable;
        select.append(option);
      }
      select.value = current.env;
      select.addEventListener("change", () => actions.setEnvironment(select.value as EnvId));
      label.append(select);
      footer.append(email, signOut, label);
    }
    renderView(root, view, actions);
  };
  const showState = () => {
    if (!isPopupState(state)) { fail(); return; }
    show(state.email ? { kind: "ready", state }
      : { kind: "signedOut", state, message: null, error: null });
  };
  const fail = () => show({ kind: "error", message: copy.somethingWrong, requestId: null });
  const save = async () => {
    const current = ++version;
    show({ kind: "saving", where: "" });
    void chromeApi.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (current !== version) return;
      let where = "";
      try {
        const url = new URL(tab?.url ?? "");
        where = url.host + url.pathname;
      } catch { /* Pages without a URL have no location to display. */ }
      show({ kind: "saving", where });
    }).catch(() => {});
    try {
      const result = await send({ type: "saveActiveTab" });
      if (current !== version) return;
      ++version;
      if (!isSaveResult(result)) { fail(); return; }
      if (result.kind === "signedOut") {
        if (!isPopupState(state)) { fail(); return; }
        state = { ...state, email: null };
        show({ kind: "signedOut", state, message: result.message, error: null });
      } else show(result);
    } catch {
      if (current === version) { ++version; fail(); }
    }
  };
  const changeState = async (request: Request) => {
    const current = ++version;
    try {
      const next = await send(request);
      if (current !== version) return;
      if (!isPopupState(next)) { fail(); return; }
      state = next;
      showState();
    } catch {
      if (current === version) fail();
    }
  };
  const actions: ViewActions = {
    signIn: async (email, password) => {
      const current = ++version;
      try {
        const reply = await send({ type: "signIn", email, password });
        if (current !== version) return;
        if (!isSignInReply(reply)) { fail(); return; }
        if (reply.ok) { state = reply.state; showState(); }
        else if (isPopupState(state)) show({ kind: "signedOut", state, message: null, error: reply.message });
        else fail();
      } catch {
        if (current === version) fail();
      }
    },
    setEnvironment: (env) => { void changeState({ type: "setEnvironment", env }); },
    signOut: () => { void changeState({ type: "signOut" }); },
    openTab: (url) => { void chromeApi.tabs.create({ url }).catch(fail); },
    retry: () => { void (isPopupState(state) ? save() : startPopup(chromeApi, doc)); },
  };
  try {
    const initial = await send({ type: "getState" });
    if (!isPopupState(initial)) { fail(); return; }
    state = initial;
    if (state.email) await save();
    else showState();
  } catch { fail(); }
}

void startPopup(chrome as unknown as PopupChrome, document);
