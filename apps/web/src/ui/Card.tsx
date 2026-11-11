import type { ElementType, ReactNode } from "react";

/** A sheet of paper: the CV, a list of decisions, a form. Never put a sheet inside a sheet. */
export function Sheet({ as: As = "div", children, ...rest }: { as?: ElementType; children: ReactNode; "aria-label"?: string; "aria-labelledby"?: string }) {
  return (
    <As {...rest} className="ui-sheet">
      {children}
    </As>
  );
}

/** A block lying on the desk, e.g. one question. `raised` lifts it onto paper once it is answered. */
export function Block({ raised = false, children }: { raised?: boolean; children: ReactNode }) {
  return <div className={raised ? "ui-block ui-block--raised" : "ui-block"}>{children}</div>;
}

/** The coach's voice in blue ink: a question, a reason, a short encouragement. Two lines at most. */
export function CoachNote({ as: As = "p", size = "md", children }: { as?: ElementType; size?: "md" | "sm"; children: ReactNode }) {
  return <As className={size === "sm" ? "ui-coach ui-coach--sm" : "ui-coach"}>{children}</As>;
}

/** Text marked with the yellow highlighter: what changed. */
export function Mark({ children }: { children: ReactNode }) {
  return <span className="ui-mark">{children}</span>;
}

/** An empty screen says what will appear here and offers the first step. */
export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      <h2 className="ui-empty-title">{title}</h2>
      {text && <p className="ui-empty-text">{text}</p>}
      {action}
    </div>
  );
}
