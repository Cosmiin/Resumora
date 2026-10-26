import { useLayoutEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import {
  readContributions,
  safeRichHtml,
  type ContributionEdit,
} from "../base/editing";
import { useCopy } from "./ui";

export function Contributions({
  id,
  html,
  onChange,
  fieldIds,
  error,
}: {
  id: string;
  html: string;
  onChange: (edit: ContributionEdit) => void;
  fieldIds: string[];
  error?: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    last = useRef(html),
    t = useCopy();
  useLayoutEffect(() => {
    if (ref.current && (last.current !== html || !ref.current.innerHTML))
      ref.current.innerHTML = safeRichHtml(html, fieldIds);
    last.current = html;
  }, [html]);
  function publish() {
    if (ref.current) {
      const root = ref.current;
      const safe = safeRichHtml(
        root.innerHTML,
        Array.from(
          root.querySelectorAll<HTMLElement>("[data-contribution]"),
          (el) => el.dataset.contribution!,
        ),
      );
      if (safe !== root.innerHTML) root.innerHTML = safe;
      const selection = window.getSelection();
      const anchor = selection?.anchorNode,
        focus = selection?.focusNode;
      const anchorOffset = selection?.anchorOffset ?? 0,
        focusOffset = selection?.focusOffset ?? 0;
      const edit = readContributions(root);
      if (
        selection &&
        anchor &&
        focus &&
        root.contains(anchor) &&
        root.contains(focus)
      )
        selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
      last.current = edit.html;
      onChange(edit);
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
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
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
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
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
