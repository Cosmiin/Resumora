import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useT } from "../i18n/t.ts";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  /** Shows a spinner and blocks clicks; the label stays so the button keeps its width. */
  loading?: boolean;
  children: ReactNode;
};

export function buttonClass(variant: ButtonVariant = "secondary", size: "md" | "sm" = "md"): string {
  return ["ui-btn", variant !== "secondary" && `ui-btn--${variant}`, size === "sm" && "ui-btn--sm"].filter(Boolean).join(" ");
}

/** The one button. One `primary` per screen; `quiet` for the way out (skip, cancel, change). */
export function Button({ variant, size, loading = false, type = "button", disabled, children, ...rest }: Props) {
  const t = useT();
  return (
    <button {...rest} type={type} className={buttonClass(variant, size)} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading && <span className="ui-btn-spinner" role="img" aria-label={t("ui.loading")} />}
      {children}
    </button>
  );
}
