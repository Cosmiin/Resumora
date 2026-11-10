---
id: web-tailor/letter-page
area: web-tailor
files: ["apps/web/src/tailor/LetterPage.tsx","apps/web/src/tailor/cover-letter.test.tsx"]
depends_on: ["shared/tailoring","web-tailor/export-files"]
contract: false
checked_hash: 2addf52f
cited: [d91ed6, 9991fd, beecf9, 7e0374, 67dc63, 425ae7, b2c39c, 1a7e22, f0a364, 552f8e, 5607bc, 8590eb, 950911, 2ddd60, 97044e, 557264, 4ada4d, c26a8f, e3eddb]
decisions: []
open: []
---
Format letter headings and shared greetings in the document language.

- WORDS is exhaustive over TailorLanguage with en, ro, fr, de, es and it greetings, subject prefixes and sign-offs. `apps/web/src/tailor/LetterPage.tsx:5` -> `Record<TailorLanguage`
- letterWords uses Intl long-date formatting in the letter locale, independently of UI translation calls. `apps/web/src/tailor/LetterPage.tsx:19` -> `Intl.DateTimeFormat`
- A trimmed manager selects the named greeting; missing/blank manager selects the hiring-team greeting. `apps/web/src/tailor/LetterPage.tsx:17` -> `manager`; `apps/web/src/tailor/LetterPage.tsx:21` -> `greeting`
- Subject joins role then company with comma-space after the localized prefix. `apps/web/src/tailor/LetterPage.tsx:20` -> `re:`
- The page combines name/contact, date, subject, greeting, provided React body, sign-off and name; blank contact parts are omitted. `apps/web/src/tailor/LetterPage.tsx:39` -> `contact`; `apps/web/src/tailor/LetterPage.tsx:46` -> `words.date`
- tested by `apps/web/src/tailor/cover-letter.test.tsx:108` -> `describe`

## Connections

- Used by CoverLetterTab and export letterParts; export consumes greeting/sign-off but its builders assemble recipient text separately. `apps/web/src/tailor/CoverLetterTab.tsx:100` -> `LetterPage`; `apps/web/src/tailor/LetterPage.tsx:37` -> `LetterPage`; `apps/web/src/export/export-files.ts:52` -> `letterWords`; `apps/web/src/tailor/LetterPage.tsx:15` -> `letterWords`; `apps/web/src/export/pdf.tsx:174` -> `recipient`
- Uses global letter-page layout and letter-re weight. `apps/web/src/tailor/LetterPage.tsx:41` -> `letter-page`; `apps/web/src/styles/tailor.css:122` -> `.letter-page`; `apps/web/src/tailor/LetterPage.tsx:47` -> `letter-re`; `apps/web/src/styles/tailor.css:126` -> `.letter-re`

## Assumptions

- Locale must be one of TailorLanguage's supported keys because WORDS is indexed directly without fallback. `apps/web/src/tailor/LetterPage.tsx:16` -> `WORDS[locale]`; `packages/shared/src/tailor.ts:4` -> `TailorLanguageSchema`
