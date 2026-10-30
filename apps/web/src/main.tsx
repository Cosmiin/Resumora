import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthShell } from "./auth/AuthShell";
import { ConnectedApp } from "./auth/ConnectedApp";
import "./styles.css";
import { ExtensionPage } from "./components/ExtensionPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.location.pathname === "/extension" ? (
      <ExtensionPage />
    ) : (
      <AuthShell>
        {(account, transport) => (
          <ConnectedApp account={account} transport={transport} />
        )}
      </AuthShell>
    )}
  </StrictMode>,
);
