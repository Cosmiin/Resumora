import { memo, useLayoutEffect, useRef, type KeyboardEvent, type Ref } from "react";

type Props = {
  value: string;
  onChange(value: string): void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  fieldKey: string;
  onKeyDown?(e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void;
  ref?: Ref<HTMLTextAreaElement | HTMLInputElement>;
};

function supportsFieldSizing(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");
}

/** Browsers without `field-sizing: content` get the size set by hand. */
function grow(el: HTMLTextAreaElement | HTMLInputElement): void {
  if (supportsFieldSizing()) return;
  if (el instanceof HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  } else {
    el.size = Math.max(2, (el.value || el.placeholder).length + 1);
  }
}

/** Text typed straight on the page: no border, the page font, grows with its content. */
export const PageField = memo(function PageField({
  value,
  onChange,
  label,
  placeholder,
  multiline,
  className,
  fieldKey,
  onKeyDown,
  ref,
}: Props) {
  const own = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    if (own.current) grow(own.current);
  }, [value, multiline]);

  const setRef = (el: HTMLTextAreaElement | HTMLInputElement | null) => {
    own.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const common = {
    ref: setRef,
    className,
    value,
    placeholder,
    "aria-label": label,
    "data-field": fieldKey,
    onKeyDown,
  };
  return multiline ? (
    <textarea
      {...common}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
    />
  ) : (
    <input {...common} type="text" onChange={(e) => onChange(e.target.value)} />
  );
});
