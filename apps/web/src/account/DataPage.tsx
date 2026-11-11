import { useState } from "react";
import { signOutTo } from "../auth/RequireAuth.tsx";
import { useT } from "../i18n/t.ts";
import { supabase } from "../lib/supabase.ts";
import { Button, Dialog, Notice } from "../ui/index.ts";
import { deleteAccount, exportAccount } from "./account-api.ts";

type ExportState = { step: "idle" } | { step: "preparing" } | { step: "ready"; file: Blob; fileName: string } | { step: "error" };

function saveFile(file: Blob, fileName: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Export everything, or delete the account. */
export function DataPage() {
  const t = useT();
  const [exported, setExported] = useState<ExportState>({ step: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  async function prepare() {
    setExported({ step: "preparing" });
    try {
      setExported({ step: "ready", ...(await exportAccount()) });
    } catch {
      setExported({ step: "error" });
    }
  }

  async function remove() {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteAccount();
      // The login no longer exists; this only clears the session kept in this browser, and the app then shows the homepage.
      signOutTo("/");
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      setDeleteFailed(true);
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <section className="account-section" aria-labelledby="export-title">
        <h2 className="ui-heading" id="export-title">
          {t("data.export.title")}
        </h2>
        <p className="ui-lead account-section-text">{t("data.export.text")}</p>
        <div className="ui-row account-actions">
          {exported.step === "ready" ? (
            <Button variant="primary" onClick={() => saveFile(exported.file, exported.fileName)}>
              {t("data.export.download")}
            </Button>
          ) : (
            <Button loading={exported.step === "preparing"} onClick={prepare}>
              {t(exported.step === "preparing" ? "data.export.preparing" : "data.export.prepare")}
            </Button>
          )}
        </div>
        {exported.step === "preparing" && (
          <p className="ui-muted ui-small account-note" role="status">
            {t("data.export.wait")}
          </p>
        )}
        {exported.step === "ready" && (
          <div className="account-note">
            <Notice kind="good">{t("data.export.ready")}</Notice>
          </div>
        )}
        {exported.step === "error" && (
          <div className="account-note">
            <Notice kind="bad">{t("data.export.error")}</Notice>
          </div>
        )}
      </section>

      <section className="account-section" aria-labelledby="delete-title">
        <h2 className="ui-heading" id="delete-title">
          {t("data.delete.title")}
        </h2>
        <p className="ui-lead account-section-text">{t("data.delete.text")}</p>
        <div className="ui-row account-actions">
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t("data.delete.button")}
          </Button>
        </div>
        {deleteFailed && (
          <div className="account-note">
            <Notice kind="bad">{t("data.delete.error")}</Notice>
          </div>
        )}
      </section>

      <Dialog
        open={confirming}
        onClose={() => !deleting && setConfirming(false)}
        title={t("data.delete.dialogTitle")}
        actions={
          <>
            <Button variant="quiet" disabled={deleting} onClick={() => setConfirming(false)}>
              {t("data.delete.keep")}
            </Button>
            <Button variant="danger" loading={deleting} onClick={remove}>
              {t("data.delete.confirm")}
            </Button>
          </>
        }
      >
        <p>{t("data.delete.dialogText")}</p>
      </Dialog>
    </>
  );
}
