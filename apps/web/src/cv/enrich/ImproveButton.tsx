import { t } from "../../i18n/t.ts";
import { useOpenFocus } from "./focus-context.ts";

/** ✨ on a hovered or focused bullet: opens focus mode on that bullet. Editor only. */
export function ImproveButton({ roleId, bulletId }: { roleId: string; bulletId: string }) {
  const open = useOpenFocus();
  if (!open) return null;
  return (
    <button
      type="button"
      className="improve-btn"
      aria-label={t("enrich.focus.improveBullet")}
      title={t("enrich.focus.improveBullet")}
      onClick={() => open({ roleId, bulletId, mode: "improve" })}
    >
      <span aria-hidden="true">✨</span>
    </button>
  );
}
