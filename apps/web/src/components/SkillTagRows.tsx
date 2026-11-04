import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button, useCopy } from "./ui";
/** Measure an inert copy so overflow tags are actually hidden from Tab/accessibility. */
export function SkillTagRows({
  items,
  render,
}: {
  items: { id: string; label: string }[];
  render: (id: string) => ReactNode;
}) {
  const measure = useRef<HTMLDivElement>(null),
    [limit, setLimit] = useState(Infinity),
    [expanded, setExpanded] = useState(false),
    t = useCopy();
  const signature = items.map((i) => i.id + ":" + i.label).join("|");
  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    function update() {
      const tops: number[] = [];
      let count = 0;
      for (const child of Array.from(el!.children) as HTMLElement[]) {
        const top = child.offsetTop;
        if (!tops.includes(top)) tops.push(top);
        if (tops.length <= 3) count++;
      }
      setLimit(count || Infinity);
    }
    let active = true;
    update();
    void document.fonts?.ready.then(() => {
      if (active) update();
    });
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : undefined;
    observer?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [signature]);
  return (
    <div className="skill-tags-host">
      <div
        ref={measure}
        className="import-skill-tags skill-tag-measure"
        aria-hidden="true"
      >
        {items.map((i) => (
          <span className="import-skill-tag" key={i.id}>
            <span className="skill-tag-label" data-label={i.label}></span>
            <span className="skill-tag-remove">×</span>
          </span>
        ))}
      </div>
      <div className="import-skill-tags">
        {items.map((i, index) => (
          <span
            key={i.id}
            className="import-skill-tag"
            hidden={!expanded && index >= limit}
          >
            {render(i.id)}
          </span>
        ))}
      </div>
      {limit < items.length && (
        <Button
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? t("Arată mai puțin", "Show less")
            : t(`Vezi toate (${items.length})`, `Show all (${items.length})`)}
        </Button>
      )}
    </div>
  );
}
