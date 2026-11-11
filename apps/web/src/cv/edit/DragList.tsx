import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { t } from "../../i18n/t.ts";
import { DragGrip } from "./DragGrip.tsx";

type Picked = { id: string; start: number };

type Props<T extends { id: string }> = {
  items: T[];
  onMove(from: number, to: number): void;
  label(item: T): string;
  /** Each item's content. The list draws the grip itself, in the left margin. */
  children(item: T): ReactNode;
  /** Class for each row wrapper (default: the page's margin grip). */
  rowClassName?: string;
  /** The rows sit side by side and wrap (languages), so a dragged row may move sideways too. */
  wrap?: boolean;
};

type RowProps = {
  id: string;
  name: string;
  index: number;
  hintId: string;
  pressed: boolean;
  onKey(e: KeyboardEvent<HTMLButtonElement>, id: string, index: number): void;
  onBlur(id: string): void;
  className: string;
  children: ReactNode;
};

function Row({ id, name, index, hintId, pressed, onKey, onBlur, className, children }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  void attributes; // dnd-kit's button attributes would clash with the grip's own labels
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? `${className} is-dragging` : className}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <DragGrip
        ref={setActivatorNodeRef}
        name={name}
        hintId={hintId}
        gripId={id}
        pressed={pressed}
        pointer={listeners}
        onKeyDown={(e) => onKey(e, id, index)}
        onBlur={() => onBlur(id)}
      />
      {children}
    </div>
  );
}

/**
 * A vertical list whose items can be reordered by dragging (pointer, touch) or
 * from the keyboard on each item's grip. No dnd-kit keyboard sensor: ours announces moves.
 */
export function DragList<T extends { id: string }>({ items, onMove, label, children, rowClassName = "drag-row", wrap = false }: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );
  const hintId = useId();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [message, setMessage] = useState("");
  const refocus = useRef<string | null>(null);
  const total = items.length;

  // After a move the item renders in a new place: put focus back on its grip.
  useLayoutEffect(() => {
    const id = refocus.current;
    if (id === null) return;
    refocus.current = null;
    for (const el of document.querySelectorAll<HTMLElement>("[data-grip]")) {
      if (el.dataset["grip"] === id) {
        el.focus();
        break;
      }
    }
  });

  const nameOf = (i: number) => {
    const item = items[i];
    return item ? label(item) : "";
  };

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, id: string, index: number) => {
      const name = nameOf(index);
      const say = (key: "picked" | "moved" | "dropped" | "cancelled", n: number) =>
        setMessage(t(`edit.drag.${key}`, { name, n: n + 1, total }));
      if (e.key === " ") {
        e.preventDefault();
        if (picked?.id === id) {
          setPicked(null);
          say("dropped", index);
        } else {
          setPicked({ id, start: index });
          say("picked", index);
        }
      } else if (picked?.id === id && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const to = index + (e.key === "ArrowUp" ? -1 : 1);
        if (to < 0 || to >= total) return;
        refocus.current = id;
        onMove(index, to);
        say("moved", to);
      } else if (picked?.id === id && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPicked(null);
        if (index !== picked.start) {
          refocus.current = id;
          onMove(index, picked.start);
        }
        say("cancelled", picked.start);
      }
    },
    // nameOf reads items and label, which change whenever the list does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picked, total, onMove, items, label],
  );

  // Leaving a picked-up grip drops it where it is.
  // (A move re-renders the row in a new place, which can blur it; focus is put back right after.)
  const onGripBlur = useCallback((id: string) => {
    if (refocus.current === id) return;
    setPicked((p) => (p?.id === id ? null : p));
  }, []);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over?.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items} strategy={wrap ? rectSortingStrategy : verticalListSortingStrategy}>
        <span id={hintId} hidden>
          {t("edit.dragHint")}
        </span>
        <div className="sr-only" aria-live="assertive">
          {message}
        </div>
        {items.map((item, i) => (
          <Row
            key={item.id}
            id={item.id}
            name={label(item)}
            index={i}
            hintId={hintId}
            pressed={picked?.id === item.id}
            onKey={onKey}
            onBlur={onGripBlur}
            className={rowClassName}
          >
            {children(item)}
          </Row>
        ))}
      </SortableContext>
    </DndContext>
  );
}
