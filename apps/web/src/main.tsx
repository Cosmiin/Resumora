import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthShell } from "./auth/AuthShell";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthShell>{(account) => <App key={account.id} />}</AuthShell>
  </StrictMode>,
);
