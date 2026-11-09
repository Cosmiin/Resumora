import { Font } from "@react-pdf/renderer";
import serifRegular from "@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff?url";
import serifBold from "@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff?url";
import serifExtRegular from "@fontsource/source-serif-4/files/source-serif-4-latin-ext-400-normal.woff?url";
import serifExtBold from "@fontsource/source-serif-4/files/source-serif-4-latin-ext-700-normal.woff?url";
import sansRegular from "@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff?url";
import sansBold from "@fontsource/instrument-sans/files/instrument-sans-latin-700-normal.woff?url";
import sansExtRegular from "@fontsource/instrument-sans/files/instrument-sans-latin-ext-400-normal.woff?url";
import sansExtBold from "@fontsource/instrument-sans/files/instrument-sans-latin-ext-700-normal.woff?url";
import letterRegular from "@fontsource/newsreader/files/newsreader-latin-400-normal.woff?url";
import letterBold from "@fontsource/newsreader/files/newsreader-latin-700-normal.woff?url";
import letterExtRegular from "@fontsource/newsreader/files/newsreader-latin-ext-400-normal.woff?url";
import letterExtBold from "@fontsource/newsreader/files/newsreader-latin-ext-700-normal.woff?url";

// React-pdf 4.9 selects a font for each glyph from these fallback arrays.
export const PDF_FONTS = {
  serif: ["Source Serif 4", "Source Serif 4 Extended"],
  sans: ["Instrument Sans", "Instrument Sans Extended"],
  letter: ["Newsreader", "Newsreader Extended"],
};

let registered = false;

export function registerPdfFonts() {
  if (registered) return;
  for (const [family, regular, bold] of [
    [PDF_FONTS.serif[0]!, serifRegular, serifBold],
    [PDF_FONTS.serif[1]!, serifExtRegular, serifExtBold],
    [PDF_FONTS.sans[0]!, sansRegular, sansBold],
    [PDF_FONTS.sans[1]!, sansExtRegular, sansExtBold],
    [PDF_FONTS.letter[0]!, letterRegular, letterBold],
    [PDF_FONTS.letter[1]!, letterExtRegular, letterExtBold],
  ]) {
    Font.register({
      family: family!,
      fonts: [
        { src: regular!, fontWeight: 400 },
        { src: bold!, fontWeight: 700 },
      ],
    });
  }
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
