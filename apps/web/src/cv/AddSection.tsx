import { useRef, useState } from "react";
import { MAX_ITEMS, newId, type CvContent } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import type { BlockRef } from "./page/blocks.ts";
import { blankItem, type ListSection } from "./sections/blank.ts";
import { listItems, withListItems } from "./PanelBody.tsx";

const options: { section: ListSection; label: MessageKey }[] = [
  { section: "experience", label: "cv.experience" },
  { section: "education", label: "cv.education" },
  { section: "languages", label: "cv.languages" },
  { section: "certifications", label: "cv.certifications" },
  { section: "projects", label: "cv.projects" },
  { section: "custom", label: "addSection.custom" },
];

/**
 * "+ Add a section": the list sections the CV doesn't have yet, plus "Skills" and another
 * custom section (each custom entry is its own section on the page).
 */
export function AddSection({ cv, onChange, onAdd }: { cv: CvContent; onChange(next: CvContent): void; onAdd(ref: BlockRef): void }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const available = options.filter((o) => o.section === "custom" || listItems(cv, o.section).length === 0);

  function add(section: ListSection) {
    const id = newId();
    onChange(withListItems(cv, section, [...listItems(cv, section), { ...blankItem[section](), id }]));
    setOpen(false);
    onAdd({ section, itemId: id });
  }

  return (
    <div className="add-section">
      <button
        type="button"
        ref={buttonRef}
        className="secondary add-section-button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {t("addSection.open")}
      </button>
      {open && (
        <ul
          className="add-section-list"
          aria-label={t("addSection.label")}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            setOpen(false);
            buttonRef.current?.focus();
          }}
        >
          {available.map(({ section, label }) => (
            <li key={section}>
              <button type="button" disabled={listItems(cv, section).length >= MAX_ITEMS} onClick={() => add(section)}>
                {t(label)}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAdd({ section: "skills" });
              }}
            >
              {t("cv.skills")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
