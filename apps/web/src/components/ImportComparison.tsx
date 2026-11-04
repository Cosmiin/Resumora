import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Candidate,
  ImportReview,
} from "@resumora/contracts/intelligence/model";
import type { IntelligenceClient } from "../base/intelligence";
import { OriginalSource } from "./OriginalSource";
import { Button, useCopy } from "./ui";
const ViewContext = createContext<(view: ImportView) => void>(() => {});
export function ImportSourceAction({ onSelect }: { onSelect: () => void }) {
  const show = useContext(ViewContext),
    t = useCopy();
  return (
    <Button
      variant="ghost"
      onClick={() => {
        onSelect();
        show("source");
      }}
    >
      {t("Vezi sursa", "View source")}
    </Button>
  );
}
export type ImportView = "information" | "source";
/** Review stays in place; verified source bytes load only after an explicit request. */
export function ImportComparison({
  review,
  client,
  candidate,
  view,
  onViewChange,
  children,
  originalAction = true,
}: {
  review: ImportReview;
  client?: IntelligenceClient;
  candidate?: Candidate;
  view: ImportView;
  onViewChange: (view: ImportView) => void;
  children: ReactNode;
  originalAction?: boolean;
}) {
  const t = useCopy(),
    dialog = useRef<HTMLDialogElement>(null),
    previous = useRef<HTMLElement | null>(null);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (view === "source") {
      setOpened(true);
      if (dialog.current && !dialog.current.open) {
        previous.current = document.activeElement as HTMLElement;
        dialog.current.showModal();
      }
    } else if (dialog.current?.open) {
      dialog.current.close();
      previous.current?.isConnected &&
        previous.current.focus({ preventScroll: true });
    }
  }, [view, opened]);
  return (
    <ViewContext value={onViewChange}>
      {originalAction && (
        <div className="import-original-link">
          <Button
            variant="ghost"
            onClick={() => onViewChange("source")}
            aria-haspopup="dialog"
          >
            {t("Vezi CV-ul original", "View original CV")}
          </Button>
        </div>
      )}
      <div className="import-review-content import-information">{children}</div>
      {(opened || view === "source") && (
        <dialog
          ref={dialog}
          className="import-original-dialog"
          aria-label={t("CV original", "Original CV")}
          onCancel={(e) => {
            e.preventDefault();
            onViewChange("information");
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onViewChange("information");
          }}
        >
          <header className="section-heading">
            <h2>{t("CV original", "Original CV")}</h2>
            <Button onClick={() => onViewChange("information")}>
              {t("Înapoi la verificare", "Back to review")}
            </Button>
          </header>
          <OriginalSource
            review={review}
            candidate={candidate}
            client={client}
          />
        </dialog>
      )}
    </ViewContext>
  );
}
