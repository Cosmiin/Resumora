import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthShell } from "./auth/AuthShell";
import { ConnectedApp } from "./auth/ConnectedApp";
import "./styles.css";
import { clearRetiredStorage } from "./base/storage-upgrade";

try {
  clearRetiredStorage(window.sessionStorage);
  clearRetiredStorage(window.localStorage);
} catch {}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthShell accountMenuInShell>
      {(account, transport, accountActions) => (
        <ConnectedApp
          account={account}
          transport={transport}
          accountActions={accountActions}
        />
      )}
    </AuthShell>
  </StrictMode>,
);
