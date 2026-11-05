type Item = { key: string; ok: boolean; label: string; fix?: string };

/** A short list of checks: a tick when it holds, otherwise a bullet with a plain-words fix under it. */
export function Checklist({ items }: { items: Item[] }) {
  return (
    <ul className="check">
      {items.map((it) => (
        <li key={it.key}>
          <span className={it.ok ? "ok" : "no"} aria-hidden="true">
            {it.ok ? "✓" : "•"}
          </span>
          <span>
            {it.label}
            {!it.ok && it.fix && <small>{it.fix}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
