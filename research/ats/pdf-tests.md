# PDF extraction and reading-order test design v1

PDF readiness is separate from semantic compatibility. States `untested|pass|warn|fail`; every new template/font/renderer revision startsuntested. A browser HTML preview is not a PDF pass. This scout designs tests; no production PDF renderer or successful ATS ingestion is claimed.

## Pipeline to implement after approval

1. Freeze canonical document,selected contacts/sections/prose,template version,fonts,locale and renderer build. Render safely escaped HTML/CSS print with pinned Chromium,network off,local reviewed fonts,known page size/margins. No arbitrary userHTML/SVG/remote resources.
2. Extract text independently withPDF.js text items (page,transform,x/y,w/h andstrings) andPoppler `pdftotext -layout` /plain order. Two independent engines catch some parser-specific failures; neither proves all ATS compatibility.
3. Compare normalized extracted content to the **selected approved projection**,not the entire Base CV. Expected sequence:name→two selected titles→exportable contacts→section headings in chosen order→entry title/employer/location/date→scope/bullets. Confirm hidden/private facts absent. Define partial-date literal expectations without invented months;RO diacritics and EnglishPresent supported. Identity heading is prominent visually; contact text must be real PDF text,not image/icon only.
4. Required text coverage:all intended contact values/headings/employer-role-date tokens present;>=99%normalized body-token recall as proposed starting target;zero private/unconfirmed/suggested content leakage. Investigate ligatures/line-break hyphenation/Unicode normalization before blindly failing expected words.
5. Reading order:stable section and entry sentinel IDs in synthetic fixtures;extract positional sequence and compute inversions/Kendall order. Zero cross-role mixing or heading-body inversion;allow line wrapping inside same bullet. Check multi-page continuation,headers/footers not interspersed and selectable text layering. Template-specific decorative nodes cannot interrupt semantic order.
6. Visual checks atA4/Letter,page1–4 and print scaling:clipped text,overflows,widows/orphans,cut bullets,blank pages,font fallback,contrast and accessibility of headings/links. Semantic extraction cannot detect all visual defects; use stable screenshot diffs with tolerance and manual sample review. Prefer one-column template; more columns multiply test cases.
7. Persist `{exportId,contentHash,templateVersion,fontHashes,rendererVersion,extractors,locale,coverage,missingTokens,unexpectedPrivateTokens,orderViolations,pageCount,state,checkedAt}`. Failures block export or provide a tested plain one-column fallback;warn for nonfatal cosmetic caveats;test never silently upgrades semantic score.

## Synthetic fixtures

- Minimal CV/name and email;no optional sections;second title blank.
- Full two-titleROCV:ș/ț/ă/î/â,email,+40phone,links,city/country,private address absent;two simultaneous roles and year-only dates.
- English job variant with reorderedProjects;hidden certification and rejected claims absent;selected3bullets versusallBase evidence.
- Long4page employment,hyphenated/punctuatedC++/C#/SQL,metric20%,a longURL,very long company name and empty optional section omitted.
- Adversarial template with two columns/tables,header contacts,image-onlytext,white text overlay;test must fail orwarn appropriate criteria rather thanclaim universal ATS incompatibility.
- User strings containingHTML,script-like text,external URLs,RTL/bidi controls;no execution or private network access.
- Source PDF scans/encrypted uploads:extractor signals needs_input/manual fallback;do not confuse source quality withgenerated exportquality.

Strategy source E-ATS-01: [Greenhouse parser guidance](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse),updated2026-03-02,relayed2026-10-23. Vendor-specific parsing risks inform fixture selection; its2.5MB limit is not a universal ATS export rule. Primary rendering/extraction library links in architectureE-18/E-19.
