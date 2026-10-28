import { useId } from "react";
import { useCopy } from "../components/ui";
import { cvTemplates, resolveTemplate } from "./registry";

export function TemplateChooser({
  value,
  onChange,
}: {
  value?: string;
  onChange: (versionId: string) => void;
}) {
  const id = useId(),
    t = useCopy(),
    template = resolveTemplate(value);
  return (
    <div className="template-chooser">
      <label htmlFor={id}>{t("Șablon", "Template")}</label>
      <select
        id={id}
        className="native"
        value={value ?? ""}
        aria-describedby={`${id}-description`}
        onChange={(event) => onChange(event.target.value)}
      >
        {!template && (
          <option value={value ?? ""} disabled hidden>
            {value
              ? t("Șablon salvat indisponibil", "Saved template unavailable")
              : t("Alege un șablon", "Choose a template")}
          </option>
        )}
        {cvTemplates.map((item) => (
          <option key={item.versionId} value={item.versionId}>
            {item.name}
          </option>
        ))}
      </select>
      <p id={`${id}-description`}>
        {template
          ? t(template.description.ro, template.description.en)
          : t(
              "Alegerea schimbă aspectul, păstrând informațiile din CV.",
              "Changing the layout keeps your CV content.",
            )}
      </p>
    </div>
  );
}
