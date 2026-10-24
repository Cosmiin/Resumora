# Resumora web app — UI kit

Click-through of the core loop (journeys C–E in the repo, simplified):

1. **Home** — one primary action ("Start with a job"), Base CV health, active applications.
2. **Add job** — paste / type / link, one button: "Check my match".
3. **Match report** — verdict sentence + one score, then findings grouped by *what to do* (Ready to add → Already strong → Not in your experience). Eligibility warning persists. Method detail behind "How this is calculated".
4. **Improve CV** — per-change approval with live CV preview; asks separately whether to also update the Base CV.
5. **Download** — before/after score, template + CV language, PDF, then "I’ve sent this application".

Files: `App.jsx` (shell + flow state), `Home.jsx`, `AddJob.jsx`, `MatchReport.jsx`, `Improve.jsx`, `Download.jsx`, `data.js` (synthetic Mara / Northstar fixture from the repo).

This is a **proposed** design — the source repo has no production UI, only a discovery prototype (`prototype/`) whose CSS seeded the tokens. Not yet built: Base CV editor, import/extraction review, enrichment questions, history, plans/checkout, account.
