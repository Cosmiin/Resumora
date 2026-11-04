import { useState } from "react";
import { t } from "../i18n/t.ts";

export function ConflictBanner(props: { onLoadLatest(): Promise<void>; onKeepMine(): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="conflict-banner" role="alert">
      <strong>{t("cv.conflict.title")}</strong>
      <p>{t("cv.conflict.body")}</p>
      <div className="conflict-actions">
        <button type="button" disabled={busy} onClick={run(props.onLoadLatest)}>
          {t("cv.conflict.loadLatest")}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={run(props.onKeepMine)}>
          {t("cv.conflict.keepMine")}
        </button>
      </div>
    </div>
  );
}
