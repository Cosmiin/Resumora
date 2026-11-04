import { useState } from "react";
import {
  canCorrectContentLanguage,
  canonicalContentLocale,
  contentLocale,
  contentLanguagePolicyVersion,
} from "@resumora/contracts/editor/content-language";
import { contentLanguageChoices } from "../languages/catalog";
import type { BaseDraft } from "../base/model";
import { Button, useCopy } from "./ui";
export function ContentLanguageControl({
  draft,
  change,
  disabled = false,
}: {
  draft: BaseDraft;
  change(d: BaseDraft): void;
  disabled?: boolean;
}) {
  const t = useCopy(),
    [editing, setEditing] = useState(false),
    [value, setValue] = useState(contentLocale(draft));
  if (
    !canCorrectContentLanguage(draft) ||
    draft.contentLanguage?.status === "insufficient"
  )
    return null;
  return (
    <div className="profile-content-language">
      <p>
        {t("Limba detectată", "Detected language")}: {contentLocale(draft)} ·{" "}
        {draft.contentLanguage?.confidence === "low"
          ? t("încredere scăzută", "low confidence")
          : t("încredere medie", "medium confidence")}
      </p>
      {!editing ? (
        <Button
          disabled={disabled}
          onClick={() => {
            setValue(contentLocale(draft));
            setEditing(true);
          }}
        >
          {t("Corectează limba", "Correct language")}
        </Button>
      ) : (
        <>
          <label>
            {t("Corectează limba CV-ului", "Correct CV language")}
            <input
              list="cv-language-options"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <datalist id="cv-language-options">
            {contentLanguageChoices([contentLocale(draft)]).map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </datalist>
          <Button
            disabled={disabled || !canonicalContentLocale(value)}
            onClick={() => {
              const locale = canonicalContentLocale(value);
              if (!locale) return;
              change({
                ...draft,
                language: locale,
                documentLocale: locale,
                contentLanguage: {
                  locale,
                  confidence: "high",
                  source: "user-correction",
                  policyVersion: contentLanguagePolicyVersion,
                },
              });
              setEditing(false);
            }}
          >
            {t("Salvează limba", "Save language")}
          </Button>
          <Button onClick={() => setEditing(false)}>
            {t("Anulează", "Cancel")}
          </Button>
        </>
      )}
    </div>
  );
}
