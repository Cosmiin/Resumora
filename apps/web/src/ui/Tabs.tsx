import { useId, type KeyboardEvent, type ReactNode } from "react";

export type Tab = { id: string; label: string; content: ReactNode };

/** Views of the same thing, side by side (e.g. CV / Cover letter). Arrow keys move between tabs. */
export function Tabs(props: { label: string; tabs: Tab[]; value: string; onChange: (id: string) => void }) {
  const { label, tabs, value, onChange } = props;
  const base = useId();
  const active = tabs.find((tab) => tab.id === value) ?? tabs[0];

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const at = tabs.findIndex((tab) => tab.id === active?.id);
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    document.getElementById(`${base}-tab-${tab.id}`)?.focus();
  }

  return (
    <div>
      <div className="ui-tablist" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.id}`}
            className="ui-tab"
            aria-selected={tab.id === active?.id}
            aria-controls={`${base}-panel-${tab.id}`}
            tabIndex={tab.id === active?.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active && (
        <div className="ui-tabpanel ui-focusable" role="tabpanel" id={`${base}-panel-${active.id}`} aria-labelledby={`${base}-tab-${active.id}`} tabIndex={0}>
          {active.content}
        </div>
      )}
    </div>
  );
}
