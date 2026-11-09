import { useState } from "react";
import { MAX_LONG_TEXT } from "@resumora/shared";
import { t } from "../../i18n/t.ts";

type Props = {
  text: string;
  keywords: string[];
  busy: boolean;
  /** Use it, or Save after Edit: sets the role's description. */
  onUse(text: string): void;
  /** Leaves the description as it is. */
  onSkip(): void;
};

/** 3B: "How should we introduce this role?" — the last step of each role. */
export function DescriptionStep({ text, keywords, busy, onUse, onSkip }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  return (
    <div className="fm-describe">
      <p className="fm-eyebrow">{t("enrich.focus.describe.eyebrow")}</p>
      <h2 className="fm-q" id="fm-step-title">{t("enrich.focus.describe.title")}</h2>
      {editing ? (
        <textarea
          className="fm-describe-edit"
          aria-label={t("enrich.focus.describe.label")}
          value={draft}
          maxLength={MAX_LONG_TEXT}
          rows={4}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <p className="fm-describe-card">{text}</p>
      )}
      {keywords.length > 0 && (
        <p className="fm-describe-ats">
          <span>{t("enrich.focus.describe.ats")}</span>
          {keywords.map((k) => <span key={k} className="fm-chip">{k}</span>)}
        </p>
      )}
      <p className="fm-fine">{t("enrich.focus.describe.line")}</p>
      <div className="fm-foot">
        <button type="button" className="fm-ghost" onClick={onSkip} disabled={busy}>
          {t("enrich.focus.skip")}
        </button>
        {editing ? (
          <button type="button" className="fm-btn" onClick={() => onUse(draft)} disabled={busy || draft.trim() === ""}>
            {t("enrich.focus.describe.save")}
          </button>
        ) : (
          <>
            <button type="button" className="fm-ghost" onClick={() => setEditing(true)} disabled={busy}>
              {t("enrich.focus.describe.edit")}
            </button>
            <button type="button" className="fm-btn" onClick={() => onUse(text)} disabled={busy}>
              {t("enrich.focus.describe.use")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
