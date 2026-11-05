# Perfect CV · Plan A: CV format v2 and categories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every CV the same 15 categories (format v2 with layout: order, hidden, own headings), upgrade v1 automatically, and compute missing-section flags, so Plans B and C have a stable base.

**Architecture:** All new logic lives in `packages/shared` (one category list, the v2 zod schema, `upgradeCv`, `missingCategories`, typed-date parsing). The API reads v1 or v2 and always returns v2; it saves only v2. The web app renders v2 in layout order; editing of the new sections arrives in Plan C.

**Tech Stack:** TypeScript 5.9, zod 4, vitest 5, Hono (API), React 19 (web).

**Spec:** `docs/superpowers/specs/2026-11-04-perfect-cv-design.md`

## Global Constraints

- Run Node from Git Bash with `export PATH="/c/Program Files/nodejs:$PATH";` first.
- Check before every commit: `npm run lint && npm run typecheck && npm test` (from the repo root).
- Plain words in code: never "fence", "receipt", "settlement", "provenance", "lease".
- UI strings go in `apps/web/src/i18n/en.ts`. CV headings (what appears on the CV itself) come from `categories.ts` in the CV's own locale.
- Skills stay three groups: `technicalSkills`, `professionalSkills`, `unclearSkills`. Never merge them.
- Keep files under ~300 lines. Conventional one-line commit subjects ending with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` line.
- Never stage `AGENTS.md`, `docs/learning/`, or decision records you did not write, or the architecture-companion spec and plan (another session's work). Always `git add` explicit paths.
- No database migration: `content` is `jsonb`.
- Limits: `achievements` max 10 bullets; every other new list max `MAX_ITEMS` (40); text fields use `MAX_TEXT` / `MAX_LONG_TEXT` like v1.

## Review Focus

1. **A v1 CV with data in every list** must come back as v2 with every field unchanged (no lost bullets or skills) → test in Task 2.
2. **A `layout.order` that is missing keys or repeats one** (hand-edited or an old client) must still render every section exactly once → `normalizeLayout` test in Task 2.
3. **A hidden flagged section** must never be flagged; **a section that exists but is empty** (e.g. summary `"   "`) must be flagged → tests in Task 3.
4. **Romanian dates with diacritics** ("mai 2020", "septembrie 2019", "prezent") and two-digit months ("3.2021") → tests in Task 4.
5. **History versions saved as v1** must open in History and restore as v2 → test in Task 6.

---

### Task 1: The category list

**Files:**
- Create: `packages/shared/src/categories.ts`
- Create: `packages/shared/src/categories.test.ts`
- Modify: `packages/shared/src/index.ts` (export it)

**Interfaces:**
- Produces:
  - `type SectionKey = "summary" | "achievements" | "experience" | "skills" | "education" | "languages" | "certifications" | "projects" | "volunteering" | "awards" | "courses" | "publications" | "interests" | "other"` (no `header`: it is always first and can't be moved or hidden)
  - `type CategoryKey = "header" | SectionKey`
  - `type FlagLevel = "missing" | "tip"`
  - `type Category = { key: CategoryKey; label: { en: string; ro: string }; flag: FlagLevel | null; why: string; synonyms: { en: string[]; ro: string[] } }` (`why` is the gentle English reason shown with a flag; empty for unflagged categories)
  - `CATEGORIES: readonly Category[]` in table order (header first)
  - `CATEGORY: Record<CategoryKey, Category>`
  - `SECTION_KEYS: readonly SectionKey[]` = the default order: summary, achievements, experience, skills, education, languages, certifications, projects, volunteering, awards, courses, publications, interests, other

- [ ] **Step 1: Write the failing tests** in `categories.test.ts`:
  - `every category has an English and a Romanian label` → for each, `label.en` and `label.ro` are non-empty.
  - `every category except other has synonyms in both languages` → `synonyms.en.length >= 1 && synonyms.ro.length >= 1`.
  - `flags match the spec` → `CATEGORY.header.flag === "missing"`, same for summary, achievements, experience, skills, education; `CATEGORY.languages.flag === "tip"`; all others `null`.
  - `SECTION_KEYS is the default order, without header, each once` → `expect(SECTION_KEYS).toEqual([...the 14 keys above...])`.
  - `no synonym is listed under two categories` → build a map of lower-cased synonyms; no duplicates.
- [ ] **Step 2: Run** `npm test -w packages/shared -- categories`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `categories.ts`.** Labels and flags exactly as in the spec table. Example synonyms (extend freely, at least 2 per language where natural):
  - summary: en "Profile", "About me", "Professional summary"; ro "Profil", "Despre mine", "Rezumat profesional"
  - achievements: en "Highlights", "Key accomplishments"; ro "Realizări", "Realizări principale"
  - experience: en "Work experience", "Employment history", "Career"; ro "Experiență profesională", "Experiență", "Istoric profesional"
  - skills: en "Competencies", "Toolbox", "Technical skills"; ro "Competențe", "Abilități", "Aptitudini"
  - education: en "Studies", "Academic background"; ro "Studii", "Educație și formare"
  - languages: en "Language skills", "Foreign languages"; ro "Limbi străine", "Competențe lingvistice"
  - certifications: en "Certificates", "Licenses"; ro "Certificări", "Certificate"
  - projects: en "Selected projects", "Portfolio"; ro "Proiecte", "Portofoliu"
  - volunteering: en "Volunteer work", "Community"; ro "Voluntariat", "Activități de voluntariat"
  - awards: en "Honours", "Awards"; ro "Premii", "Distincții"
  - courses: en "Training", "Professional development"; ro "Cursuri", "Formare profesională"
  - publications: en "Papers", "Articles"; ro "Publicații", "Articole"
  - interests: en "Hobbies", "Interests"; ro "Hobby-uri", "Interese"
  - header: en "Contact", "Personal details"; ro "Date personale", "Contact"
  - `why` text: header "The CV needs your name and email at the top."; summary "Recruiters read this first. Two to four sentences is enough."; achievements "Three to five results you are proud of make a strong opening."; experience "Add your roles, newest first."; skills "Most job filters match on skills."; education "Add your highest degree or school."; languages "Worth adding if you speak more than one language."
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): one category list for the perfect CV`.

### Task 2: CV format v2, upgrade from v1, layout repair

**Files:**
- Modify: `packages/shared/src/cv.ts` (rename the current object schema to `CvContentV1Schema`; add v2)
- Create: `packages/shared/src/upgrade.ts`
- Modify: `packages/shared/src/cv.test.ts`
- Create: `packages/shared/src/upgrade.test.ts`

**Interfaces:**
- Consumes: `SectionKey`, `SECTION_KEYS` (Task 1).
- Produces:
  - Item schemas and types: `AwardSchema {id,name,issuer,date: YearMonth,description: long}`, `CourseSchema {id,name,provider,date}`, `PublicationSchema {id,title,publisher,date,url}`, `InterestSchema {id,name}`; `Volunteering` reuses `ExperienceSchema`.
  - `LayoutSchema = { order: SectionKey[]; hidden: SectionKey[]; titles: Partial<Record<SectionKey, string>> }` (titles max `MAX_TEXT` each)
  - `CvContentSchema` = v2: everything in v1 with `schemaVersion: z.literal(2)` plus `achievements: Bullet[] (max 10)`, `volunteering`, `awards`, `courses`, `publications`, `interests`, `layout`. `CvContent` is the v2 type. `MAX_ACHIEVEMENTS = 10`.
  - `CvContentV1Schema` (the current schema, unchanged), `type CvContentV1`.
  - `emptyCv(locale)` returns v2 with `layout: defaultLayout()`.
  - In `upgrade.ts`: `defaultLayout(): Layout` (order = `[...SECTION_KEYS]`, hidden `[]`, titles `{}`); `upgradeCv(v1: CvContentV1): CvContent`; `normalizeLayout(layout: Layout): Layout` (drops unknown and repeated keys, appends missing keys in default order, drops `hidden` entries not in order, drops titles that are empty after trim); `StoredCvSchema` = `z.union([CvContentSchema, CvContentV1Schema]).transform(c => c.schemaVersion === 1 ? upgradeCv(c) : { ...c, layout: normalizeLayout(c.layout) })`.

- [ ] **Step 1: Write failing tests** in `upgrade.test.ts`:
  - `upgradeCv keeps every v1 field` → build a v1 CV with one item in every list (experience with 2 bullets, all three skill groups, languages, certifications, projects, custom); `upgradeCv(v1)` → `schemaVersion === 2`, each v1 key deep-equals the original, new lists `[]`, `layout` equals `defaultLayout()`.
  - `StoredCvSchema accepts v1 and returns v2` → `StoredCvSchema.parse(v1).schemaVersion === 2`.
  - `StoredCvSchema accepts v2 unchanged` → round-trips `emptyCv("ro")`.
  - `normalizeLayout repairs order` → input order `["skills","skills","bogus","summary"]` (cast) gives `["skills","summary", ...the other 12 in default order]`.
  - `normalizeLayout drops blank titles and stray hidden keys`.
  In `cv.test.ts`: `CvContentSchema rejects v1` → `CvContentSchema.safeParse(v1).success === false`; `achievements is limited to 10`.
- [ ] **Step 2: Run** `npm test -w packages/shared`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the schemas in `cv.ts` and `upgrade.ts` as in Interfaces. Export `upgrade.ts` from `index.ts`. `CvContentSchema` must stay `.strict()`. Fix existing shared tests and fixtures that build v1 objects through `emptyCv` (they now get v2).
- [ ] **Step 4: Run** `npm test -w packages/shared && npm run typecheck -w packages/shared`. Expected: PASS. (API and web typecheck breaks are fixed in Tasks 5–7.)
- [ ] **Step 5: Commit** `feat(shared): CV format v2 with layout, upgraded from v1 on read`.

### Task 3: Missing-section flags

**Files:**
- Create: `packages/shared/src/flags.ts`, `packages/shared/src/flags.test.ts`

**Interfaces:**
- Consumes: `CATEGORY`, `CvContent`.
- Produces: `type Flag = { key: CategoryKey; level: FlagLevel; field?: "fullName" | "email" }`; `missingCategories(cv: CvContent): Flag[]` in page order (header flags first: name, then email; then sections in `layout.order`); `isSectionEmpty(cv: CvContent, key: SectionKey): boolean`.

- [ ] **Step 1: Write failing tests:**
  - `an empty CV flags name, email and the five missing sections, then languages as a tip` → `missingCategories(emptyCv())` equals `[{key:"header",level:"missing",field:"fullName"},{key:"header",level:"missing",field:"email"},{key:"summary",level:"missing"},{key:"achievements",level:"missing"},{key:"experience",level:"missing"},{key:"skills",level:"missing"},{key:"education",level:"missing"},{key:"languages",level:"tip"}]`.
  - `a hidden section is never flagged` → hide `achievements` and `languages`; neither appears.
  - `whitespace-only summary counts as empty`.
  - `skills count as filled when any group has a skill, including to-sort`.
  - `flags follow layout order` → move `education` before `summary`; education flag comes first among sections.
  - `achievements with only blank bullets counts as empty`.
- [ ] **Step 2: Run** `npm test -w packages/shared -- flags`. Expected: FAIL.
- [ ] **Step 3: Implement.** `isSectionEmpty`: summary → `basics.summary.trim()===""`; skills → all three groups empty; achievements → every bullet blank; other → list length 0; header is not a section.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): flag missing CV sections`.

### Task 4: Typed dates

**Files:**
- Create: `packages/shared/src/dates.ts`, `packages/shared/src/dates.test.ts`

**Interfaces:**
- Produces: `type TypedDate = { ok: true; value: string; present: boolean } | { ok: false }`; `parseTypedDate(input: string): TypedDate` (`value` is `"YYYY-MM"`, `"YYYY"` or `""`); `formatYearMonth(value: string, locale: Locale): string`.

- [ ] **Step 1: Write failing tests** (table-driven):
  - ok: `""`→`""`; `"2021"`→`"2021"`; `"Mar 2021"`, `"march 2021"`, `"Mar. 2021"`, `"03/2021"`, `"3.2021"`, `"3/2021"`, `"2021-03"` → `"2021-03"`; `"mai 2020"`→`"2020-05"`; `"septembrie 2019"`, `"sept. 2019"` → `"2019-09"`; `"ian 2018"`→`"2018-01"`; `"present"`, `"Present"`, `"prezent"`, `"now"`, `"acum"` → `{ok:true,value:"",present:true}`.
  - not ok: `"Spring"`, `"13/2021"`, `"2021-13"`, `"21"`, `"Mar"`.
  - `formatYearMonth("2021-03","en")==="Mar 2021"`; `formatYearMonth("2021-03","ro")==="mar. 2021"`; `formatYearMonth("2021","en")==="2021"`; `formatYearMonth("","en")===""`.
- [ ] **Step 2: Run** `npm test -w packages/shared -- dates`. Expected: FAIL.
- [ ] **Step 3: Implement** with a month-name table (en full and 3-letter; ro full and short: ian, feb, mar, apr, mai, iun, iul, aug, sep/sept, oct, noi, dec), lower-cased, trailing dot allowed. Romanian short display names: `ian., feb., mar., apr., mai, iun., iul., aug., sept., oct., nov., dec.`.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): read typed dates in English and Romanian`.

### Task 5: Import produces v2

**Files:**
- Modify: `packages/shared/src/imports.ts` (`toCvContent` builds v2; `ImportResultSchema.content` uses `StoredCvSchema`)
- Modify: `packages/shared/src/imports.test.ts`

**Interfaces:**
- Consumes: `defaultLayout`, `StoredCvSchema`.
- Produces: `toCvContent(draft)` returns `content.schemaVersion === 2`, new lists empty, `layout = defaultLayout()`. `ImportResultSchema` parses stored v1 results into v2. (The draft schema itself is unchanged here; Plan B extends it.)

- [ ] **Step 1: Write failing tests:** `toCvContent returns v2 with the default layout`; `ImportResultSchema upgrades a stored v1 result`.
- [ ] **Step 2: Run** `npm test -w packages/shared -- imports`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w packages/shared`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): imports produce CV format v2`.

### Task 6: API reads v1 or v2, saves only v2

**Files:**
- Modify: `apps/api/src/cv/supabase-repo.ts` (`storedCv` uses `StoredCvSchema`)
- Modify: `apps/api/src/cv/memory-repo.ts` if it stores raw values (keep it consistent)
- Modify: `apps/api/src/imports/supabase-repo.ts` (already uses `ImportResultSchema`; confirm)
- Modify: `apps/api/test/cv.test.ts`, `apps/api/test/supabase-repo.test.ts` and any fixture using v1

**Interfaces:**
- Consumes: `StoredCvSchema`, `CvContentSchema` (v2).
- Produces: `GET /v1/cv`, history detail and import results always return v2; `PUT /v1/cv` with a v1 body → 400 `invalid_body` (whatever code the route already uses for schema failures).

- [ ] **Step 1: Write failing tests:**
  - `GET /v1/cv returns a stored v1 CV as v2` (repo stub returns a v1 object through the same `storedCv` path; response `content.schemaVersion === 2`, bullets intact).
  - `history detail of a v1 version comes back as v2`.
  - `restoring a v1 history version saves v2` (the repo's restore path writes `schemaVersion: 2`; if restore happens in SQL, assert the next `GET` returns v2).
  - `PUT /v1/cv rejects a v1 body with 400`.
- [ ] **Step 2: Run** `npm test -w apps/api`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Change only the parse calls; no new layers.
- [ ] **Step 4: Run** `npm test -w apps/api && npm run typecheck -w apps/api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): read CVs as v2, save only v2`.

### Task 7: The web app renders v2 in layout order

**Files:**
- Modify: `apps/web/src/cv/page/CvDocument.tsx` (render sections in `normalizeLayout(cv.layout).order`, skip hidden, heading = `layout.titles[key]?.trim() || CATEGORY[key].label[cv.locale]`; render the new sections read-only)
- Create: `apps/web/src/cv/page/NewSections.tsx` if `CvDocument.tsx` would pass ~300 lines (achievements, volunteering, awards, courses, publications, interests)
- Modify: `apps/web/src/cv/useAutosave.ts`, `cv-api.ts`, `sections/blank.ts`, test fixtures: anything building v1
- Modify: `apps/web/src/cv/page/cv-document.test.tsx`

**Interfaces:**
- Consumes: `normalizeLayout`, `CATEGORY`, `formatYearMonth`.
- Produces: `CvDocument` unchanged props. Existing click-to-select still works for the old sections; the new sections are not selectable (Plan C replaces this).

- [ ] **Step 1: Write failing tests** in `cv-document.test.tsx`:
  - `sections follow layout order` → order with education before experience; the education heading comes before the experience heading in DOM order.
  - `hidden sections are not rendered`.
  - `an own heading replaces the standard one` → `titles.experience = "Work history"` shows "Work history" and not "Experience".
  - `a Romanian CV uses Romanian headings` → `locale: "ro"` shows "Experiență profesională".
  - `key achievements and interests render` with sample data.
- [ ] **Step 2: Run** `npm test -w apps/web -- cv-document`. Expected: FAIL.
- [ ] **Step 3: Implement.** Section headings on the page come from `categories.ts`, not `en.ts` (they are CV text in the CV's language).
- [ ] **Step 4: Run** the full check: `npm run lint && npm run typecheck && npm test`. Expected: all green.
- [ ] **Step 5: Commit** `feat(web): render CV format v2 in layout order`.

### Task 8: Decision record

**Files:**
- Create: `docs/decisions/NNNN-one-fixed-set-of-cv-categories.md` (NNNN = next free number in `docs/decisions/`; follow the format of `0003-one-shared-description-of-a-cv.md`)

- [ ] **Step 1:** Write it: what (15 fixed categories, format v2, layout, upgrade on read), options considered (free-form sections; keep v1 and add lists; fixed categories with own headings — chosen), why (flags and import need a fixed target; own headings keep the user's voice), in practice (`affects: [file:packages/shared/src/categories.ts, file:packages/shared/src/cv.ts, file:packages/shared/src/upgrade.ts, route:/v1/cv]`, `concepts: [shared-schemas]`).
- [ ] **Step 2: Commit** only that file: `docs: decision record for fixed CV categories`. If `docs/decisions/` is still untracked from the other session, commit just this file by path; never `git add docs/decisions/`.
