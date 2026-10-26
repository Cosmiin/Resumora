import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { Check, CircleAlert } from "lucide-react";
import type { Locale } from "../base/model";
import type { Issue } from "../base/validation";
export const LanguageContext = createContext<Locale>("ro");
export function useCopy() {
  const locale = useContext(LanguageContext);
  return (ro: string, en: string) => (locale === "ro" ? ro : en);
}
export function Button({
  children,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button type="button" className={`btn btn-${variant}`} {...props}>
      {children}
    </button>
  );
}
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "good" | "warn" | "neutral" | "info";
}) {
  return (
    <span className={`pill pill-${tone}`}>
      {tone === "good" ? (
        <Check size={14} aria-hidden="true" />
      ) : tone === "warn" ? (
        <CircleAlert size={14} aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}
export function Field({
  label,
  value,
  onChange,
  id,
  hint,
  error,
  multiline,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id?: string;
  hint?: ReactNode;
  error?: string;
  multiline?: boolean;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const generated = useId(),
    fieldId = id ?? generated;
  const props = {
    id: fieldId,
    placeholder,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    "aria-invalid": !!error,
    "aria-required": required,
    "aria-describedby": hint || error ? `${fieldId}-help` : undefined,
    className: "native",
  };
  return (
    <div className="field">
      <label htmlFor={fieldId}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {multiline ? (
        <textarea {...props} rows={3} />
      ) : (
        <input {...props} type={type} />
      )}
      {(hint || error) && (
        <div
          id={`${fieldId}-help`}
          className={error ? "field-error" : "field-hint"}
        >
          {error ?? hint}
        </div>
      )}
    </div>
  );
}
export function issueText(code: Issue["code"], t: ReturnType<typeof useCopy>) {
  return {
    required: t(
      "Completează câmpul sau elimină intrarea nefolosită.",
      "Complete this field or remove the unused entry.",
    ),
    email: t(
      "Introdu o adresă de email validă.",
      "Enter a valid email address.",
    ),
    url: t(
      "Introdu un URL complet cu https:// sau http://.",
      "Enter a complete URL with https:// or http://.",
    ),
    date: t(
      "An: 1900–2100. Luna este opțională și necesită un an.",
      "Year: 1900–2100. Month is optional and requires a year.",
    ),
    chronology: t(
      "Sfârșitul nu poate preceda începutul.",
      "End cannot precede start.",
    ),
    pending: t(
      "Verifică informația, apoi confirmă secțiunea.",
      "Review this fact, then confirm the section.",
    ),
    prose: t(
      "Aprobă textul propriu înainte de salvare.",
      "Approve your wording before saving.",
    ),
    truth: t(
      "Confirmă exactitatea informațiilor înainte de salvare.",
      "Acknowledge the facts before saving.",
    ),
  }[code];
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const el = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    el.showModal();
    return () => {
      el.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>
  );
}
