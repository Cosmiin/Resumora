import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TailorLanguageSchema, TemplateIdSchema, type Preferences, type PreferencesPatch } from "@resumora/shared";
import { LANGUAGES, setLanguage, useLanguage, type Language } from "../i18n/language.ts";
import { useT } from "../i18n/t.ts";
import { Button, ChipGroup, CoachNote, Notice, Select, Skeleton } from "../ui/index.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { getPreferences, preferencesKey, savePreferences } from "./account-api.ts";

/** Interface language (kept in this browser), plus the defaults new tailored CVs start with (kept with the account). */
export function PreferencesPage() {
  const t = useT();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const key = preferencesKey(useAuth().session?.user.id);
  const preferences = useQuery({ queryKey: key, queryFn: getPreferences });

  // Show the new choice at once. If saving fails, take that one choice back and re-read what the server has:
  // with two changes in flight, "what it was before" may itself be a choice that never got saved.
  const save = useMutation({
    mutationFn: savePreferences,
    onMutate: async (patch: PreferencesPatch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<Preferences>(key);
      if (before) queryClient.setQueryData<Preferences>(key, { ...before, ...patch });
      return { before, patch };
    },
    onError: (_error, _patch, context) => {
      const now = queryClient.getQueryData<Preferences>(key);
      if (now && context?.before) {
        const undone = { ...now };
        for (const field of Object.keys(context.patch) as (keyof Preferences)[]) Object.assign(undone, { [field]: context.before[field] });
        queryClient.setQueryData(key, undone);
      }
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onSuccess: (saved) => {
      // An older answer must not overwrite a newer choice still being saved.
      if (queryClient.isMutating({ mutationKey: ["account", "preferences", "save"] }) <= 1) queryClient.setQueryData(key, saved);
    },
    mutationKey: ["account", "preferences", "save"],
  });

  return (
    <>
      <section className="account-section" aria-labelledby="pref-language-title">
        <h2 className="ui-heading" id="pref-language-title">
          {t("preferences.language.title")}
        </h2>
        <p className="ui-muted account-section-text">{t("preferences.language.text")}</p>
        <div className="account-actions">
          <ChipGroup
            label={t("preferences.language.title")}
            value={language}
            onChange={(value) => setLanguage(value as Language)}
            // Each language is named in itself, so it can be found by someone who doesn't read the current one.
            options={LANGUAGES.map((code) => ({ value: code, label: t(`ui.language.${code}`) }))}
          />
        </div>
      </section>

      {/* Once loaded, the choices stay on screen even if a later refresh fails. */}
      {!preferences.data && !preferences.isError ? (
        <div className="account-section ui-stack" aria-busy="true">
          <span className="ui-sr" role="status">
            {t("account.loading")}
          </span>
          <Skeleton width="40%" height="28px" />
          <Skeleton width="320px" height="48px" />
          <Skeleton width="40%" height="28px" />
          <Skeleton height="120px" />
        </div>
      ) : !preferences.data ? (
        <div className="account-section ui-stack">
          <Notice kind="bad">{t("account.loadError")}</Notice>
          <div className="ui-row">
            <Button onClick={() => void preferences.refetch()}>{t("account.tryAgain")}</Button>
          </div>
        </div>
      ) : (
        <>
          <section className="account-section" aria-labelledby="pref-tailoring-title">
            <h2 className="ui-heading" id="pref-tailoring-title">
              {t("preferences.tailoring.title")}
            </h2>
            <p className="ui-muted account-section-text">{t("preferences.tailoring.text")}</p>
            <div className="account-select">
              <Select
                label={t("preferences.tailoring.label")}
                value={preferences.data.tailoringLanguage}
                onChange={(event) => save.mutate({ tailoringLanguage: event.target.value as Preferences["tailoringLanguage"] })}
              >
                <option value="job">{t("preferences.tailoring.job")}</option>
                <option value="cv">{t("preferences.tailoring.cv")}</option>
                {TailorLanguageSchema.options.map((code) => (
                  <option key={code} value={code}>
                    {t(`language.${code}`)}
                  </option>
                ))}
              </Select>
            </div>
          </section>

          <section className="account-section" aria-labelledby="pref-template-title">
            <h2 className="ui-heading" id="pref-template-title">
              {t("preferences.template.title")}
            </h2>
            <p className="ui-muted account-section-text">{t("preferences.template.text")}</p>
            <fieldset className="account-templates">
              <legend className="ui-sr">{t("preferences.template.title")}</legend>
              {TemplateIdSchema.options.map((id) => (
                <label key={id}>
                  <input type="radio" name="default-template" value={id} checked={preferences.data.defaultTemplate === id} onChange={() => save.mutate({ defaultTemplate: id })} />
                  <span className={`account-thumb account-thumb--${id}`} aria-hidden="true">
                    <i className="h" />
                    <i />
                    <i />
                    <i className="short" />
                    <i />
                    <i className="short" />
                  </span>
                  {t(`preferences.template.${id}`)}
                </label>
              ))}
            </fieldset>
          </section>

          {save.isError && <Notice kind="bad">{t("preferences.error")}</Notice>}
          <div className="account-auto">
            <CoachNote size="sm">{t("preferences.auto")}</CoachNote>
          </div>
        </>
      )}
    </>
  );
}
