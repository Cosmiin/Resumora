# Base CV · before/after action evidence

> Historical record. This is not the current specification or an active task list. Start with [the current handoff](../../HANDOFF.md).

The old **ce98260c** production bundle and the replacement production bundle were executed through public DOM events in jsdom. This is observed interaction evidence, not a native browser or viewport pass. Native scroll counts and fit at **1366×768** and **390×844** remain unverified because the required Chrome profile could not be positively bound.

The table records the previously captured bundles named by the hashes below; it is not a new production-bundle run of the current review head. The optional month/year picker checks described below execute the current React components in jsdom.

Typing content is excluded. Each Tab/Enter/chord is listed separately. Mouse focus is included in clicks; focus changes also include automatic focus and are not charged a second time. No scroll gestures were scripted; programmatic reveal calls are logged separately and cannot establish whether a native viewport would scroll.

| Task                                                                         | Before: clicks / keys / paste | Previously captured after: clicks / keys / paste | Focus events before → after |
| ---------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------ | --------------------------- |
| 1. Despre tine: 7 câmpuri obligatorii                                        | 2 / 10 / 0                    | 0 / 6 / 0                                        | 14 → 6                      |
| 2. Contact opțional: Website                                                 | 2 / 0 / 0                     | 1 / 0 / 0                                        | 2 → 2                       |
| 3. 6 competențe tehnice                                                      | 1 / 6 / 0                     | 0 / 0 / 1                                        | 1 → 0                       |
| 4. Experiență nouă cu date                                                   | 2 / 5 / 0                     | 1 / 3 / 0                                        | 9 → 5                       |
| 5. Rol curent                                                                | 2 / 0 / 0                     | 1 / 0 / 0                                        | 3 → 1                       |
| 6. Ascunde un câmp                                                           | 2 / 0 / 0                     | 1 / 0 / 0                                        | 3 → 1                       |
| 7. Mută o secțiune 3 poziții                                                 | 3 / 0 / 0                     | 0 / 3 / 0                                        | 1 → 1                       |
| 8. Răspuns și următoarea întrebare                                           | 6 / 0 / 0                     | 0 / 1 / 0                                        | 6 → 0                       |
| 9. Editează din previzualizare                                               | 3 / 0 / 0                     | 1 / 0 / 0                                        | 3 → 2                       |
| 10. CV complet: contacte, rezumat, 2 roluri, 1 școală, 8 competențe, 2 limbi | 23 / 34 / 0                   | 14 / 15 / 1                                      | 55 → 34                     |

## Initial states and counting boundaries

1. Editor deschis; înainte include deschidere/confirmare modal. Primul focus este exclus în ambele variante.

2. Despre tine deja deschis și complet; Website implicit înainte. Adăugare + focus înainte; butonul nou adaugă și focalizează.

3. Câmpul competențelor deja focalizat; Enter ×6 și confirmare înainte, un paste delimitat acum.

4. Secțiunea deja aleasă; intrare nouă, rol/companie și date doar cu an, completarea tastată și Tab.

5. Intrarea deja deschisă; înainte click și confirmare, acum un click.

6. Despre tine deja deschis; emailul existent ascuns. Înainte confirmarea modalului era necesară pentru păstrarea modificării.

7. Panoul de structură deja deschis; înainte 3 clickuri, acum 3 Alt+↑. Traseul drag nativ rămâne neverificat.

8. Intrarea aleasă; înainte focus, revizuire, bifă, aplicare, alegere întrebare nouă și focus. Acum răspunsul are autofocus și Ctrl+Enter avansează.

9. Înainte clickul pe preview nu oferea navigare; traseul măsurat include acea încercare și fallback editor/focus. Acum clickul ajunge direct în câmp.

10. După alegerea modului manual; date fictive, ani fără lună, 8 competențe tehnice. Înainte confirmări și salvare; acum paste pentru competențe și autosave. Selectarea nivelurilor folosește mouse în ambele trasee.

## Targets and exceptions

- Seven required identity fields: **0 clicks + 6 Tabs** after initial focus in the DOM trace. One-screen/no-scroll fit remains a native desktop check.
- Website: **1 click** adds and focuses the field. Six skills: **1 paste, 0 clicks**. New entry: **1 click**, then keyboard; sticky save is implemented but native scrolling-to-save remains a manual check.
- Current role / hide field / preview-to-field each use **1 click**. Section reordering uses **3 Alt+↑ chords**; pointer drag and touch are not natively validated. Enrichment uses **1 Ctrl+Enter chord**, including next-question focus.
- Full CV: **23 clicks + 34 navigation keys before**, **14 clicks + 15 Tabs + 1 paste now**. The strict fewer-than25 target counting _all_ non-typing inputs is **not met** by this 30-input path. If assessed as clicks+scrolls, 14 clicks are observed and native scrolls remain unknown; no pass is claimed.
- Native layout, actual scrolling, required-reading effort, focus/Tab, IME, formatting shortcuts, drag/touch and the file picker remain manual checks. The baseline has two mandatory approval/declaration checkbox interactions in the full flow; the replacement has none. Reading time is not invented.
- Mobile/200% zoom and long content may scroll vertically to preserve readable controls. Save stays in a fixed bar; there is no clipped form, tiny-text shortcut or mobile preview toggle.
- Destructive restore/draft replacement retains its cancellation dialog. Ordinary editing has no modals or per-section confirmations. Source/status details are optional disclosures.
- The captured bundles used page-memory autosave; those traces establish no durable save or account behavior. See the [Base CV guide](../../frontend/base-cv.md#run-and-review) for current persistence. No AI, parsing or export claim is made.

## Optional month/year picker · current component evidence

The date field still accepts typed `LL/AAAA`/`MM/YYYY` and year-only input. The picker icon adds no Tab stop to this path; `Alt+↓` opens the same picker from the date input. The panel has one year input and twelve month buttons, with no day control. Opening or dismissing it does not assign a year or month. A missing year is never replaced with the current year; month buttons remain disabled until the entered year is valid.

| Optional task                                           | Component interaction path                                                                           | Non-typing actions                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Choose month/year from an unknown date                  | Open icon → automatically focused year → type year → click month; selection closes and returns focus | 2 clicks; no confirm                                      |
| Change the month of an existing year                    | Open icon → click month                                                                              | 2 clicks                                                  |
| Keep only a year                                        | Open icon → Year only                                                                                | 2 clicks; month becomes unknown                           |
| Clear the date                                          | Open icon → Unknown date                                                                             | 2 clicks; both values remain unknown                      |
| Keyboard-select January for an existing year-only value | Alt+↓ → Tab from year to January → Enter                                                             | 3 key actions; 0 clicks                                   |
| Dismiss without editing                                 | Open icon → Escape, or Close                                                                         | 1 click + Escape, or 2 clicks; stored precision unchanged |
| Mark an entry ongoing                                   | Existing Present/Ongoing checkbox                                                                    | 1 click; end control closes and its stored value survives |

`MonthYearField.test.tsx` exercises these actual component events, including the two-click month/year path, typed year-only entry, unchanged Tab navigation, Close/outside/Tab dismissal, focus return and Escape. It also exercises the shared control in experience, education, projects, certifications, volunteering and custom entries, checks source lineage, ongoing transitions and immutable save/restore precision. These are source-component DOM checks, not a fresh production action trace or native keyboard/layout acceptance. The earlier full-CV totals above have not been remeasured with optional picker use; optional picker actions must be counted if the reviewer chooses that path.

The owner-approved enrichment behavior also separates career context from CV text: Save and next still uses one shortcut, and does not add CV content. Add/Update/Remove in CV are explicit optional actions, each one button activation. Saved full Q&A survives independent CV edits and removal.

## Reproduce and manually finish acceptance

Run the app as described in [base-cv.md](../../frontend/base-cv.md). In the verified owner profile, set 1366×768 and then 390×844, exercise all ten rows, record actual scrolls/keyboard focus/required reading, then repeat at 200% zoom. Test typing with an IME, touch deletion/reorder, native chooser cancel, preserved bold/italic/lists, month/year picker placement and keyboard behavior, and native destructive-dialog Escape/focus return. Use synthetic data.

Private evidence: `action-budget-production-traces.json` contains every click/key/focus/reveal event and production-bundle SHA256; `action-budget-drive.cjs` is the executable harness. The exact old bundle SHA256 is `06a656e66b00f138abcf74cfd05eb8bb72a86d87954dc2e0fad4ff3b8c1434e8`. The new bundle SHA256 is `9eed0686eb34247fe68991198f7bb4440e0900d678bb8122ca2694be993d4c65`. No source strings or static snapshots stand in for behavior.
