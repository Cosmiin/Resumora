import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import {
  Check,
  CircleAlert,
  ChevronUp,
  ChevronDown,
  Trash2,
} from "lucide-react";
import {
  hasValue,
  type Fact,
  type Locale,
  type PartialDate,
} from "../base/model";
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
}) {
  const generated = useId(),
    fieldId = id ?? generated;
  const props = {
    id: fieldId,
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
export function FactField({
  value,
  label,
  onChange,
  issues = [],
  multiline,
  type,
  required,
  hint,
}: {
  value: Fact<string>;
  label: string;
  onChange: (v: string) => void;
  issues?: Issue[];
  multiline?: boolean;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  const t = useCopy(),
    issue = issues.find(
      (i) => i.field === value.fieldId && i.code !== "pending",
    );
  return (
    <Field
      id={value.fieldId}
      label={label}
      value={value.value}
      onChange={onChange}
      multiline={multiline}
      type={type}
      required={required}
      error={issue && issueText(issue.code, t)}
      hint={
        <>
          {hint && <span>{hint} </span>}
          {hasValue(value.value) && (
            <span>
              {t("Sursă: ", "Source: ")}
              {value.sourceId === "local_manual"
                ? t("introducere manuală", "manual entry")
                : value.sourceId === "example_mara_source"
                  ? t("exemplu Mara", "Mara example")
                  : t("răspunsul tău", "your answer")}{" "}
              ·{" "}
            </span>
          )}
          {hasValue(value.value) && (
            <span
              className={`fact-status ${value.status === "user_confirmed" ? "confirmed" : ""}`}
            >
              {value.status === "user_confirmed"
                ? t("Confirmat · auto-declarație", "Confirmed · self-reported")
                : value.status === "extracted_unconfirmed"
                  ? t("Extras · de confirmat", "Extracted · needs confirmation")
                  : t(
                      "Editat manual · de confirmat",
                      "Manually edited · needs confirmation",
                    )}
            </span>
          )}
        </>
      }
    />
  );
}
export function DateField({
  value,
  label,
  onChange,
  issues = [],
}: {
  value: Fact<PartialDate>;
  label: string;
  onChange: (v: PartialDate) => void;
  issues?: Issue[];
}) {
  const t = useCopy(),
    locale = useContext(LanguageContext),
    error = issues.find((i) => i.field === value.fieldId);
  return (
    <fieldset
      className="date-field"
      id={value.fieldId}
      tabIndex={-1}
      aria-invalid={!!error}
      aria-describedby={error ? `${value.fieldId}-help` : undefined}
    >
      <legend>{label}</legend>
      <div className="date-grid">
        <label>
          {t("An", "Year")}
          <input
            className="native"
            aria-label={`${label} · ${t("An", "Year")}`}
            inputMode="numeric"
            value={value.value.year}
            onChange={(e) => onChange({ ...value.value, year: e.target.value })}
            aria-invalid={!!error}
            aria-describedby={error ? `${value.fieldId}-help` : undefined}
          />
        </label>
        <label>
          {t("Lună", "Month")}
          <select
            className="native"
            aria-label={`${label} · ${t("Lună", "Month")}`}
            value={value.value.month}
            onChange={(e) =>
              onChange({ ...value.value, month: e.target.value })
            }
          >
            <option value="">{t("Necunoscută", "Unknown")}</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {new Intl.DateTimeFormat(locale, {
                  month: "long",
                  timeZone: "UTC",
                }).format(new Date(Date.UTC(2026, i, 1)))}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="field-error" id={`${value.fieldId}-help`}>
          {issueText(error.code, t)}
        </p>
      )}
      {hasValue(value.value) && (
        <small className="fact-status">
          {value.status === "user_confirmed"
            ? t("Confirmat", "Confirmed")
            : t("De confirmat", "Needs confirmation")}
        </small>
      )}
    </fieldset>
  );
}
export function EntryActions({
  label,
  index,
  count,
  move,
  remove,
}: {
  label: string;
  index: number;
  count: number;
  move: (d: -1 | 1) => void;
  remove: () => void;
}) {
  const t = useCopy();
  return (
    <div className="entry-actions">
      <Button
        aria-label={`${t("Mută în sus", "Move up")}: ${label}`}
        disabled={index === 0}
        onClick={() => move(-1)}
      >
        <ChevronUp size={16} />
      </Button>
      <Button
        aria-label={`${t("Mută în jos", "Move down")}: ${label}`}
        disabled={index === count - 1}
        onClick={() => move(1)}
      >
        <ChevronDown size={16} />
      </Button>
      <Button
        variant="danger"
        aria-label={`${t("Elimină", "Remove")}: ${label}`}
        onClick={remove}
      >
        <Trash2 size={16} />
      </Button>
    </div>
  );
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
