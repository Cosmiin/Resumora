import { useMemo } from "react";
import { App } from "../App";
import { HttpBaseCvAdapter } from "../base/http-adapter";
import type { Account, AuthTransport } from "./AuthShell";

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
  return <App key={account.id} adapter={adapter} />;
}
