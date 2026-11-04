import { useEffect, useRef, useState } from "react";
import { formatYearMonth, parseTypedDate, type Locale } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { PageField } from "./PageField.tsx";

type Props = {
  value: string;
  locale: Locale;
  label: string;
  onCommit(value: string): void;
  onPresent?(): void;
  fieldKey?: string;
};

/** A date typed in free form: valid text is saved at once, anything else waits with a hint. */
export function DateField({ value, locale, label, onCommit, onPresent, fieldKey }: Props) {
  const shown = formatYearMonth(value, locale);
  const [text, setText] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);

  // Follow outside changes (undo, history) unless the person is in the middle of typing.
  useEffect(() => {
    if (!focused.current) {
      setText(shown);
      setInvalid(false);
    }
  }, [shown]);

  const change = (next: string) => {
    setText(next);
    const parsed = parseTypedDate(next);
    if (!parsed.ok) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (parsed.present) onPresent?.();
    else onCommit(parsed.value);
  };

  return (
    <span className="cv-date-field">
      <PageField
        fieldKey={fieldKey ?? `date-${label}`}
        label={label}
        value={text}
        onChange={change}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setText(shown);
          setInvalid(false);
        }}
      />
      {invalid ? (
        <span className="date-hint" role="status">
          {t("edit.dateHint")}
        </span>
      ) : null}
    </span>
  );
}
