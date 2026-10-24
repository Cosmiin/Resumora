# Resumora — Romanian copy guide (RO-first)

Romanian is the primary interface language; English is secondary. CV language is chosen **separately** from interface language (PRD §1, §9). This guide sets how every system string is written in Romanian — errors, confirmations, statuses, scores, empty states — with ready-to-use examples drawn from the PRD (docs/product/prd.md) and the discovery prototype copy (prototype/app.js). Machine-readable strings: `guidelines/copy/strings.json`.

> One rule above all: **say what happened, why it matters, and what to do next — in words a friend would use.**

---

## 1. Voice

| Principle | Do (RO) | Don't |
|---|---|---|
| Talk to one person, informally — **tu** | „Încarcă CV-ul tău.” | „Încărcați CV-ul dumneavoastră.” |
| The product is **noi** (we), never „sistemul” | „Nu am putut citi fișierul.” | „Sistemul a returnat o eroare.” |
| Be honest; never promise jobs | „O estimare, nu decizia angajatorului.” | „Garantat să treci de ATS!” |
| Encourage; gaps are information, not failure | „Nu apare în experiența ta — e în regulă, e un „ar fi un plus”.” | „Lipsă critică!” |
| No jargon, no internal codes | „Ai experiența, dar nu apare în acest CV.” | „verified_omitted” |
| No blame | „Fișierul pare scanat.” | „Ai încărcat un fișier greșit.” |
| No emoji, no exclamation spam | „Mult succes!” (max one, at celebratory moments) | „Super!!! 🎉” |

- **Imperative, 2nd person singular** for buttons and instructions: *Adaugă, Încarcă, Verifică, Alege, Continuă, Salvează, Descarcă, Confirmă, Încearcă din nou*.
- Legal pages (Termeni, Politica de confidențialitate) may use a neutral impersonal register; the **UI never switches to „dumneavoastră”**.
- First person „eu” only in checkbox/attestation labels the user is *saying*: „Confirm că informațiile sunt corecte.”, „Am trimis candidatura.”

## 2. Spelling & typography

- **Diacritics are mandatory**: ă â î ș ț. Use **comma-below** ș ț (U+0219, U+021B), never cedilla ş ţ (U+015F, U+0163). Normalize pasted text to comma-below before saving and before PDF export (PRD §9 requires checking RO diacritics in the exported PDF).
- î / â: **î** at the start/end of a word and after prefixes (*început, a urî, neîncredere*); **â** inside words (*până, câmp, România*). Write **sunt**, not *sînt*.
- **Sentence case** everywhere: „Verifică potrivirea”, not „Verifică Potrivirea”.
- Lowercase in Romanian: **months, days, languages, nationalities** — „23 octombrie 2026”, „luni”, „română”, „engleză”.
- Quotes: **„…”** (U+201E … U+201D). Nested: «…». Never "…" straight quotes in UI.
- Ellipsis character **…** for in-progress states: „Se încarcă…”.
- Separators: **·** for metadata („v3 · salvat azi, 14:20”); **—** spaced for ranges in CVs („2021 — prezent”).
- Hyphen with enclitic article on acronyms and unadapted loanwords: **CV-ul, CV-uri, PDF-ul, API-uri, e-mailul**. Adapted loanwords take no hyphen: **jobul, joburi**.
- Use **e-mail** (DOOM3 allows both; pick one).

## 3. Numbers, dates, money

| Type | Format | Example |
|---|---|---|
| Decimal | comma | 62,5 |
| Thousands | dot (≥ 10.000), none below | 1250 · 12.500 |
| Percent | no space | 90% |
| Score | integer or one decimal, never "/100" in prose | „Potrivire 62,5 → 90” |
| Date long | d month yyyy, lowercase month | 23 octombrie 2026 |
| Date short | d mon. yyyy | 23 oct. 2026 |
| Date numeric (forms, exports) | dd.mm.yyyy | 23.10.2026 |
| Month precision only | Month yyyy / an | oct. 2021 · 2021 |
| Relative | azi / ieri / acum 5 minute | „Salvat azi, 14:20” |
| Time | 24h | 14:20 |
| Money in prose | lei | „49 lei pe lună” |
| Money in price tables, checkout, invoices | RON | 49 RON · „— RON” until prices are approved (PRD §10) |
| Duration (month known) | „6 ani și 3 luni” | |
| Duration (month unknown) | range + as-of | „5–6 ani · la data de oct. 2026” (PRD §5) |
| Ongoing | „prezent” | „mar. 2021 — prezent” |
| Unknown month | never invent January | „2021” renders as **2021** |

Month names (selector): ianuarie, februarie, martie, aprilie, mai, iunie, iulie, august, septembrie, octombrie, noiembrie, decembrie — plus **„Lună necunoscută”** as the first option.

## 4. Plurals (never concatenate numbers + nouns)

Romanian needs three forms. From 20 upward (and 0 in counts) the noun takes **„de”**, except when the last two digits are 01–19.

| n | Form | Example |
|---|---|---|
| 1 | singular — prefer the word „o / un” | o cerință · un job |
| 2–19, 101–119, 1.002–1.019 | plural | 3 cerințe · 19 joburi · 102 cerințe |
| 0, 20–100, 120+ | **de** + plural | 20 de cerințe · 100 de joburi |
| 0 in sentences | prefer words | „Nicio cerință lipsă” · „Niciun job încă” |

ICU message format (use it in code, never string building):
```
{count, plural, one {# cerință} few {# cerințe} other {# de cerințe}}
{count, plural, =0 {Nicio schimbare} one {O schimbare păstrată} few {# schimbări păstrate} other {# de schimbări păstrate}}
```

## 5. Gender & agreement

Past participles agree with the noun, so **never write a bare participle** that a variable fills in later („{item} salvat/ă”). Prefer an active sentence with **noi**:

- ✓ „Am salvat CV-ul.” · „Am adăugat realizarea.” · „Am anulat ultima modificare.”
- ✗ „{obiect} salvat cu succes.”

Know the genders of core nouns: **CV-ul** (n.), **jobul** (n.), **candidatura** (f.), **cerința** (f.), **realizarea** (f.), **competența** (f.), **versiunea** (f.), **șablonul** (n.), **abonamentul** (n.).

## 6. Glossary (use exactly these terms)

| Concept (EN / code) | RO in UI | Avoid |
|---|---|---|
| Base CV | **CV de bază** (label) · CV-ul de bază (sentence) | CV master, CV principal |
| Job CV / tailored CV | **CV pentru job** · CV adaptat | CV croit |
| Application | **candidatură** | aplicare, aplicație (= software) |
| Apply / mark sent | **Am trimis candidatura** | Aplică |
| Job ad | **anunț** (de angajare) | job description |
| Requirement | **cerință** | criteriu (except in method docs) |
| Required / preferred / unspecified | **Obligatoriu / De preferat / Nespecificat** | Must-have |
| Strict hard gate | **condiție eliminatorie** | prag strict (internal only) |
| Candidate–Job Fit | **Tu vs. job** · „Potrivirea ta cu jobul” | Scor candidat |
| CV–Job Match | **CV-ul vs. job** · „Potrivirea CV-ului cu jobul” | Scor ATS |
| ATS / PDF readability | **Lizibilitate PDF** · „Cât de ușor e citit automat” | Scor ATS |
| Not tested | **Netestat** | N/A |
| Keyword | **cuvânt-cheie / cuvinte-cheie** | keyword |
| Skills (professional / technical) | **competențe profesionale / tehnice** | skilluri |
| Accomplishment | **realizare** | achievement |
| Summary | **rezumat** | sumar |
| Positioning title | **titlu profesional** | headline |
| Template | **șablon** | template, model |
| Enrichment questions | **întrebări pentru profil** | interviu (ambiguous with job interview) |
| Confirm / confirmed by you | **Confirmă / Confirmat de tine** | Validat |
| Attestation | **declarație** — „Susținut prin declarație” | certificare |
| Right to work | **dreptul de muncă în România** | permis (unless it is one) |
| Version / history / restore | **versiune / istoric / restaurează** | |
| Subscription / renewal | **abonament / reînnoire** | |
| Upload / download | **Încarcă / Descarcă** | Uploadează |
| Cancel (abort) | **Renunță** | |
| Undo | **Anulează** | Undo |
| Close | **Închide** | |
| Skip | **Sari peste** · „Mai târziu” | Skip |
| Sign up / in / out | **Creează cont / Intră în cont / Ieși din cont** | Login |

**Renunță vs. Anulează:** *Renunță* abandons a dialog or operation; *Anulează* reverts the last change (undo). Never use both meanings for one word.

## 7. Buttons

Verb-first, outcome-specific, ≤ 4 words. One primary per screen.

| Moment | Primary (RO) | EN |
|---|---|---|
| Home | **Începe cu un job** | Start with a job |
| Home alt | Creează CV-ul de bază | Create my Base CV |
| Upload | **Încarcă CV-ul** · Completează manual | Upload CV · Enter manually |
| Extraction review | **Confirmă și salvează** | Confirm and save |
| Add job | **Verifică potrivirea** | Check my match |
| Match report | **Adaugă cele 3 lipsuri** | Add the 3 missing things |
| Improve | **Salvează CV-ul pentru job** | Save this job’s CV |
| Base promotion | Doar pentru acest job · **Actualizează și CV-ul de bază** | Only this job · Update Base too |
| Download | **Descarcă PDF** | Download PDF |
| After download | **Am trimis candidatura** | I’ve sent this application |
| Retry | **Încearcă din nou** | Try again |
| Plans | **Continuă cu 3 luni** | Continue with 3 months |

Never: „OK”, „Trimite” (ambiguous), „Rulează analiza”, „Submit”.

## 8. Error messages

**Formula:** *[Ce s-a întâmplat — fără vină]* + *[Cum repari]* + *[o acțiune]*. One or two sentences. Under the field for field errors; in an Alert for page-level; in a Toast only for non-blocking issues. Never „Eroare 500”, never „Ceva nu a funcționat” on its own.

### Cont și acces
| Situation | RO | EN |
|---|---|---|
| Invalid e-mail | Adaugă o adresă de e-mail completă, de exemplu mara@exemplu.ro. | Add a complete email, e.g. mara@example.com. |
| Short password | Parola trebuie să aibă cel puțin 8 caractere. | Password needs at least 8 characters. |
| Wrong credentials | E-mailul sau parola nu se potrivesc. Încearcă din nou sau resetează parola. | Email or password doesn’t match. Try again or reset your password. |
| Account exists | Există deja un cont cu acest e-mail. Intră în cont sau resetează parola. | An account already exists for this email. |
| Consent missing | Bifează acordul pentru prelucrarea datelor ca să putem continua. | Tick the data-processing consent to continue. |
| Session expired | Sesiunea a expirat. Intră din nou în cont — modificările tale sunt salvate. | Your session expired. Sign in again — your changes are saved. |

### Import CV (journey A)
| Situation | RO |
|---|---|
| Wrong format | Putem citi doar fișiere PDF sau DOCX. Salvează documentul într-unul dintre aceste formate sau completează manual. |
| Too large | Fișierul are 14 MB. Încarcă unul de cel mult 10 MB. |
| Scanned / image PDF | Nu putem citi textul din acest PDF — pare scanat sau protejat. Încarcă un PDF cu text selectabil sau completează manual. |
| Password-protected | Fișierul e protejat cu parolă. Scoate parola și încarcă-l din nou. |
| Extraction failed (retryable) | Nu am reușit să citim CV-ul de data asta. Încearcă din nou — nu ai pierdut nimic. |
| Unconfirmed fields | Mai ai {n, plural, one {un câmp} few {# câmpuri} other {# de câmpuri}} de verificat înainte de salvare. |
| Confirmation unticked | Confirmă că informațiile sunt corecte înainte de salvare. |
| Name / e-mail missing | Completează numele și o adresă de e-mail validă. |

### Date și experiență (PRD §5)
| Situation | RO |
|---|---|
| Year out of range | Anul trebuie să fie între 1900 și 2026. |
| End before start | Data de sfârșit e înaintea celei de început. Verifică anii. |
| Month unknown (hint, not error) | Nu știi luna? Lasă „Lună necunoscută” — nu o completăm în locul tău. |
| Empty bullet | Completează sau elimină realizarea goală. |
| Missing metric (hint) | Nu ai măsurat rezultatul? E în regulă — descrie-l în cuvinte. |

### Întrebări pentru profil (journey B)
| Situation | RO |
|---|---|
| Empty answer | Scrie un răspuns sau alege „Sari peste”. |
| “Nu știu” chosen | Am notat „Nu știu încă”. Nu adăugăm nimic în CV. |
| Claim not confirmed | Confirmă afirmația înainte s-o folosim. |
| Role missing in this variant | Rolul nu există în această versiune. Alege CV-ul de bază sau verifică editorul. |

### Adăugare job (journey C, PRD §7)
| Situation | RO |
|---|---|
| Text too short | Lipește tot anunțul — avem nevoie de cel puțin 30 de caractere. |
| Invalid URL | Introdu un link care începe cu https://. |
| Page needs login / blocked | Nu putem deschide pagina — cere autentificare. Copiază textul anunțului și lipește-l aici. |
| Extension consent | Confirmă că vrei să preluăm anunțul de pe această pagină. Nu citim nimic altceva. |
| Duplicate | Ai adăugat deja acest anunț pe 21 oct. Deschide-l sau salvează-l ca versiune nouă. |
| No requirements found | Nu am găsit cerințe clare în text. Adaugă-le manual, câte una pe rând. |
| Ambiguous priority (info) | Nu e clar dacă „SQL” e obligatoriu. L-am marcat „Nespecificat” — schimbă dacă știi. |

### Analiză și potrivire (journey D, PRD §8)
| Situation | RO |
|---|---|
| Base missing | Salvează mai întâi CV-ul de bază — comparăm faptele confirmate cu cerințele jobului. |
| Stale after job edit | Anunțul s-a schimbat. Recalculează potrivirea ca să vezi rezultatul actualizat. |
| Analysis failed (retryable) | Analiza nu s-a terminat. Încearcă din nou; rezultatul anterior rămâne valabil. |
| Needs verification (persistent) | De verificat: dreptul de muncă în România. Jobul îl cere ca o condiție eliminatorie și nu știm încă. Scorul nu se schimbă. |
| Confirmed gap | Cerință neîndeplinită: dreptul de muncă în România. Poți descărca CV-ul, dar angajatorul îl cere explicit. |

### Adaptare și editor (journey E, PRD §6)
| Situation | RO |
|---|---|
| Proposal needs evidence | Pentru această propunere avem nevoie de context de la tine — nu inventăm realizări. |
| Conflict (409) | CV-ul a fost modificat în altă fereastră. Ți-am păstrat modificările — alege ce versiune rămâne. |
| Save failed | Nu am putut salva. Modificările sunt încă aici — încearcă din nou. |
| Cancel during run | Am oprit. Ultima versiune salvată a rămas neschimbată. |

### Export și candidatură
| Situation | RO |
|---|---|
| Review not confirmed | Verifică documentul înainte de descărcare. |
| Readability check failed | PDF-ul s-a generat, dar textul nu se citește în ordinea corectă. Încearcă din nou sau alege alt șablon. |
| Diacritics broken | Unele diacritice nu apar corect în PDF, așa că am oprit descărcarea. Încearcă din nou. |
| Edited while rendering | Ai modificat CV-ul între timp. Generăm PDF-ul din nou, cu ultima versiune. |
| Export ≠ sent | Descărcarea nu înseamnă trimitere. Marchează candidatura ca trimisă după ce o trimiți. |
| Sent without CV | Atașează un CV înainte de a marca candidatura ca trimisă. |

### Abonament și limite (journey F, PRD §10)
| Situation | RO |
|---|---|
| Payment declined | Plata nu a trecut. Încearcă alt card sau contactează banca. |
| Payment pending | Plata se confirmă. Îți activăm accesul imediat ce primim confirmarea. |
| Quota reached | Ai folosit toate cele 4 adaptări din această lună. Se resetează pe 1 noiembrie; până atunci poți edita manual. |
| Cancel at period end | Reînnoirea e oprită. Ai acces până pe 23 noiembrie 2026. |
| Resume | Am reluat reînnoirea. Următoarea plată: 23 noiembrie 2026. |

### Rețea și general
| Situation | RO |
|---|---|
| Offline | Nu ai conexiune la internet. Reîncercăm automat când revii online. |
| Rate limited | Prea multe încercări într-un timp scurt. Încearcă din nou peste un minut. |
| Not found | Nu găsim această pagină. Poate a fost mutată sau ștearsă. |
| Unknown (last resort) | Ceva n-a mers cum trebuia. Încearcă din nou; dacă se repetă, scrie-ne la suport@resumora.ro. |

## 9. Success & toasts

Short, past tense, active voice, with **Anulează** whenever content changed.

- Am salvat CV-ul de bază (v4). — *Anulează*
- Am adăugat proiectul în CV-ul pentru Northstar People. CV-ul de bază nu s-a schimbat.
- Am restaurat versiunea 2 ca versiune nouă (v5).
- Am anulat ultima modificare.
- Previzualizare actualizată.
- PDF-ul e gata și se citește corect.
- Am marcat candidatura ca trimisă. Mult succes, Mara!
- Abonamentul e activ până pe 23 ianuarie 2027.

## 10. Dialogs

Title = the question; body = consequence; buttons = the two outcomes in words (primary right).

| Title | Body | Buttons |
|---|---|---|
| Actualizezi și CV-ul de bază? | Noul rezumat poate ajuta și la alte joburi. Salvăm o versiune nouă pe care o poți anula. | Doar pentru acest job · **Actualizează și baza** |
| Poți lucra legal în România? | Notăm răspunsul doar pentru acest job. Nu apare în CV și nu schimbă scorul. | Mai târziu · **Salvează răspunsul** |
| Ștergi candidatura la Northstar People? | Ștergem jobul, CV-urile adaptate și notițele. Nu se poate anula. | Renunță · **Șterge candidatura** (danger) |
| Oprești reînnoirea? | Accesul rămâne activ până pe 23 noiembrie 2026. Nu se mai fac plăți. | Păstrează abonamentul · **Oprește reînnoirea** |
| Ieși fără să salvezi? | Pierzi modificările făcute după ultima salvare. | Rămâi · **Ieși fără salvare** |

## 11. Progress & operation states (PRD §6)

| State (code) | RO label | Notes |
|---|---|---|
| queued | În așteptare… | |
| running | Citim anunțul… · Comparăm CV-ul cu cerințele… · Pregătim PDF-ul și verificăm că se citește corect… | Always say *what* |
| needs_input | Avem nevoie de un răspuns de la tine | Opens the question |
| succeeded | Gata | Usually replaced by the result |
| failed_retryable | Nu s-a terminat. **Încearcă din nou** | Keep previous result |
| failed_final | Nu putem finaliza această operațiune. Ultima versiune salvată e neatinsă. | Offer manual path |
| cancel_requested | Se oprește… | |
| cancelled | Oprit. Nimic nu s-a schimbat. | |
| expired | A expirat. Pornește din nou. | |

Long operations always show **Renunță** and the reassurance „Poți renunța fără să pierzi ultima versiune salvată.”

## 12. Status labels

**Keyword status (PRD §7)**
| Code | RO | EN |
|---|---|---|
| included | În CV-ul tău | In your CV |
| verified_equivalent | În CV · formulare echivalentă | In your CV · similar wording |
| verified_omitted | Ai experiența · lipsește din acest CV | You have it · not in this CV |
| awaiting_confirmation | E adevărat pentru tine? | Is this true for you? |
| unsupported | Nu apare în experiența ta | Not in your experience |
| attestation | Susținut prin declarație | Supported by attestation |

**Eligibility (PRD §8)** — Cerințe îndeplinite · **De verificat** · Cerință neîndeplinită
**PDF readability** — Netestat · Se citește corect · Probleme de citire
**Fact state (PRD §5)** — Extras · neconfirmat · Confirmat de tine · Verificat extern · Propunere · Respins
**Requirement priority** — Obligatoriu · De preferat · Nespecificat · Condiție eliminatorie
**Application (PRD §15)** — De pregătit · Trimisă · Interviu · Închisă — and Adaptat / Neadaptat
**Base checks (PRD §15)** — Conținut · Structură și format · Potrivire cu jobul · Calitatea textului · Pregătit de trimis
**Subscription** — Activ · Se confirmă plata · Plată refuzată · Se oprește pe 23 nov. · Expirat

## 13. Scores — honest wording (PRD §8)

- Verdict first, number second: „**Potrivire bună — CV-ul tău încă nu arată asta.**”
- Explain both scores: „**Tu vs. job: 90** — tot profilul tău confirmat. **CV-ul vs. job: 62,5** — doar ce apare în acest CV.”
- Explain change: „62,5 → 90 pentru că CV-ul include acum experiența cu API-uri și salarizare pe care o confirmaseși deja.”
- Always available disclaimer: „Estimare pe baza faptelor confirmate de tine. Nu e scorul unui angajator și nu prezice angajarea.”
- Rewording never raises a score — say so when users ask: „Reformularea singură nu schimbă scorul; contează ce fapte alegi.”
- Never: „Șanse de angajare 90%”, „Trece de ATS”, „Scor perfect”.

## 14. AI & honesty lines (reuse verbatim)

- Propunerile folosesc doar fapte confirmate de tine.
- Nu adăugăm cifre, titluri sau calificări pe care nu le-ai confirmat.
- „Confirmat de tine” înseamnă declarația ta, nu o verificare independentă.
- Traducerea unei diplome nu înseamnă recunoașterea ei în România.
- Șablonul schimbă aspectul, nu faptele.
- Schimbarea limbii interfeței nu schimbă textul CV-ului.
- Nu citim profiluri LinkedIn; analizăm doar textul pe care îl lipești.

## 15. Empty states

| Place | Title | Body | Action |
|---|---|---|---|
| Jobs | Niciun job încă | Lipește un anunț și îți arătăm cât de bine te potrivești. | Adaugă un job |
| Base CV | Încă nu ai un CV de bază | Încarcă CV-ul actual sau completează-l pas cu pas. Durează câteva minute. | Încarcă CV-ul |
| History | Încă nu ai versiuni | Fiecare salvare creează o versiune pe care o poți restaura. | — |
| Search | Niciun rezultat pentru „analist” | Verifică scrierea sau caută după companie. | Șterge căutarea |
| Dropdown search | Niciun rezultat | | |

## 16. Layout implications

- Romanian runs **20–35 % longer** than English. Buttons and pills must wrap or grow; never truncate a button label. Test every component with the RO string.
- Don't build sentences from fragments (gender + plural break). One full message per key with ICU placeholders.
- Avoid ALL CAPS beyond short eyebrows — diacritics on capitals (Ș, Ț, Î, Â, Ă) need line-height room.
- Keep fonts with latin-ext coverage (Bricolage Grotesque, Figtree, Source Serif 4 all include ș ț).
