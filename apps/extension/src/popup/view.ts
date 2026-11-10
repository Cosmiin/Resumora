import { environments } from "../config";
import { copy } from "../copy";
import type { EnvId } from "../environments";
import type { PopupState, SaveResult } from "../messages";

export type View =
  | { kind: "signedOut"; state: PopupState; message: string | null; error: string | null }
  | { kind: "checking" }
  | { kind: "notJob" }
  | { kind: "capture"; where: string; busy: boolean }
  | SaveResult;

export type ViewActions = {
  signIn(email: string, password: string): void;
  setEnvironment(env: EnvId): void;
  signOut(): void;
  openTab(url: string): void;
  retry(): void;
};

export function renderView(root: HTMLElement, view: View, actions: ViewActions): void {
  const doc = root.ownerDocument;
  root.replaceChildren();
  const add = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string) => {
    const element = doc.createElement(tag);
    element.textContent = text;
    root.append(element);
    return element;
  };
  const button = (text: string, action: () => void) => {
    add("button", text).addEventListener("click", action);
  };
  switch (view.kind) {
    case "signedOut": {
      const state = "state" in view ? view.state : {
        env: "local" as const, email: null, environments: Object.values(environments),
      };
      add("h2", copy.signInTitle);
      if (view.message) add("p", view.message);
      const form = add("form", "");
      const field = (name: "email" | "password", labelText: string) => {
        const label = doc.createElement("label");
        label.textContent = labelText;
        const input = doc.createElement("input");
        input.type = name;
        input.name = name;
        input.autocomplete = name === "email" ? "email" : "current-password";
        input.required = true;
        label.append(input);
        form.append(label);
        return input;
      };
      const email = field("email", copy.email);
      const password = field("password", copy.password);
      const submit = doc.createElement("button");
      submit.type = "submit";
      submit.textContent = copy.signIn;
      form.append(submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        actions.signIn(email.value, password.value);
      });
      if ("error" in view && view.error) add("p", view.error).setAttribute("role", "alert");
      const label = add("label", copy.connectTo);
      const select = doc.createElement("select");
      for (const env of state.environments) {
        const unavailable = !env.configured;
        const option = doc.createElement("option");
        option.value = env.id;
        option.textContent = `${env.label}${unavailable ? ` ${copy.notSetUp}` : ""}`;
        option.disabled = unavailable;
        select.append(option);
      }
      select.value = state.env;
      select.addEventListener("change", () => actions.setEnvironment(select.value as EnvId));
      label.append(select);
      for (const text of [copy.createAccount, copy.forgotPassword]) {
        const url = `${environments[state.env].webUrl}/login`;
        const link = add("a", text);
        link.href = url;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          actions.openTab(url);
        });
      }
      break;
    }
    case "checking": {
      const status = add("p", copy.checking);
      status.setAttribute("role", "status");
      const spinner = doc.createElement("span");
      spinner.className = "spinner";
      spinner.setAttribute("aria-hidden", "true");
      status.prepend(spinner);
      break;
    }
    case "notJob": {
      add("h2", copy.notJobTitle);
      add("p", copy.notJobText);
      const capture = add("button", copy.captureAnyway);
      capture.className = "link-button";
      capture.addEventListener("click", () => {
        capture.disabled = true;
        actions.retry();
      });
      break;
    }
    case "capture": {
      add("h2", copy.captureTitle);
      add("p", view.where);
      const capture = add("button", view.busy ? copy.capturing : copy.capture);
      capture.disabled = view.busy;
      capture.setAttribute("aria-busy", String(view.busy));
      if (view.busy) {
        const spinner = doc.createElement("span");
        spinner.className = "spinner";
        spinner.setAttribute("aria-hidden", "true");
        capture.prepend(spinner);
      }
      capture.addEventListener("click", () => {
        capture.disabled = true;
        actions.retry();
      });
      break;
    }
    case "saved":
      add("h2", copy.savedTitle);
      add("p", copy.savedText);
      button(copy.openInResumora, () => actions.openTab(view.openUrl));
      break;
    case "existing":
      add("h2", copy.existingTitle);
      add("p", copy.existingText);
      button(copy.openIt, () => actions.openTab(view.openUrl));
      break;
    case "couldntRead":
      add("h2", copy.couldntReadTitle);
      add("p", copy.couldntReadText);
      button(copy.pasteInResumora, () => actions.openTab(view.pasteUrl));
      break;
    case "cantRead":
      add("h2", copy.cantRead);
      break;
    case "error":
      add("h2", copy.errorTitle);
      add("p", view.message);
      if (view.requestId) add("small", copy.requestId(view.requestId));
      button(copy.tryAgain, actions.retry);
  }
}
