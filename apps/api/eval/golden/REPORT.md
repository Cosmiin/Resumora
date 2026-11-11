# Golden examples: prompts before and after the rework

Four fixed cases from two fictional weak CVs and two job ads. For every role you see what the person is asked
(for the base CV and when tailoring) and what tailoring proposes, with the earlier prompts and with the reworked ones.
No answers are given during a run, so rewrites show what the AI does from the CV and the ad alone.

| | Earlier prompts | Reworked prompts |
|---|---|---|
| Run | 2026-11-11 05:52 at `fc7cd3d` | 2026-11-11 16:00 at `81102a5` |
| Bad patterns found | 52 | 0 |

The patterns looked for: another employer named in a role's question, talk of "your previous roles", a role asked about
tools that came after it ended, an "other" answer option, the "We think you know…" wording, a question not in the
interface language, a rewrite not in the tailoring language, a past role rewritten in the present tense, and one job
theme asked of every role. The check is a word search: it can miss a pattern and it can flag a harmless sentence, so
the questions themselves are below for you to read.

## English CV, English ad, English interface

Questions should be in English; tailored CV text in English.

What good looks like here:
- About how many automations do you keep running today?
- Which teams used the automations you built?
- When an automation stopped working, what did you usually do?
- The ad asks for webhooks and JSON. Did you use them in this role?
- What were the Excel reports for the clinic manager about?

### Automation Specialist, Logistica Nord SRL (2022 – present)

**Earlier prompts**

Base CV questions:
- What industry does your company operate in?  
  Options: SaaS / Software / E-commerce / Professional Services / Finance / Fintech
- What was the primary purpose of your role?  
  Options: Internal process optimization / Client-facing automation solutions / System integration and maintenance / Data management and reporting
- Who did you report to in this role?  
  Options: Operations Manager / CTO / Head of Engineering / Business Owner / Sales Director
- What kind of workflows did you automate using these tools?
- How did you use Google Sheets and Airtable in your daily work?
- What specific process improvements did you deliver for these teams?
- Which key applications did you integrate?

Tailoring questions:
- Have you worked with n8n in your current role?  
  Options: Yes, extensively / Yes, a little / No
- Have you worked with REST APIs and webhooks, including authentication like OAuth2 or API keys?  
  Options: Yes, frequently / Yes, occasionally / No
- When fixing automations, do you implement specific error handling, logging, or monitoring systems?  
  Options: Yes, I build robust error handling / I do basic troubleshooting / No, I focus on manual fixes
- Do you have experience writing SQL queries for data manipulation?  
  Options: Yes, proficient / Yes, basic / No

Tailoring rewrites:
- (none)

Bad patterns found: none

**Reworked prompts**

Base CV questions:
- What does the company do?
- What was the primary purpose and scope of your role as an Automation Specialist?  
  Options: Improving internal operational efficiency / Building client-facing automation solutions / Managing data pipelines and integrations / Supporting digital transformation projects
- Besides Zapier, Make, Google Sheets, and Airtable, what other tools or methods did you use?  
  Options: SQL or database management / API documentation and testing tools / Project management software like Jira or Asana / Scripting languages like Python or JavaScript
- Did you lead any automation projects or mentor other team members?  
  Options: No / Led small automation projects / Mentored junior team members / Managed a small team of specialists
- Who did you report to in this role?  
  Options: Operations Manager / IT Director / Head of Sales / Business Owner
- Which teams or external stakeholders did you work with most closely?  
  Options: Sales and Marketing teams / Finance and Accounting departments / External clients and vendors / IT and Engineering teams
- Did your work require knowledge of specific industry regulations or market standards?  
  Options: No / Data privacy regulations (GDPR/CCPA) / Financial reporting standards / E-commerce compliance
- What kind of workflows or business processes did you automate using Zapier and Make?
- How did you use Google Sheets and Airtable in your automation projects?
- What specific processes did you improve for the sales and accounting teams?
- Which applications did you integrate to support your team's operations?

Tailoring questions:
- In your integrations, did you work with REST APIs and webhooks?  
  Options: Yes, both / Only webhooks / Only REST APIs
- Did you handle authentication like OAuth2 or API keys when building these integrations?  
  Options: Yes, both / Only API keys / Only OAuth2
- When fixing automations, did you implement logging or monitoring to track errors?  
  Options: Yes, both / Only logging / Only monitoring
- Have you written any SQL queries while working with Airtable or other databases in this role?  
  Options: Yes, frequently / Yes, occasionally / No

Tailoring rewrites:
- Responsible for making automations in Zapier and Make  
  → Design and build business workflows using Make and Zapier. *(inferred, to confirm)*
- Fixed problems when the automations stopped working  
  → Implement error handling and monitoring to ensure automations function reliably. *(inferred, to confirm)*

Bad patterns found: none

### IT Support / Office Assistant, Dental Clinic Zâmbet (2019 – 2022)

**Earlier prompts**

Base CV questions:
- What industry was the company in?  
  Options: Professional Services / Healthcare / Retail / Technology
- What was the primary purpose of your role?  
  Options: General office administration / Technical support focus / Executive assistance / Operations support
- What specific tools or software did you use daily?  
  Options: Microsoft Office Suite / Ticketing systems / CRM software / Accounting software
- How many users or workstations did you typically support?
- What software or tool did you use to manage the appointments?
- What was the primary purpose of the reports you created?
- What is one specific, recurring task you handled in this role?

Tailoring questions:
- When creating Excel reports for the manager, did you use advanced functions like VLOOKUP, Pivot Tables, or Power Query to process data?  
  Options: Yes, frequently / Yes, occasionally / No, only basic formulas
- Did you ever automate any part of the appointment management process, such as sending automated reminders or syncing data between systems?  
  Options: Yes, I set up automated triggers / Yes, I used built-in software features / No, it was manual

Tailoring rewrites:
- Took care of computers, printers and the network  
  → Maintained IT infrastructure, including computers, printers, and network connectivity.
- Other tasks as needed  
  → Assisted with various operational tasks as required by the clinic.

Bad patterns found: none

**Reworked prompts**

Base CV questions:
- What does the company do?
- What was the primary purpose of your role?  
  Options: Internal IT support / Administrative support / Front desk operations
- What tools or software did you use most often?  
  Options: Microsoft Excel / Windows OS / Ticketing software
- Who did you report to?  
  Options: Office Manager / IT Manager / Business Owner
- What specific software or hardware tools did you use to manage the network and devices?
- Which software or system did you use to manage the appointments?
- What kind of data or metrics did you track in these Excel reports?

Tailoring questions:
- Did you use advanced Excel features like VLOOKUP, Pivot Tables, or Power Query for your reports?  
  Options: Yes, I used advanced formulas and Pivot Tables / I used basic formulas and data entry / I used Power Query for data transformation
- Did you manage any cloud-based software or web-based platforms while supporting the clinic's IT infrastructure?  
  Options: Yes, I managed cloud-based CRM or booking systems / I only managed local hardware and network / I managed web-based administrative tools

Tailoring rewrites:
- Took care of computers, printers and the network  
  → Maintained IT infrastructure including computers, printers, and network connectivity.
- Other tasks as needed  
  → Performed administrative tasks as required.

Bad patterns found: none

### Sales Assistant, Electronics store (2017 – 2019)

**Earlier prompts**

Base CV questions:
- What industry or type of store did you work for?  
  Options: Retail clothing / Grocery store / Consumer electronics / Department store
- What was the primary purpose of your role?  
  Options: Customer service and sales / Inventory management / Store operations support / Cash handling
- What tools or systems did you use in your daily work?  
  Options: Point of Sale (POS) system / Inventory management software / Handheld scanners / Customer database
- What kind of products did you sell?
- What was the main goal when arranging the shelves?

Tailoring questions:
- Did you use any CRM or inventory management software to track sales or customer data during your time as a Sales Assistant?  
  Options: Yes, I used a CRM / Yes, I used inventory software / No, I used manual methods

Tailoring rewrites:
- (none)

Bad patterns found: none

**Reworked prompts**

Base CV questions:
- What kind of company was this?
- What was the main purpose of your role beyond sales?  
  Options: Customer service / Inventory management / Visual merchandising / Cash handling
- What tools or systems did you use for sales or inventory?  
  Options: POS system / Barcode scanner / Inventory software / Excel
- Did you have any responsibilities for training or guiding new staff?  
  Options: No / Yes, trained new hires / Yes, supervised a small team
- Who did you report to in this role?  
  Options: Store Manager / Assistant Manager / Shift Supervisor
- What kind of products did you sell, or what was the typical customer profile?
- How often did you restock or reorganize the shelves to maintain store standards?

Tailoring questions:
- (none)

Tailoring rewrites:
- Selling products to customers  
  → Communicated with customers to identify needs and facilitate sales in a retail environment. *(inferred, to confirm)*
- Arranging the shelves  
  → Maintained inventory organization and product displays.

Bad patterns found: none

## English CV, Romanian ad (language mismatch), Romanian interface

Questions should be in Romanian; tailored CV text in Romanian.

What good looks like here:
- Anunțul cere webhook-uri și JSON. Le-ai folosit în acest rol?
- Ai lucrat cu n8n în acest rol, sau doar cu Make și Zapier?
- Ai scris interogări SQL în acest rol?

### Automation Specialist, Logistica Nord SRL (2022 – present)

**Earlier prompts**

Base CV questions:
- What industry does your company operate in?  
  Options: SaaS / Software / E-commerce / Professional Services / Finance / Fintech
- What was the primary purpose of your role?  
  Options: Internal process optimization / Client-facing automation solutions / System integration and maintenance / Data management and reporting
- Who did you report to in this role?  
  Options: Operations Manager / CTO / Head of Engineering / Business Owner / Sales Director
- What kind of workflows did you automate using these tools?
- How did you use Google Sheets and Airtable in your daily work?
- What specific process improvements did you deliver for these teams?
- Which key applications did you integrate?

Tailoring questions:
- Have you worked with n8n in your current role?  
  Options: Yes, extensively / Yes, a little / No
- Have you worked with REST APIs and JSON data mapping in your integrations?  
  Options: Yes, frequently / Yes, occasionally / No
- Have you worked with CRM platforms like HubSpot or Pipedrive?  
  Options: Yes, both / Yes, one of them / No
- Do you document your workflows and provide training to users?  
  Options: Yes, for all projects / Yes, occasionally / No

Tailoring rewrites:
- Responsible for making automations in Zapier and Make  
  → Proiectez și întrețin fluxuri de lucru automatizate utilizând Make și Zapier pentru a optimiza procesele operaționale. *(inferred, to confirm)*
- Fixed problems when the automations stopped working  
  → Monitorizez scenariile în producție și gestionez erorile pentru a asigura funcționarea continuă a automatizărilor. *(inferred, to confirm)*

Bad patterns found (11):
- ⚠ enrichment question is in English, the interface is in Romanian: “What industry does your company operate in?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What was the primary purpose of your role?”
- ⚠ enrichment question is in English, the interface is in Romanian: “Who did you report to in this role?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What kind of workflows did you automate using these tools?”
- ⚠ enrichment question is in English, the interface is in Romanian: “How did you use Google Sheets and Airtable in your daily work?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What specific process improvements did you deliver for these teams?”
- ⚠ enrichment question is in English, the interface is in Romanian: “Which key applications did you integrate?”
- ⚠ tailoring question is in English, the interface is in Romanian: “Have you worked with n8n in your current role?”
- ⚠ tailoring question is in English, the interface is in Romanian: “Have you worked with REST APIs and JSON data mapping in your integrations?”
- ⚠ tailoring question is in English, the interface is in Romanian: “Have you worked with CRM platforms like HubSpot or Pipedrive?”
- ⚠ tailoring question is in English, the interface is in Romanian: “Do you document your workflows and provide training to users?”

**Reworked prompts**

Base CV questions:
- Ce face compania pentru care lucrezi?
- Care a fost scopul principal al rolului tău de Automation Specialist?  
  Options: Reducerea muncii manuale / Îmbunătățirea acurateței datelor / Scalarea proceselor interne / Integrarea sistemelor software
- Ce alte instrumente sau metode ai mai folosit în afară de Zapier și Make?  
  Options: SQL / Python pentru scripturi / API-uri REST / Power Automate
- Ai avut responsabilități de conducere sau ai coordonat proiecte?  
  Options: Nu / Am coordonat proiecte de automatizare / Am instruit colegii în utilizarea automatizărilor
- Cui i-ai raportat în cadrul organizației?  
  Options: Managerului de departament / Directorului IT / Fondatorului/CEO-ului / Managerului de operațiuni
- Cu ce echipe ai colaborat cel mai des?  
  Options: Vânzări / Contabilitate / Suport clienți / Marketing
- Ce fel de fluxuri de lucru ai automatizat folosind Zapier și Make?
- Cum ai utilizat Google Sheets și Airtable în cadrul automatizărilor tale?
- Ce procese specifice ai optimizat pentru echipele de vânzări și contabilitate?
- Ce aplicații ai integrat pentru a eficientiza fluxul de lucru?

Tailoring questions:
- Ai lucrat cu API-uri REST sau webhooks în cadrul integrărilor realizate în acest rol?  
  Options: Da, am folosit frecvent ambele / Doar webhooks / Doar API-uri REST / Nu am lucrat direct cu acestea
- Ai utilizat n8n pentru automatizări în acest rol, pe lângă Zapier și Make?  
  Options: Da, am folosit n8n / Nu, am folosit doar Zapier și Make
- Ai lucrat cu maparea datelor în format JSON în cadrul scenariilor tale de automatizare?  
  Options: Da, frecvent / Ocazional / Nu

Tailoring rewrites:
- Responsible for making automations in Zapier and Make  
  → Proiectez și întrețin fluxuri de lucru utilizând Make și Zapier. *(inferred, to confirm)*
- Fixed problems when the automations stopped working  
  → Monitorizez scenariile și gestionez erorile pentru a asigura funcționarea continuă a automatizărilor. *(inferred, to confirm)*

Bad patterns found: none

### IT Support / Office Assistant, Dental Clinic Zâmbet (2019 – 2022)

**Earlier prompts**

Base CV questions:
- What industry was the company in?  
  Options: Professional Services / Healthcare / Retail / Technology
- What was the primary purpose of your role?  
  Options: General office administration / Technical support focus / Executive assistance / Operations support
- What specific tools or software did you use daily?  
  Options: Microsoft Office Suite / Ticketing systems / CRM software / Accounting software
- How many users or workstations did you typically support?
- What software or tool did you use to manage the appointments?
- What was the primary purpose of the reports you created?
- What is one specific, recurring task you handled in this role?

Tailoring questions:
- Did you use advanced Excel features like VLOOKUP, Pivot Tables, or Power Query to process data for your reports?  
  Options: Yes, I used advanced formulas and Pivot Tables / I used basic functions and data entry / I used Power Query for data transformation
- When managing the network and hardware, did you use any scripting or automation tools to streamline maintenance tasks?  
  Options: Yes, I used scripts (e.g., PowerShell, Bash) / I used automated monitoring software / No, I performed tasks manually

Tailoring rewrites:
- Took care of computers, printers and the network  
  → Am asigurat mentenanța infrastructurii IT, incluzând rețeaua și echipamentele periferice.

Bad patterns found (9):
- ⚠ enrichment question is in English, the interface is in Romanian: “What industry was the company in?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What was the primary purpose of your role?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What specific tools or software did you use daily?”
- ⚠ enrichment question is in English, the interface is in Romanian: “How many users or workstations did you typically support?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What software or tool did you use to manage the appointments?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What was the primary purpose of the reports you created?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What is one specific, recurring task you handled in this role?”
- ⚠ tailoring question is in English, the interface is in Romanian: “Did you use advanced Excel features like VLOOKUP, Pivot Tables, or Power Query to process data for your reports?”
- ⚠ tailoring question is in English, the interface is in Romanian: “When managing the network and hardware, did you use any scripting or automation tools to streamline maintenance tasks?”

**Reworked prompts**

Base CV questions:
- Cu ce se ocupă compania la care ai lucrat?
- Care a fost scopul principal al rolului tău în cadrul echipei?  
  Options: Suport tehnic pentru angajați / Administrare birou / Asistență operațională / Coordonare logistică
- Ce instrumente sau software ai utilizat frecvent în activitatea ta?  
  Options: Microsoft Office / Sisteme de ticketing / Platforme de inventar / Instrumente de administrare rețea
- Câți angajați deserveai în acest rol?  
  Options: Sub 20 / 20–50 / 50–100 / Peste 100
- Ce tip de probleme tehnice sau mentenanță ai gestionat cel mai des?
- Ce instrumente ai folosit pentru a gestiona sistemul de programări?
- Ce fel de date analizai în rapoartele Excel?

Tailoring questions:
- Ai folosit formule avansate sau tabele pivot în Excel pentru rapoartele tale?  
  Options: Da, am folosit frecvent tabele pivot și formule complexe / Am folosit formule de bază și funcții de sortare / Am creat rapoarte simple fără formule avansate
- Ai configurat sau depanat conexiuni de rețea între dispozitive în cadrul clinicii?  
  Options: Da, am configurat routere și conexiuni IP / Am gestionat doar conectarea perifericelor la rețea / Nu, m-am ocupat doar de mentenanța hardware

Tailoring rewrites:
- Took care of computers, printers and the network  
  → Am asigurat mentenanța infrastructurii IT, incluzând rețeaua, stațiile de lucru și echipamentele periferice.

Bad patterns found: none

### Sales Assistant, Electronics store (2017 – 2019)

**Earlier prompts**

Base CV questions:
- What industry or type of store did you work for?  
  Options: Retail clothing / Grocery store / Consumer electronics / Department store
- What was the primary purpose of your role?  
  Options: Customer service and sales / Inventory management / Store operations support / Cash handling
- What tools or systems did you use in your daily work?  
  Options: Point of Sale (POS) system / Inventory management software / Handheld scanners / Customer database
- What kind of products did you sell?
- What was the main goal when arranging the shelves?

Tailoring questions:
- (none)

Tailoring rewrites:
- Selling products to customers  
  → Am asigurat consultanță clienților și am facilitat procesul de vânzare, gestionând cerințele acestora într-un mod eficient.

Bad patterns found (5):
- ⚠ enrichment question is in English, the interface is in Romanian: “What industry or type of store did you work for?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What was the primary purpose of your role?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What tools or systems did you use in your daily work?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What kind of products did you sell?”
- ⚠ enrichment question is in English, the interface is in Romanian: “What was the main goal when arranging the shelves?”

**Reworked prompts**

Base CV questions:
- Cu ce se ocupă compania la care ai lucrat?
- Care a fost scopul principal al rolului tău de Sales Assistant?  
  Options: Asistență clienți / Gestionarea stocurilor / Vânzări directe / Administrarea magazinului
- Ce instrumente sau sisteme ai folosit pentru vânzări sau inventar?  
  Options: Sistem POS / Excel / Software de gestiune stocuri / Scanere de coduri de bare
- Câți clienți deserveai în medie pe zi?  
  Options: Sub 50 / 50–100 / 100–200 / 200+
- Ce fel de produse sau clienți ai gestionat în acest rol?
- Ai urmat anumite standarde de vizualizare sau ai gestionat și stocurile în timp ce aranjai rafturile?

Tailoring questions:
- (none)

Tailoring rewrites:
- Selling products to customers  
  → Am gestionat interacțiunile cu clienții și am facilitat procesul de vânzare a produselor.
- Arranging the shelves  
  → Am organizat și am menținut ordinea pe rafturile magazinului.

Bad patterns found: none

## Romanian CV, Romanian ad, Romanian interface

Questions should be in Romanian; tailored CV text in Romanian.

What good looks like here:
- Cam câte scenarii ții în funcțiune acum în Make și n8n?
- Pentru câți clienți ai făcut legături între aplicații?
- Când un scenariu dădea eroare, ce făceai de obicei?
- Anunțul cere API-uri REST și webhook-uri. Le-ai folosit în acest rol?
- Macro-urile din Excel: ce făceau și cine le folosea?

### Specialist automatizări (no-code), Agenția Digitală Pixel (2023 – present)

**Earlier prompts**

Base CV questions:
- Ce tip de clienți sau industrii deservea compania?  
  Options: Agenții de marketing / Companii de e-commerce / Startup-uri tehnologice
- Care a fost scopul principal al rolului tău în cadrul echipei?  
  Options: Optimizarea proceselor interne / Implementarea soluțiilor pentru clienți / Mentenanța sistemelor existente / Dezvoltarea de noi fluxuri de lucru
- Cu ce alte instrumente sau platforme ai mai lucrat în afară de Make, n8n, HubSpot și Typeform?  
  Options: Google Sheets / Airtable / Slack / Microsoft Teams / Zapier / Platforme de email marketing
- Cui raportai în cadrul acestui rol?  
  Options: Managerului de proiect / Fondatorului companiei / Echipei de dezvoltare / Clientului direct
- Ce fel de procese ai automatizat folosind Make și n8n?
- Cum ai integrat HubSpot și Typeform în fluxurile tale de lucru?
- Ce tip de aplicații ai conectat cel mai frecvent?
- Care a fost responsabilitatea ta principală în campaniile de email?

Tailoring questions:
- Ai lucrat cu API-uri REST sau webhook-uri pentru a conecta aplicațiile clienților?  
  Options: Da, am folosit frecvent / Am folosit ocazional / Nu am folosit
- Ai experiență în maparea datelor JSON în cadrul scenariilor de automatizare?  
  Options: Da, lucrez des cu JSON / Am făcut mapări simple / Nu am lucrat cu JSON
- Ai documentat fluxurile de lucru create sau ai instruit clienții cu privire la utilizarea acestora?  
  Options: Da, documentez și instruiesc clienții / Documentez doar intern / Nu am făcut acest lucru

Tailoring rewrites:
- Responsabilă de automatizări în Make și n8n  
  → Construiesc și întrețin fluxuri de lucru complexe utilizând Make și n8n pentru a automatiza procesele clienților. *(inferred, to confirm)*
- Rezolvam erorile din scenarii  
  → Monitorizez scenariile în producție și gestionez erorile pentru a asigura funcționarea continuă a automatizărilor. *(inferred, to confirm)*
- Am ajutat echipa de marketing cu trimiterea de emailuri  
  → Sprijin echipele de marketing prin automatizarea campaniilor de email marketing. *(inferred, to confirm)*

Bad patterns found: none

**Reworked prompts**

Base CV questions:
- Ce tip de clienți sau industrii deservea compania?
- Care a fost scopul principal al rolului tău în cadrul echipei?  
  Options: Optimizarea proceselor interne / Implementarea de soluții pentru clienți / Mentenanța sistemelor de automatizare / Scalarea operațiunilor
- Ce alte instrumente sau metode ai utilizat în afară de Make, n8n, HubSpot și Typeform?  
  Options: Google Sheets / Airtable / Slack / Microsoft Teams / SQL / Baze de date / API-uri REST
- Ai coordonat sau instruit pe cineva în utilizarea acestor automatizări?  
  Options: Nu / Am instruit utilizatorii finali / Am coordonat o echipă mică / Am oferit suport tehnic echipei
- Cui îi raportai în cadrul acestui rol?  
  Options: Managerului de proiect / Fondatorului / CEO-ului / Directorului de marketing / Echipei tehnice
- Ce procese ai configurat sau optimizat folosind HubSpot și Typeform?
- Ce tip de aplicații ai integrat și care a fost scopul acestor conexiuni?
- Cum ai automatizat trimiterea emailurilor pentru echipa de marketing?

Tailoring questions:
- Ai lucrat cu API-uri REST sau webhook-uri pentru a conecta aplicațiile în Make și n8n?  
  Options: Da, am folosit frecvent ambele / Am folosit doar webhook-uri / Am folosit doar API-uri REST / Nu am lucrat cu ele
- Ai mapat date în format JSON în cadrul scenariilor tale de automatizare?  
  Options: Da, frecvent / Ocazional / Nu
- Ai documentat fluxurile de lucru create pentru clienți sau ai instruit utilizatorii finali?  
  Options: Da, ambele / Doar documentare / Doar instruire / Nu

Tailoring rewrites:
- Responsabilă de automatizări în Make și n8n  
  → Construiesc și întrețin fluxuri de lucru în Make și n8n pentru clienți. *(inferred, to confirm)*
- Rezolvam erorile din scenarii  
  → Gestionez erorile și monitorizez scenariile de automatizare. *(inferred, to confirm)*
- Am ajutat echipa de marketing cu trimiterea de emailuri  
  → Automatizez campanii de email marketing pentru echipe de marketing. *(inferred, to confirm)*

Bad patterns found: none

### Operator date / Asistent administrativ, Firmă de curierat (2020 – 2023)

**Earlier prompts**

Base CV questions:
- Cu ce se ocupă compania la care ai lucrat?  
  Options: Servicii logistice / Comerț cu amănuntul / Servicii financiare / Producție industrială
- Care a fost scopul principal al rolului tău?  
  Options: Gestionarea bazei de date / Suport administrativ pentru echipă / Procesarea documentelor comerciale / Asistență clienți
- Ce instrumente sau software ai utilizat în activitatea ta?  
  Options: Pachetul Microsoft Office / Sistem ERP (ex: SAP, Oracle) / Sistem CRM / Platforme de e-mail și ticketing
- Ce tip de date ai introdus în sistem?
- Cât de des ai generat aceste rapoarte și pentru cine?
- Ce procese ai automatizat folosind macro-uri?
- Ce tip de solicitări ai gestionat în corespondența cu clienții?

Tailoring questions:
- Ce limbaj sau instrument ai folosit pentru a crea macro-urile în Excel?  
  Options: VBA / Power Query / Altul
- Ai utilizat funcții avansate sau instrumente de manipulare a datelor în rapoartele tale?  
  Options: VLOOKUP/XLOOKUP și tabele pivot / Power Pivot / Doar formule de bază

Tailoring rewrites:
- (none)

Bad patterns found (1):
- ⚠ has an "other" answer option (“Altul”) on: “Ce limbaj sau instrument ai folosit pentru a crea macro-urile în Excel?”

**Reworked prompts**

Base CV questions:
- Ce fel de companie era aceasta?
- Care a fost scopul principal al rolului tău în cadrul departamentului?  
  Options: Suport administrativ general / Gestionarea bazei de date / Asistență operațională / Suport pentru echipa de vânzări
- Ce instrumente sau software ai utilizat în activitatea ta zilnică?  
  Options: Pachetul Microsoft Office / Sisteme ERP / Platforme CRM / Instrumente de comunicare internă
- Ce tip de date introduceai și în ce platformă sau sistem lucrai?
- Ce fel de rapoarte generai și pentru cine erau acestea?
- Ce procese ai automatizat sau îmbunătățit folosind macro-uri în Excel?
- Ce fel de solicitări gestionai în corespondența cu clienții?

Tailoring questions:
- Ce limbaj sau instrument ai folosit pentru a crea acele macro-uri în Excel?  
  Options: VBA / Power Query / Office Scripts

Tailoring rewrites:
- Introducere date în sistem  
  → Am gestionat introducerea datelor în sistemele interne.
- Corespondență cu clienții  
  → Am asigurat corespondența cu clienții.

Bad patterns found: none

### Recepționeră, Hotel (2018 – 2020)

**Earlier prompts**

Base CV questions:
- Ce tip de unitate sau companie ai reprezentat în acest rol?  
  Options: Hotel sau pensiune / Clinică medicală / Birouri corporate / Salon de înfrumusețare
- Care a fost scopul principal al rolului tău în cadrul echipei?  
  Options: Gestionarea fluxului de clienți / Suport administrativ pentru management / Coordonarea activităților de recepție / Gestionarea apelurilor și corespondenței
- Ce instrumente sau software ai utilizat frecvent în activitatea ta?  
  Options: Pachetul Microsoft Office / Sisteme CRM / Platforme de rezervări online / Sisteme telefonice VOIP
- Ce instrumente sau software ai folosit pentru gestionarea rezervărilor?

Tailoring questions:
- În timpul activității de recepție, ai utilizat sisteme software pentru gestionarea rezervărilor sau baze de date pentru clienți?  
  Options: Da, am folosit sisteme de gestiune hotelieră (PMS) / Da, am folosit baze de date sau Excel pentru evidență / Nu, am lucrat preponderent manual

Tailoring rewrites:
- (none)

Bad patterns found: none

**Reworked prompts**

Base CV questions:
- Ce fel de companie era aceasta?
- Care a fost scopul principal al rolului tău?  
  Options: Gestionarea fluxului de clienți / Suport administrativ pentru echipă / Coordonarea programărilor / Gestionarea apelurilor telefonice
- Ce instrumente sau software ai utilizat în activitatea ta zilnică?  
  Options: Microsoft Office / Sistem de gestiune (PMS) / Centrală telefonică / Software de facturare
- Câți clienți sau vizitatori primeai zilnic în medie?  
  Options: Sub 20 / 20–50 / 50–100 / Peste 100
- Ce sistem sau instrument ai folosit pentru a înregistra rezervările?

Tailoring questions:
- (none)

Tailoring rewrites:
- (none)

Bad patterns found: none

## Romanian CV, English ad (language mismatch), English interface

Questions should be in English; tailored CV text in English.

What good looks like here:
- The ad asks for basic JavaScript in custom code steps. Did you write any in this role?
- Did you use webhooks or map JSON data in your Make and n8n scenarios?
- Which CRM did your scenarios connect, besides HubSpot?

### Specialist automatizări (no-code), Agenția Digitală Pixel (2023 – present)

**Earlier prompts**

Base CV questions:
- Ce tip de clienți sau industrii deservea compania?  
  Options: Agenții de marketing / Companii de e-commerce / Startup-uri tehnologice
- Care a fost scopul principal al rolului tău în cadrul echipei?  
  Options: Optimizarea proceselor interne / Implementarea soluțiilor pentru clienți / Mentenanța sistemelor existente / Dezvoltarea de noi fluxuri de lucru
- Cu ce alte instrumente sau platforme ai mai lucrat în afară de Make, n8n, HubSpot și Typeform?  
  Options: Google Sheets / Airtable / Slack / Microsoft Teams / Zapier / Platforme de email marketing
- Cui raportai în cadrul acestui rol?  
  Options: Managerului de proiect / Fondatorului companiei / Echipei de dezvoltare / Clientului direct
- Ce fel de procese ai automatizat folosind Make și n8n?
- Cum ai integrat HubSpot și Typeform în fluxurile tale de lucru?
- Ce tip de aplicații ai conectat cel mai frecvent?
- Care a fost responsabilitatea ta principală în campaniile de email?

Tailoring questions:
- Ai lucrat cu Zapier în cadrul acestui rol?  
  Options: Da, frecvent / Ocazional / Nu
- Ai utilizat REST API-uri sau webhooks pentru a conecta aplicațiile?  
  Options: Da, am configurat frecvent / Am lucrat ocazional cu ele / Nu am lucrat direct cu API-uri
- Ce metode folosești pentru monitorizarea și logarea erorilor în scenariile tale?  
  Options: Folosesc module de error handling și logare în Google Sheets / Trimit alerte automate pe Slack/Email la erori / Verific manual istoricul execuțiilor
- Ai experiență în lucrul cu baze de date precum Airtable sau scrierea de interogări SQL?  
  Options: Da, ambele / Doar Airtable / Doar SQL / Nu

Tailoring rewrites:
- (none)

Bad patterns found (12):
- ⚠ enrichment question is in Romanian, the interface is in English: “Ce tip de clienți sau industrii deservea compania?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Care a fost scopul principal al rolului tău în cadrul echipei?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Cu ce alte instrumente sau platforme ai mai lucrat în afară de Make, n8n, HubSpot și Typeform?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Cui raportai în cadrul acestui rol?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Ce fel de procese ai automatizat folosind Make și n8n?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Cum ai integrat HubSpot și Typeform în fluxurile tale de lucru?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Ce tip de aplicații ai conectat cel mai frecvent?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Care a fost responsabilitatea ta principală în campaniile de email?”
- ⚠ tailoring question is in Romanian, the interface is in English: “Ai lucrat cu Zapier în cadrul acestui rol?”
- ⚠ tailoring question is in Romanian, the interface is in English: “Ai utilizat REST API-uri sau webhooks pentru a conecta aplicațiile?”
- ⚠ tailoring question is in Romanian, the interface is in English: “Ce metode folosești pentru monitorizarea și logarea erorilor în scenariile tale?”
- ⚠ tailoring question is in Romanian, the interface is in English: “Ai experiență în lucrul cu baze de date precum Airtable sau scrierea de interogări SQL?”

**Reworked prompts**

Base CV questions:
- What does the company do?
- What was the primary purpose and scope of your role?  
  Options: Internal process automation / Client-facing automation projects / System integration consulting / Marketing operations support
- Besides Make and n8n, what other tools or methods did you use?  
  Options: Zapier / SQL/Databases / JavaScript/JSON / API documentation
- Did anyone report to you in this role?  
  Options: No / 1–5 people / 6–20 people
- Who did you report to?  
  Options: The business owner / Marketing Manager / Technical Lead / Operations Manager
- Which teams or clients did you work with most closely?  
  Options: Marketing team / Sales department / External clients / IT/Development team
- What kind of business processes did you automate using Make and n8n?
- How did you integrate HubSpot and Typeform in your workflows?
- Which specific applications did you connect for your clients?
- What was your specific contribution to the email marketing process?
- What kind of issues did you typically resolve in your scenarios?

Tailoring questions:
- Your CV mentions connecting apps. Did you use REST APIs and webhooks for these integrations?  
  Options: Yes, frequently / Only webhooks / Only REST APIs / No
- When fixing errors in your scenarios, did you implement logging or monitoring to ensure they fail safely?  
  Options: Yes, I set up logging / I used basic error handling / No, I only fixed errors manually
- Did you use Airtable or Google Sheets to design data models for your automation projects?  
  Options: Yes, both / Only Google Sheets / Only Airtable / No
- Did you write any SQL queries to manage or retrieve data for your automation workflows?  
  Options: Yes, regularly / Occasionally / No

Tailoring rewrites:
- Responsabilă de automatizări în Make și n8n  
  → Build and maintain business workflows using Make and n8n. *(inferred, to confirm)*
- Rezolvam erorile din scenarii  
  → Implement error handling and monitoring for automation scenarios. *(inferred, to confirm)*
- Am ajutat echipa de marketing cu trimiterea de emailuri  
  → Support marketing teams by automating email communication workflows. *(inferred, to confirm)*

Bad patterns found: none

### Operator date / Asistent administrativ, Firmă de curierat (2020 – 2023)

**Earlier prompts**

Base CV questions:
- Cu ce se ocupă compania la care ai lucrat?  
  Options: Servicii logistice / Comerț cu amănuntul / Servicii financiare / Producție industrială
- Care a fost scopul principal al rolului tău?  
  Options: Gestionarea bazei de date / Suport administrativ pentru echipă / Procesarea documentelor comerciale / Asistență clienți
- Ce instrumente sau software ai utilizat în activitatea ta?  
  Options: Pachetul Microsoft Office / Sistem ERP (ex: SAP, Oracle) / Sistem CRM / Platforme de e-mail și ticketing
- Ce tip de date ai introdus în sistem?
- Cât de des ai generat aceste rapoarte și pentru cine?
- Ce procese ai automatizat folosind macro-uri?
- Ce tip de solicitări ai gestionat în corespondența cu clienții?

Tailoring questions:
- Pentru rapoartele în Excel, ai utilizat funcții avansate precum VLOOKUP, INDEX/MATCH sau Power Query pentru a automatiza procesarea datelor?  
  Options: Da, am folosit funcții avansate / Am folosit Power Query / M-am limitat la funcții de bază
- Ce limbaj sau metodă ai folosit pentru a crea acele macro-uri în Excel?  
  Options: VBA (Visual Basic for Applications) / Înregistrare de macro-uri (Record Macro) / Office Scripts

Tailoring rewrites:
- Rapoarte în Excel  
  → Generated data reports in Excel to support logistics process monitoring. *(inferred, to confirm)*
- Introducere date în sistem  
  → Managed data entry and system updates within logistics software.
- Corespondență cu clienții  
  → Handled professional correspondence with clients.

Bad patterns found (9):
- ⚠ enrichment question is in Romanian, the interface is in English: “Cu ce se ocupă compania la care ai lucrat?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Care a fost scopul principal al rolului tău?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Ce instrumente sau software ai utilizat în activitatea ta?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Ce tip de date ai introdus în sistem?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Cât de des ai generat aceste rapoarte și pentru cine?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Ce procese ai automatizat folosind macro-uri?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Ce tip de solicitări ai gestionat în corespondența cu clienții?”
- ⚠ tailoring question is in Romanian, the interface is in English: “Pentru rapoartele în Excel, ai utilizat funcții avansate precum VLOOKUP, INDEX/MATCH sau Power Query pentru a automatiza procesarea datelor?”
- ⚠ tailoring question is in Romanian, the interface is in English: “Ce limbaj sau metodă ai folosit pentru a crea acele macro-uri în Excel?”

**Reworked prompts**

Base CV questions:
- What does the company do?
- What was the main purpose of your role?  
  Options: Data management and reporting / Administrative support / Customer service operations
- Besides Excel, what other tools or software did you use?  
  Options: SAP / ERP systems / CRM software / Outlook
- Who did you report to in this role?  
  Options: Office Manager / Department Head / Operations Manager / Business Owner
- What kind of data were you entering, and which system did you use?
- What were these Excel reports used for?
- What process did you automate or improve with these macros?
- What was the primary purpose of your correspondence with clients?

Tailoring questions:
- Did you use VBA or Google Apps Script to create those macros in Excel?  
  Options: Yes, I used VBA / Yes, I used Google Apps Script / No, I used built-in Excel features only
- Did you use any formulas like VLOOKUP, INDEX/MATCH, or QUERY to process data in your reports?  
  Options: Yes, I used advanced formulas / I used basic formulas only / I used Pivot Tables mostly

Tailoring rewrites:
- Introducere date în sistem  
  → Managed data entry and maintained records within internal systems.
- Corespondență cu clienții  
  → Handled written correspondence with clients.

Bad patterns found: none

### Recepționeră, Hotel (2018 – 2020)

**Earlier prompts**

Base CV questions:
- Ce tip de unitate sau companie ai reprezentat în acest rol?  
  Options: Hotel sau pensiune / Clinică medicală / Birouri corporate / Salon de înfrumusețare
- Care a fost scopul principal al rolului tău în cadrul echipei?  
  Options: Gestionarea fluxului de clienți / Suport administrativ pentru management / Coordonarea activităților de recepție / Gestionarea apelurilor și corespondenței
- Ce instrumente sau software ai utilizat frecvent în activitatea ta?  
  Options: Pachetul Microsoft Office / Sisteme CRM / Platforme de rezervări online / Sisteme telefonice VOIP
- Ce instrumente sau software ai folosit pentru gestionarea rezervărilor?

Tailoring questions:
- În timpul activității de recepționeră, ați utilizat sisteme software pentru gestionarea rezervărilor sau a bazei de date a clienților?  
  Options: Da, am folosit sisteme complexe de tip PMS/CRM / Am folosit baze de date simple sau Excel / Nu am utilizat software de gestiune

Tailoring rewrites:
- (none)

Bad patterns found (5):
- ⚠ enrichment question is in Romanian, the interface is in English: “Ce tip de unitate sau companie ai reprezentat în acest rol?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Care a fost scopul principal al rolului tău în cadrul echipei?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Ce instrumente sau software ai utilizat frecvent în activitatea ta?”
- ⚠ enrichment question is in Romanian, the interface is in English: “Ce instrumente sau software ai folosit pentru gestionarea rezervărilor?”
- ⚠ tailoring question is in Romanian, the interface is in English: “În timpul activității de recepționeră, ați utilizat sisteme software pentru gestionarea rezervărilor sau a bazei de date a clienților?”

**Reworked prompts**

Base CV questions:
- What kind of company was this for?
- What was the main purpose of your role?  
  Options: Front desk operations / Client support / Administrative support / Facility management
- What tools or software did you use in your daily work?  
  Options: Microsoft Office / Internal CRM / Phone switchboard / Email management tools
- What was the scale of your work (e.g., daily visitors or bookings)?  
  Options: Under 20 per day / 20–50 per day / 50–100 per day / 100+ per day
- What software or tools did you use to manage the reservations?

Tailoring questions:
- (none)

Tailoring rewrites:
- (none)

Bad patterns found: none

