import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CvContent, HistoryItem } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { getHistoryItem, listHistory } from "./cv-api.ts";

const reasonLabel: Record<HistoryItem["reason"], MessageKey> = {
  autosave: "history.reason.autosave",
  restore: "history.reason.restore",
  import: "history.reason.import",
  ai: "history.reason.ai",
};

const when = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function HistoryDrawer(props: {
  onClose(): void;
  /** Restore is only allowed when everything is saved, so it can't race a pending save. */
  canRestore: boolean;
  onRestore(id: string): Promise<void>;
}) {
  const { onClose, canRestore, onRestore } = props;
  const history = useQuery({ queryKey: ["cv-history"], queryFn: listHistory, staleTime: 0, gcTime: 0 });
  const [preview, setPreview] = useState<{ id: string; content: CvContent } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function restore(id: string) {
    setBusy(true);
    try {
      await onRestore(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label={t("history.title")}>
      <div className="drawer-header">
        <h2>{t("history.title")}</h2>
        <button type="button" className="secondary" onClick={onClose}>{t("history.close")}</button>
      </div>
      {history.isPending && <p>{t("app.loading")}</p>}
      {history.isError && <p role="alert">{t("history.loadError")}</p>}
      {history.data?.length === 0 && <p>{t("history.empty")}</p>}
      <ul className="history-list">
        {history.data?.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{when(item.createdAt)}</strong>
              <span className="history-reason">{t(reasonLabel[item.reason])}</span>
            </div>
            <div className="history-actions">
              <button
                type="button"
                className="secondary"
                onClick={async () => setPreview({ id: item.id, content: (await getHistoryItem(item.id)).content })}
              >
                {t("history.preview")}
              </button>
              <button type="button" disabled={!canRestore || busy} onClick={() => restore(item.id)}>
                {t("history.restore")}
              </button>
            </div>
            {preview?.id === item.id && <PreviewSummary content={preview.content} />}
          </li>
        ))}
      </ul>
      {!canRestore && <p className="history-hint">{t("history.waitForSave")}</p>}
    </div>
  );
}

function PreviewSummary({ content }: { content: CvContent }) {
  return (
    <div className="history-preview">
      <p>{content.basics.fullName || "—"}</p>
      {content.basics.headline && <p>{content.basics.headline}</p>}
      <ul>
        {content.experience.map((e) => (
          <li key={e.id}>{[e.title, e.company].filter(Boolean).join(" · ")}</li>
        ))}
      </ul>
    </div>
  );
}
