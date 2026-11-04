import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CvContent, HistoryItem } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { getHistoryItem, listHistory } from "./cv-api.ts";
import { dayLabel, timeLabel } from "./historyFormat.ts";

const reasonLabel: Record<HistoryItem["reason"], MessageKey> = {
  autosave: "history.reason.autosave",
  restore: "history.reason.restore",
  import: "history.reason.import",
  ai: "history.reason.ai",
};

type Props = {
  /** Restore is only allowed when everything is saved, so it can't race a pending save. */
  canRestore: boolean;
  onClose(): void;
  /** The chosen version's content (and when it was saved), or null when nothing is chosen. */
  onPreview(content: CvContent | null, createdAt?: string): void;
  onRestore(id: string): void | Promise<void>;
};

function groupByDay(items: HistoryItem[]) {
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** Earlier versions of the CV. Choosing one previews it on the page. Escape or Close leaves. */
export function HistoryPanel({ canRestore, onClose, onPreview, onRestore }: Props) {
  const history = useQuery({ queryKey: ["cv-history"], queryFn: listHistory, staleTime: 0, gcTime: 0 });
  const [chosen, setChosen] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const latest = useRef<string | null>(null);

  useEffect(() => closeRef.current?.focus(), []);

  async function choose(item: HistoryItem) {
    latest.current = item.id;
    setChosen(item.id);
    setLoadFailed(false);
    try {
      const { content } = await getHistoryItem(item.id);
      if (latest.current === item.id) onPreview(content, item.createdAt);
    } catch {
      if (latest.current !== item.id) return;
      setLoadFailed(true);
      setChosen(null);
      onPreview(null);
    }
  }

  async function restore(id: string) {
    setBusy(true);
    try {
      await onRestore(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      className="side-panel"
      aria-label={t("history.open")}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
    >
      <header className="side-panel-header">
        <div>
          <p className="side-panel-section">{t("history.title")}</p>
          <h2 className="side-panel-title">{t("history.open")}</h2>
        </div>
        <button ref={closeRef} type="button" className="side-panel-close" aria-label={t("history.close")} onClick={onClose}>
          <span className="side-panel-close-icon" aria-hidden="true">×</span>
          <span className="side-panel-back" aria-hidden="true">← {t("panel.back")}</span>
        </button>
      </header>
      <p className="history-intro">{t("history.intro")}</p>
      <div className="side-panel-body">
        {history.isPending && <p>{t("app.loading")}</p>}
        {history.isError && <p role="alert">{t("history.loadError")}</p>}
        {loadFailed && <p role="alert">{t("history.previewError")}</p>}
        {history.data?.length === 0 && <p>{t("history.empty")}</p>}
        {history.data &&
          groupByDay(history.data).map((group) => (
            <section key={group.label} className="history-group">
              <h3 className="history-day">{group.label}</h3>
              <ul className="history-list">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="history-item"
                      aria-pressed={chosen === item.id}
                      onClick={() => choose(item)}
                    >
                      <span className="history-time">{timeLabel(item.createdAt)}</span>
                      <span className="history-reason">{t(reasonLabel[item.reason])}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
      <footer className="side-panel-footer">
        <button type="button" disabled={!canRestore || !chosen || busy} onClick={() => chosen && restore(chosen)}>
          {t("history.restore")}
        </button>
        <p className="history-hint">{canRestore ? t("history.restoreNote") : t("history.waitForSave")}</p>
      </footer>
    </aside>
  );
}
