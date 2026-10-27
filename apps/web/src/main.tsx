import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthShell } from "./auth/AuthShell";
import { ConnectedApp } from "./auth/ConnectedApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthShell>
      {(account, transport) => (
        <ConnectedApp account={account} transport={transport} />
      )}
    </AuthShell>
  </StrictMode>,
);
