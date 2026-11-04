// Print styles for the evaluation CVs. One base look, then one block per layout variant.
export const STYLES = `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.4 "Segoe UI", Arial, sans-serif; color: #1c2430; margin: 0; }
h1 { font-size: 22pt; margin: 0 0 2px; }
h2 { font-size: 11pt; letter-spacing: .06em; margin: 14px 0 6px; border-bottom: 1px solid #b8c0cc; padding-bottom: 2px; }
h3 { font-size: 10.5pt; margin: 0; }
p { margin: 3px 0; }
ul { margin: 4px 0 4px 18px; padding: 0; }
li { margin: 2px 0; }
ul.plain, ul.contact { list-style: none; margin-left: 0; }
.titles { color: #4a5568; margin-bottom: 6px; }
.meta, .dates { color: #4a5568; font-size: 9.5pt; }
.item { margin: 0 0 9px; break-inside: avoid; }
.lbl { color: #4a5568; }
.ico { fill: #2b6cb0; vertical-align: -2px; margin-right: 6px; }
section { break-inside: auto; }
.cols { display: grid; gap: 22px; }
.cols.two { grid-template-columns: 2fr 1fr; }
.cols.three { grid-template-columns: 1fr 1.7fr 1fr; gap: 16px; font-size: 9.5pt; }
body.sidebar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.side { display: grid; grid-template-columns: 72mm 1fr; min-height: 297mm; }
.side aside { background: #1f3a5f; color: #fff; padding: 16mm 8mm; }
.side aside h2 { border-color: #7f9cc4; }
.side aside .lbl, .side aside .meta { color: #cbd8ea; }
.side main { padding: 16mm 12mm; }
table.layout { width: 100%; border-collapse: collapse; }
table.layout th { width: 32mm; text-align: left; vertical-align: top; font-size: 9.5pt; letter-spacing: .05em; padding: 8px 8px 8px 0; }
table.layout td { vertical-align: top; padding: 8px 0; border-top: 1px solid #d5dbe3; }
body.long { font-size: 11.5pt; line-height: 1.55; }
body.long .item { margin-bottom: 14px; }
`;
