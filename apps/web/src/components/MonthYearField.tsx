import { useContext, useEffect, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import type { PartialDate } from "../base/model";
import { dateError } from "../base/dates";
import { dateInput, parseDateInput } from "../base/editing";
import { Field, LanguageContext, useCopy } from "./ui";

export function MonthYearField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: PartialDate;
  onChange: (value: PartialDate) => void;
  error?: string;
}) {
  const t = useCopy(),
    locale = useContext(LanguageContext);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    year = useRef<HTMLInputElement>(null);
  const validYear = !!value.year && !dateError({ year: value.year, month: "" });
  const months =
    locale === "ro"
      ? [
          "Ianuarie",
          "Februarie",
          "Martie",
          "Aprilie",
          "Mai",
          "Iunie",
          "Iulie",
          "August",
          "Septembrie",
          "Octombrie",
          "Noiembrie",
          "Decembrie",
        ]
      : [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
  useEffect(() => {
    if (!open) return;
    year.current?.focus();
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function close() {
    setOpen(false);
    document.getElementById(id)?.focus();
  }
  function select(next: PartialDate) {
    onChange(next);
    close();
  }
  return (
    <div
      ref={root}
      className="month-year-control"
      onFocus={(e) => {
        if (e.target.id === id) setOpen(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.altKey && e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }
        if (open && e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        if (open && e.key === "Enter" && e.target === year.current) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <Field
        id={id}
        label={label}
        value={dateInput(value)}
        onChange={(text) => onChange(parseDateInput(text))}
        placeholder={t("LL/AAAA", "MM/YYYY")}
        hint={t(
          "LL/AAAA sau AAAA · Alt+↓ deschide calendarul",
          "MM/YYYY or YYYY · Alt+↓ opens the picker",
        )}
        error={error}
      />
      <button
        type="button"
        className="icon-button date-picker-trigger"
        tabIndex={-1}
        aria-label={`${t("Alege luna și anul", "Choose month/year")}: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-picker`}
        title={t("Lună și an · Alt+↓", "Month and year · Alt+↓")}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <CalendarDays size={17} />
      </button>
      {open && (
        <div
          id={`${id}-picker`}
          className="month-year-picker"
          role="dialog"
          aria-labelledby={`${id}-picker-title`}
        >
          <div className="month-year-heading">
            <strong id={`${id}-picker-title`}>{label}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label={t("Închide calendarul", "Close month/year picker")}
              onClick={close}
            >
              <X size={16} />
            </button>
          </div>
          <label htmlFor={`${id}-picker-year`}>{t("An", "Year")}</label>
          <input
            ref={year}
            id={`${id}-picker-year`}
            className="native"
            type="number"
            min={1900}
            max={2100}
            value={value.year}
            onChange={(e) => onChange({ ...value, year: e.target.value })}
          />
          {!validYear && (
            <p className="small muted">
              {t(
                "Alege un an (1900–2100) înaintea lunii.",
                "Choose a year (1900–2100) before a month.",
              )}
            </p>
          )}
          <div
            className="month-grid"
            role="group"
            aria-label={t("Lună", "Month")}
          >
            {months.map((month, index) => (
              <button
                type="button"
                key={month}
                disabled={!validYear}
                aria-pressed={value.month === String(index + 1)}
                onClick={() =>
                  select({ year: value.year, month: String(index + 1) })
                }
              >
                {month}
              </button>
            ))}
          </div>
          <div className="month-year-actions">
            <button
              type="button"
              disabled={!validYear}
              onClick={() => select({ year: value.year, month: "" })}
            >
              {t("Doar anul", "Year only")}
            </button>
            <button
              type="button"
              onClick={() => select({ year: "", month: "" })}
            >
              {t("Dată necunoscută", "Unknown date")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
