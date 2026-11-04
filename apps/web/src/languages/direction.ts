/** Script-aware direction also respects explicit Latin variants of RTL languages. */
export function contentDirection(locale: string): "rtl" | "ltr" {
  const script = new Intl.Locale(locale).maximize().script;
  return script &&
    [
      "Arab",
      "Hebr",
      "Syrc",
      "Thaa",
      "Nkoo",
      "Adlm",
      "Rohg",
      "Mand",
      "Samr",
    ].includes(script)
    ? "rtl"
    : "ltr";
}
