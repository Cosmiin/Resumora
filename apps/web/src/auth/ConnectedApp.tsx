import { PhotoContext, createPhotoClient } from "../photo/client";
import { httpIntelligence } from "../base/intelligence";
import { useMemo, type ReactNode } from "react";
import { App } from "../App";
import { HttpBaseCvAdapter } from "../base/http-adapter";
import type { Account, AuthTransport } from "./AuthShell";

export function ConnectedApp({
  account,
  transport,
  accountActions,
}: {
  accountActions?: ReactNode;
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
  return (
    <PhotoContext.Provider value={photos}>
      <App
        key={account.id}
        accountActions={accountActions}
        adapter={adapter}
        transport={transport}
        intelligence={intelligence}
      />
    </PhotoContext.Provider>
  );
}
