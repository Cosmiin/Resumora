import { useT } from "../i18n/t.ts";

/** Where the packaged extension is served from (built by `npm run package -w @resumora/extension`). */
export const EXTENSION_DOWNLOAD_URL = "/downloads/resumora-extension.zip";

const STEPS = ["extension.step.1", "extension.step.2", "extension.step.3", "extension.step.4"] as const;

/** The four steps to install the extension by hand. Used on the homepage and in the account area. */
export function InstallSteps() {
  const t = useT();
  return (
    <ol className="install-steps">
      {STEPS.map((key) => (
        <li key={key}>
          <span>{t(key)}</span>
        </li>
      ))}
    </ol>
  );
}
