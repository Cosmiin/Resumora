---
id: web-editor/history
area: web-editor
files: ["apps/web/src/cv/HistoryPanel.tsx","apps/web/src/cv/historyFormat.ts","apps/web/src/cv/history.test.tsx"]
depends_on: ["web-editor/cv-api","web-editor/document","shared/api-responses","db/cv-repository"]
contract: false
checked_hash: 1f2debe9
cited: [3dfac0, 988e9b, 718c20, 05ebf7, 6988f3, 75f09a, d0c26e, 2baba4, c93b2e, 7110d5, 543788, b9ed7e, 5ddfb1, 718c20, 224250, d8d571, c08a06, ea394d, 37ff6e, 93758d, e89e13, 2af10f, 1c5a97, 4ec527, b5038d, 0de7fc, 36e4c5, 4128a9, 559b92, a59c58, de46ce, 6988f3, 3343f1, 17e277, dac296]
decisions: ["docs/decisions/0005-one-cv-per-user-with-history.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Select and preview saved CV versions while preventing restoration of an unloaded or stale selection.

- History has a fixed query key, zero stale time and zero cache retention. `apps/web/src/cv/HistoryPanel.tsx:38` -> `useQuery`
- Selecting an item clears the previous preview immediately and records the latest requested ID. `apps/web/src/cv/HistoryPanel.tsx:60` -> `async function choose`
- Only the latest requested detail response can set the preview; a latest-request failure clears selection and shows a preview error. `apps/web/src/cv/HistoryPanel.tsx:67` -> `getHistoryItem`; `apps/web/src/cv/HistoryPanel.tsx:71` -> `catch`
- Restore is disabled unless saving is complete, the chosen ID is actually previewed, and no restore is running. `apps/web/src/cv/HistoryPanel.tsx:132` -> `previewed !== chosen`
- Close receives initial focus; Escape closes from anywhere unless an import-screen element is present. `apps/web/src/cv/HistoryPanel.tsx:46` -> `closeRef`; `apps/web/src/cv/HistoryPanel.tsx:52` -> `.import-screen`
- Day grouping combines only adjacent equal labels; it does not sort the supplied history. `apps/web/src/cv/HistoryPanel.tsx:25` -> `groupByDay`
- The reason-label record covers every HistoryItem reason. `apps/web/src/cv/HistoryPanel.tsx:9` -> `reasonLabel`
- Labels use local calendar days and en-GB 24-hour time; non-today headings omit the year. `apps/web/src/cv/historyFormat.ts:3` -> `dayFormat`; `apps/web/src/cv/historyFormat.ts:6` -> `sameDay`; `apps/web/src/cv/historyFormat.ts:19` -> `whenLabel`
- tested by `apps/web/src/cv/history.test.tsx:61` -> `describe("version history"`

## Connections

- Uses the CV client to fetch the chosen snapshot: `apps/web/src/cv/HistoryPanel.tsx:67` -> `getHistoryItem`; `apps/web/src/cv/cv-api.ts:25` -> `getHistoryItem`
- Used by Editor to show a read-only preview and gate restoration: `apps/web/src/cv/Editor.tsx:216` -> `<CvDocument`; `apps/web/src/cv/page/CvDocument.tsx:30` -> `CvDocument`; `apps/web/src/cv/Editor.tsx:251` -> `<HistoryPanel`; `apps/web/src/cv/HistoryPanel.tsx:37` -> `HistoryPanel`
- Grouping receives descending history order from the repository: `apps/web/src/cv/HistoryPanel.tsx:110` -> `groupByDay`; `apps/api/src/cv/supabase-repo.ts:72` -> `order("created_at"`
- Uses global .side-panel.history-panel, whose mobile override keeps the page visible and scrolls only the history body: `apps/web/src/cv/HistoryPanel.tsx:90` -> `history-panel`; `apps/web/src/styles/editor.css:168` -> `.side-panel.history-panel`; `apps/web/src/cv/HistoryPanel.tsx:104` -> `side-panel-body`; `apps/web/src/styles/editor.css:179` -> `.side-panel-body`
- Uses global selection styling and mobile back/close visibility: `apps/web/src/cv/HistoryPanel.tsx:119` -> `aria-pressed`; `apps/web/src/styles/editor.css:190` -> `.history-item[aria-pressed="true"]`; `apps/web/src/cv/HistoryPanel.tsx:99` -> `side-panel-close-icon`; `apps/web/src/styles/editor.css:159` -> `.side-panel-close-icon`; `apps/web/src/cv/HistoryPanel.tsx:100` -> `side-panel-back`; `apps/web/src/styles/editor.css:160` -> `.side-panel-back`

## Assumptions

- The parent must keep canRestore synchronized with autosave; this component does not inspect unsaved data. `apps/web/src/cv/HistoryPanel.tsx:132` -> `canRestore`; `apps/web/src/cv/Editor.tsx:252` -> `status === "saved"`
- Date formatting assumes parseable timestamps; Intl formatting is called without a validation fallback. `apps/web/src/cv/historyFormat.ts:11` -> `new Date`; `apps/web/src/cv/historyFormat.ts:16` -> `timeFormat.format`
