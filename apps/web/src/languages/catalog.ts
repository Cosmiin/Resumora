import { canonicalContentLocale } from "@resumora/contracts/editor/content-language";
import { documentLocales } from "@resumora/contracts/intelligence/translation";
/** Discovery choices; actual generation availability is checked by each bounded operation. */
const common = [
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "ar",
  "he",
  "uk",
  "pl",
  "nl",
  "tr",
  "el",
  "hi",
  "ja",
  "ko",
  "zh-Hans",
  "zh-Hant",
  "fa",
  "ur",
  "th",
  "vi",
];
export function contentLanguageChoices(extra: string[] = []) {
  const codes = [
    ...new Set(
      [...documentLocales.map((l) => l.code), ...common, ...extra]
        .map((c) => canonicalContentLocale(c))
        .filter((c): c is string => !!c),
    ),
  ];
  return codes.map((code) => ({
    code,
    label:
      documentLocales.find((l) => l.code === code)?.label ??
      new Intl.DisplayNames([code], { type: "language" }).of(code) ??
      code,
  }));
}
