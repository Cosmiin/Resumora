---
id: web-tailor/pdf-fonts
area: web-tailor
files: ["apps/web/src/export/pdf-fonts.ts","apps/web/src/export/pdf.test.tsx"]
depends_on: ["web-tailor/pdf"]
contract: false
checked_hash: 27ddf424
cited: [8b8234, 00591d, eb85a5, 5c06fa, d1a404, 61d345, 50bc0d, 70a803, 7f4895, c7775d, 349ece, eb85a5, c28cfa, f6c8d3, 00591d, f8d246, 513544]
decisions: []
open: []
---
Register bundled Latin and Latin-extended fonts and disable PDF word splitting.

- This is runtime registration code, not pure embedded/generated font data: it imports Font and bundled WOFF URLs. `apps/web/src/export/pdf-fonts.ts:1` -> `Font`; `apps/web/src/export/pdf-fonts.ts:2` -> `woff?url`
- PDF_FONTS maps serif to Source Serif 4, sans to Instrument Sans and letter to Newsreader, each with an Extended fallback family. `apps/web/src/export/pdf-fonts.ts:16` -> `PDF_FONTS`
- The family loop registers six families with regular and bold files. `apps/web/src/export/pdf-fonts.ts:26` -> `for`
- Registered weights are 400 and 700; no italic registration exists in the fonts array. `apps/web/src/export/pdf-fonts.ts:36` -> `fonts`
- Registration is guarded by a module flag set only after registering fonts and the hyphenation callback. `apps/web/src/export/pdf-fonts.ts:25` -> `registered`; `apps/web/src/export/pdf-fonts.ts:43` -> `registered = true`
- The hyphenation callback returns the entire word as one segment. `apps/web/src/export/pdf-fonts.ts:42` -> `registerHyphenationCallback`
- tested by `apps/web/src/export/pdf.test.tsx:272` -> `describe`

## Connections

- Used by PDF CV themes and the letter theme; both builders call registration. `apps/web/src/export/pdf.tsx:13` -> `PDF_FONTS.serif`; `apps/web/src/export/pdf.tsx:167` -> `PDF_FONTS.letter`; `apps/web/src/export/pdf-fonts.ts:16` -> `PDF_FONTS`; `apps/web/src/export/pdf.tsx:34` -> `registerPdfFonts(`; `apps/web/src/export/pdf-fonts.ts:24` -> `registerPdfFonts`

## Assumptions

- The bundler must resolve fontsource WOFF ?url imports; glyph fallback depends on the font-family arrays passed to react-pdf. `apps/web/src/export/pdf-fonts.ts:2` -> `woff?url`; `apps/web/src/export/pdf-fonts.ts:17` -> `Extended`; `apps/web/src/export/pdf.tsx:40` -> `fontFamily: theme.fontFamily`
