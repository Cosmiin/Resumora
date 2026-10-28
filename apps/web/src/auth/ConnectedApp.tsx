import { useMemo } from "react";
import { App } from "../App";
import { HttpBaseCvAdapter } from "../base/http-adapter";
import type { Account, AuthTransport } from "./AuthShell";
import { ExtensionConnection } from "../components/ExtensionPage";

export function ConnectedApp({
  account,
  transport,
}: {
  account: Account;
  transport: AuthTransport;
}) {
  const adapter = useMemo(
    () => new HttpBaseCvAdapter(transport),
    [account.id, transport],
  );
  if (
    ["/extension/connect", "/extension/manage"].includes(
      window.location.pathname,
    )
  )
    return <ExtensionConnection account={account} transport={transport} />;
  return <App key={account.id} adapter={adapter} transport={transport} />;
}
