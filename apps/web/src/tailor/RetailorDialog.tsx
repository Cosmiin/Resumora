import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { TAILOR_SECTIONS, type TailorSection } from "@resumora/shared";
import { t } from "../i18n/t.ts";

type Props = { busy: boolean; error: boolean; onStart(sections: TailorSection[]): void; onClose(): void };

/** Re-tailor…: the sections to run again. The others keep their wording, hand edits included. */
export function RetailorDialog({ busy, error, onStart, onClose }: Props) {
  const [picked, setPicked] = useState<ReadonlySet<TailorSection>>(new Set());
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const toggle = (section: TailorSection) => setPicked((now) => {
    const next = new Set(now);
    if (!next.delete(section)) next.add(section);
    return next;
  });
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>("input, button:not(:disabled)");
    const head = controls[0];
    const tail = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === head) { event.preventDefault(); tail?.focus(); }
    else if (!event.shiftKey && document.activeElement === tail) { event.preventDefault(); head?.focus(); }
  }

  return (
    <div className="jobs-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="add-job-dialog" role="dialog" aria-modal="true" aria-labelledby="retailor-title" onKeyDown={onKeyDown}>
        <h2 id="retailor-title">{t("tailored.retailor.title")}</h2>
        <p className="fine">{t("tailored.retailor.hint")}</p>
        <fieldset className="retailor-sections">
          {TAILOR_SECTIONS.map((section, i) => (
            <label key={section}>
              <input ref={i === 0 ? first : undefined} type="checkbox" checked={picked.has(section)} onChange={() => toggle(section)} />
              {t(`tailor.section.${section}`)}
            </label>
          ))}
        </fieldset>
        {error && <p role="alert" className="form-error">{t("tailor.error.generic")}</p>}
        <div className="row-btns">
          <button type="button" className="secondary" onClick={onClose}>{t("tailored.retailor.cancel")}</button>
          <button type="button" className="primary" disabled={busy || picked.size === 0}
            onClick={() => onStart(TAILOR_SECTIONS.filter((section) => picked.has(section)))}>
            {t("tailored.retailor.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
