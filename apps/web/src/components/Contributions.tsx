import { useLayoutEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { safeRichHtml } from "../base/editing";
import { useCopy } from "./ui";

export function Contributions({
  id,
  html,
  onChange,
}: {
  id: string;
  html: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    last = useRef(html),
    t = useCopy();
  useLayoutEffect(() => {
    if (ref.current && (last.current !== html || !ref.current.innerHTML))
      ref.current.innerHTML = safeRichHtml(html);
    last.current = html;
  }, [html]);
  function publish() {
    if (ref.current) {
      const value = safeRichHtml(ref.current.innerHTML);
      last.current = value;
      onChange(value);
    }
  }
  function format(command: string) {
    ref.current?.focus();
    // Native contenteditable commands keep the user's selection and text.
    document.execCommand?.(command, false);
    publish();
  }
  return (
    <div className="rich-field">
      <label id={`${id}-label`} htmlFor={id}>
        {t("Contribuții", "Contributions")}
      </label>
      <div
        ref={ref}
        id={id}
        className="native rich-editor"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-labelledby={`${id}-label`}
        suppressContentEditableWarning
        onInput={publish}
        onPaste={(e) => {
          e.preventDefault();
          const pasted = e.clipboardData.getData("text/plain");
          const selection = window.getSelection();
          if (!selection?.rangeCount) return;
          const range = selection.getRangeAt(0);
          if (!ref.current?.contains(range.commonAncestorContainer)) return;
          range.deleteContents();
          const node = document.createTextNode(pasted);
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          publish();
        }}
      />
      <div
        className="format-toolbar"
        role="group"
        aria-label={t("Formatare contribuții", "Contribution formatting")}
      >
        {[
          ["bold", t("Aldin", "Bold"), Bold],
          ["italic", t("Cursiv", "Italic"), Italic],
          ["insertUnorderedList", t("Listă cu puncte", "Bulleted list"), List],
          [
            "insertOrderedList",
            t("Listă numerotată", "Numbered list"),
            ListOrdered,
          ],
        ].map(([command, label, Icon]) => {
          const Mark = Icon as typeof Bold;
          return (
            <button
              type="button"
              key={String(command)}
              className="icon-button"
              aria-label={String(label)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => format(String(command))}
            >
              <Mark size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
