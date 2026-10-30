import { PhotoContext, createPhotoClient } from "../photo/client";
import { httpIntelligence } from "../base/intelligence";
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
  const intelligence = useMemo(
    () => httpIntelligence(transport),
    [account.id, transport],
  );
  const photos = useMemo(
    () => createPhotoClient(transport),
    [account.id, transport],
  );
  if (["/extension/connect", "/extension/manage"].includes(window.location.pathname))
    return <ExtensionConnection account={account} transport={transport} />;
  return (
    <PhotoContext.Provider value={photos}>
      <App
        key={account.id}
        adapter={adapter}
        transport={transport}
        intelligence={intelligence}
      />
    </PhotoContext.Provider>
  );
}
