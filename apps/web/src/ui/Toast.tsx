import { X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n/t.ts";

type Toast = { id: number; text: string; kind: "info" | "error" };
type ToastApi = { show: (text: string, kind?: Toast["kind"]) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Short confirmations after an action ("Saved"). They stay until closed. Errors that need a decision belong on the page. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const show = useCallback((text: string, kind: Toast["kind"] = "info") => {
    setToasts((list) => [...list, { id: nextId.current++, text, kind }]);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The region is always in the page, so screen readers announce what is added to it. */}
      <div className="ui-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className={toast.kind === "error" ? "ui-toast ui-toast--error" : "ui-toast"} key={toast.id}>
            <span>{toast.text}</span>
            <button type="button" className="ui-toast-close" aria-label={t("ui.close")} onClick={() => setToasts((list) => list.filter((x) => x.id !== toast.id))}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider above it");
  return api;
}
