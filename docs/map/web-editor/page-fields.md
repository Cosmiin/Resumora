---
id: web-editor/page-fields
area: web-editor
files: ["apps/web/src/cv/edit/PageField.tsx","apps/web/src/cv/edit/DateField.tsx","apps/web/src/cv/edit/ItemField.tsx","apps/web/src/cv/edit/ItemDate.tsx","apps/web/src/cv/edit/page-field.test.tsx","apps/web/src/cv/edit/date-field.test.tsx","apps/web/src/cv/edit/speed.test.tsx"]
depends_on: ["web-editor/reducer","shared/cv","shared/dates"]
contract: false
checked_hash: b026e5b5
cited: [f229bf, 306040, 0e5bb8, 21df7f, 8f210a, 888a7d, f0d8d1, fef32b, a1cc9a, 37d953, a9edeb, 05002f, c8e7d4, 73cd05, d305b9, 7c199d, ce3ac8, 6cdc90, ea48c9, 60614f, 3814a9, c13a2e, c4a7b2, df7a26, 74d76b, c52d39, 37d243, eea587, 0152a4, d42873, 5f7317, fa2c7b, 5ca537, e11db3, 0fef56, 510d48, f89f06, f9013e, 5f2c1c]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Adapt typed page text and dates into stable reducer actions.

- PageField renders a controlled text input or one-row textarea with aria-label, data-field and a shared default MAX_TEXT limit. `apps/web/src/cv/edit/PageField.tsx:42` -> `MAX_TEXT`; `apps/web/src/cv/edit/PageField.tsx:70` -> `const common`; `apps/web/src/cv/edit/PageField.tsx:82` -> `return multiline`
- Native field-sizing support bypasses manual sizing; otherwise textareas use scrollHeight and inputs size from value or placeholder length. `apps/web/src/cv/edit/PageField.tsx:20` -> `supportsFieldSizing`; `apps/web/src/cv/edit/PageField.tsx:25` -> `grow`
- Sizing runs in a layout effect when value or multiline changes; refs are forwarded to callback or object refs. `apps/web/src/cv/edit/PageField.tsx:52` -> `useLayoutEffect`; `apps/web/src/cv/edit/PageField.tsx:56` -> `setRef`
- ItemField sends setItemField for the explicit list/item/field and emits list-ID-field as its DOM key. `apps/web/src/cv/edit/ItemField.tsx:20` -> `onChange`; `apps/web/src/cv/edit/ItemField.tsx:26` -> `fieldKey`
- DateField keeps a local draft: invalid dates show a hint and never commit, valid present calls only the optional onPresent callback. `apps/web/src/cv/edit/DateField.tsx:33` -> `const change`
- External date changes update the draft only while unfocused; blur resets the draft to formatted stored content and clears errors. `apps/web/src/cv/edit/DateField.tsx:26` -> `useEffect`; `apps/web/src/cv/edit/DateField.tsx:48` -> `onBlur`
- ItemDate supplies an onCommit action but no onPresent callback, unlike role end dates. `apps/web/src/cv/edit/ItemDate.tsx:19` -> `onCommit`; `apps/web/src/cv/edit/ItemDate.tsx:24` -> `<DateField`; `apps/web/src/cv/edit/sections/RoleItem.tsx:139` -> `onPresent`
- tested by `apps/web/src/cv/edit/page-field.test.tsx:22` -> `describe("PageField"`; `apps/web/src/cv/edit/date-field.test.tsx:13` -> `describe("DateField"`; `apps/web/src/cv/edit/speed.test.tsx:51` -> `describe("typing speed"`

## Connections

- Uses shared date parsing and locale formatting: `apps/web/src/cv/edit/DateField.tsx:35` -> `parseTypedDate`; `packages/shared/src/dates.ts:41` -> `parseTypedDate`; `apps/web/src/cv/edit/DateField.tsx:20` -> `formatYearMonth`; `packages/shared/src/dates.ts:62` -> `formatYearMonth`
- Uses reducer list/field membership checks: `apps/web/src/cv/edit/ItemField.tsx:21` -> `setItemField`; `apps/web/src/cv/edit/cvReducer.ts:185` -> `setItemField`
- Uses ancestor .cv-page input/textarea rules to remove form borders, inherit type and grow fields: `apps/web/src/cv/edit/PageField.tsx:83` -> `<textarea`; `apps/web/src/cv/edit/PageField.tsx:89` -> `<input`; `apps/web/src/cv/edit/EditablePage.tsx:92` -> `cv-page`; `apps/web/src/styles/cv-page.css:49` -> `.cv-page :is(input, textarea)`; `apps/web/src/styles/cv-page.css:61` -> `field-sizing`; `apps/web/src/styles/cv-page.css:64` -> `.cv-page textarea`
- Uses global .cv-date-field/.is-wide and .date-hint for positioning and role-end width: `apps/web/src/cv/edit/DateField.tsx:55` -> `cv-date-field`; `apps/web/src/styles/cv-page.css:79` -> `.cv-date-field`; `apps/web/src/styles/cv-page.css:136` -> `.is-wide`; `apps/web/src/cv/edit/DateField.tsx:66` -> `date-hint`; `apps/web/src/styles/cv-page.css:80` -> `.date-hint`

## Assumptions

- maxLength limits user input but cannot validate supplied values; autosave validates the complete CV. `apps/web/src/cv/edit/PageField.tsx:75` -> `maxLength`; `apps/web/src/cv/useAutosave.ts:175` -> `safeParse`
- Date drafts are local UI state, so invalid/uncommitted text is not part of the saved CV. `apps/web/src/cv/edit/DateField.tsx:21` -> `useState`; `apps/web/src/cv/edit/DateField.tsx:36` -> `!parsed.ok`
