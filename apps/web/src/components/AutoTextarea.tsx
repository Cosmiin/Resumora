import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

/** Native editable textarea that follows its content and available width. */
export const AutoTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function AutoTextarea({ style, value, defaultValue, ...props }, ref) {
  const element = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => element.current!, []);
  const fit = () => {
    const node = element.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.max(48, node.scrollHeight + Math.max(0, node.offsetHeight - node.clientHeight))}px`;
  };
  useLayoutEffect(fit, [value, defaultValue]);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    let width = node.getBoundingClientRect().width;
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver((entries) => {
            const next = entries[0]?.contentRect.width;
            if (next !== undefined && next !== width) {
              width = next;
              fit();
            }
          });
    observer?.observe(node);
    window.addEventListener("resize", fit);
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) fit();
    });
    return () => {
      alive = false;
      observer?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);
  return (
    <textarea
      {...props}
      ref={element}
      value={value}
      defaultValue={defaultValue}
      style={{
        ...style,
        width: "100%",
        boxSizing: "border-box",
        minHeight: 0,
        resize: "none",
        overflowY: "hidden",
      }}
    />
  );
});
