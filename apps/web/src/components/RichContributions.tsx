import { createElement, useLayoutEffect, useRef, type ReactNode } from "react";
import type { Fact } from "../base/model";
import { richText, safeRichHtml } from "../base/editing";
import { useCopy } from "./ui";

/** Keep each fact independently editable inside its saved list/paragraph structure. */
function EditableBlock({
  tag,
  html,
  field,
  change,
}: {
  tag: string;
  html: string;
  field: Fact<string>;
  change: (id: string, text: string) => void;
}) {
  const ref = useRef<HTMLElement>(null),
    last = useRef<string | undefined>(undefined),
    t = useCopy();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const editing =
      el === document.activeElement || el.contains(document.activeElement);
    if (
      richText(el.innerHTML) !== field.value ||
      (!editing && last.current !== html)
    )
      el.innerHTML = safeRichHtml(html);
    last.current = html;
  }, [html, field.value]);
  return createElement(tag, {
    ref,
    contentEditable: "plaintext-only",
    role: "textbox",
    "aria-label": t("Text din previzualizare", "Preview text"),
    "data-contribution": field.fieldId,
    style: { whiteSpace: "pre-wrap" },
    suppressContentEditableWarning: true,
    onInput: (e: { currentTarget: HTMLElement }) =>
      change(field.fieldId, richText(e.currentTarget.innerHTML)),
  });
}
export function RichContributions({
  html,
  fields,
  change,
}: {
  html: string;
  fields: Fact<string>[];
  change: (id: string, text: string) => void;
}) {
  const root = document.createElement("div");
  root.innerHTML = safeRichHtml(
    html,
    fields.map((f) => f.fieldId),
  );
  function render(node: Node, index: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof HTMLElement)) return null;
    const tag = node.tagName.toLowerCase(),
      field = fields.find((f) => f.fieldId === node.dataset.contribution);
    if (field) {
      const nested = Array.from(node.children).filter((child) =>
        child.querySelector("[data-contribution]"),
      );
      if (!nested.length)
        return (
          <EditableBlock
            key={field.fieldId}
            tag={tag}
            html={node.innerHTML}
            field={field}
            change={change}
          />
        );
      const copy = node.cloneNode(true) as HTMLElement;
      for (const child of Array.from(copy.children))
        if (child.querySelector("[data-contribution]")) child.remove();
      return createElement(
        tag,
        { key: field.fieldId },
        <EditableBlock
          tag="span"
          html={copy.innerHTML}
          field={field}
          change={change}
        />,
        ...nested.map(render),
      );
    }
    return createElement(
      tag,
      { key: index },
      ...Array.from(node.childNodes).map(render),
    );
  }
  return <>{Array.from(root.childNodes).map(render)}</>;
}
