import { t } from "../../../i18n/t.ts";

export function RemoveButton({ name, onClick }: { name: string; onClick(): void }) {
  return (
    <button type="button" className="remover" aria-label={t("edit.remove.item", { name })} onClick={onClick}>
      ×
    </button>
  );
}
