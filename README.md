# EPP Report Maker

A one-page website for INTERLINK teachers at MKSGT: type each student's four scores and download
Level 1 Final Reports as PDFs that match the Word template (one by one, as a ZIP, or all in one PDF).

- Levels, can-do statements, totals and grade letters follow the *Guide to the Midterm and Final Report
  Templates* (6 October 2026). Statements are copied exactly from `Level_1_Final_Report.docx`.
- Everything runs in the browser. Class data is kept in the browser's own storage and never sent anywhere.
- No build step: open `index.html` through any static web server (GitHub Pages in production).

Files: `index.html`, `styles.css`, `app.js` (page), `report.js` (rules and PDF layout), `statements.js`,
`assets/` (logos; signature labels rendered from Ink Free as pictures), `fonts/` (Carlito, a free
font with the same measurements as Calibri, SIL Open Font License 1.1).
