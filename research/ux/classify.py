from pathlib import Path
import json,csv
root=Path(__file__).resolve().parent
observations=[
('Public landing','Hero, score/editor illustrations, templates, testimonials, pricing, FAQ and footer','Landing CTA → onboarding is inferred; public page content is observed'),
('CV builder landing','CV creation hero, four-step illustration, score/chat/editor/translation feature cards, templates, FAQ','Marketing claims do not establish app behavior'),
('ATS landing','Upload-oriented hero, score/keyword/formatting illustrations, chat/editor/template feature blocks','No live ATS method can be derived'),
('CV checker landing','Upload-oriented hero, personal CV score and category panels, chat/editor/templates','Personal score versus job compatibility distinction is not validated'),
('Application landing','Application preparation hero, four-step diagram, matching/tailoring/tracking feature illustrations','No application transmission observed'),
('Application tracking landing','Board illustration with application columns; job/CV/letter feature blocks','Tracking UI is a marketing illustration, not an app capture'),
('Onboarding preference','Job-search intent: yes, somewhat, no; progress and Continue','Selection persistence and next route unverified'),
('Onboarding preference','Weekly application frequency: 0–3, 4–9, 10+; back and Continue','Sequence inferred from filename/mtime/progress'),
('Onboarding attribution','Referral-source choices incl social/search/family; Continue','Data use/necessity unknown'),
('Onboarding preference','Prior app usage yes/no; Continue','Conditional branch unobserved'),
('Onboarding persuasion','Long-term job-offer chart and outcome claims; Continue','Claims unsupported by supplied evidence; exclude from target'),
('Onboarding preference','Goals: invitations, speed, suitable jobs, other','Selection effect unknown'),
('Promotional modal','Centered score before/after illustration, outcome multiplier claim, close and Continue','Modal trigger/dismiss destination unknown'),
('Upload / manual entry','PDF upload dropzone, max 10 MB, example score and start-from-zero link','Upload format/limit are reference observations, not adopted product policy'),
('Extraction loading','20% progress; read CV, calculate score, generate suggestions, prepare results','Polling, timeout/cancel/error absent'),
('Onboarding preference','Desired time to find a job slider; three months selected','Outcome implications not adopted'),
('Onboarding preference','Desired interview frequency slider; three per week shown','Not evidence of hiring likelihood'),
('Onboarding preference','Obstacles: insufficient applications, no invitations, no offer','Multi-select behavior unverified'),
('Onboarding persuasion','Response multiplier comparison graphic; Continue','Unsupported claims excluded'),
('Onboarding location','Country chips plus other-country selector; Romania selected','Not a residence requirement'),
('Onboarding location','City input with Bucharest and clear control','Autocomplete/validation unknown'),
('Onboarding positioning','Suggested target roles; selected role; custom-role link','Two independent titles required by baseline, not established here'),
('Onboarding seniority','Junior/mid/senior/manager options; senior selected','Years brackets are reference copy, not canonical experience calculation'),
('Onboarding employment','Full/part time, student, freelance, internship checkboxes','Selected full time visible'),
('Onboarding remote','Remote openness yes/no; yes selected','Job preference, not CV fact'),
('Onboarding salary','Annual RON salary range slider','Tax/net/gross treatment unknown; omit from MVP profile'),
('Onboarding motivation','Income/family/interest/time goals; Continue','Optionality/data purpose unknown'),
('Onboarding persuasion','Predicted interview timeline chart','Unsupported projection excluded'),
('Plan generation prompt','Generate personalized plan CTA','Actual generator unverified'),
('Plan loading','Spinner and almost-ready message','Cancel/failure/retry not visible'),
('Plan summary','Three-step plan: improve CV, find jobs, ATS application; preference summary','Suggested recommendations, not completed work'),
('Template choice','Template carousel with selected classic layout and Use template','Actual rendering/ATS safety unverified'),
('Add-job modal','URL input required, add job CTA, continue without listing','URL parsing and manual/text fallback unobserved'),
('Improvement stepper','Structure, experience, education, editor steps; structure active','Return/skip behavior unknown'),
('Structure chat + preview','Chat/styling tabs, assistant structure response, recommended section content, CV preview','Chat actions visible, backend/undo not verified'),
('Styling + preview','Template cards, accent palette, spacing/font/image sliders, translation selector, preview','Distinct controls observed; exact rendering effects untested'),
('Translation modal','Source/target language controls and target list','UI locale independence required by baseline, not proved by capture'),
('Base CV role chat','Role-related assistant context, chat input, document preview','Base persistence/branching unknown'),
('Experience proposed edit','Assistant asks for short context and three achievement bullets; proposed replacement; Edit/Accept','Acceptance control observed; fact verification and save target not shown'),
('Subscription offer','Term options and highlighted deal, benefit list, CTA, social proof','Prices/discounts are reference only and not adopted'),
('Checkout concept','Plan summary, payment form, payment-method controls, pay CTA','No successful purchase, renewal/cancel/failure captured'),
('Full structured editor','Edit/styling tabs, score, accordion sections, content controls, CV structure order, preview/export','Undo/version history, provenance and responsive behavior unobserved'),
('Job document hub','Job-specific CV and cover-letter document cards with adaptation/create actions','Not evidence of automated application submission'),
('Base CV selection','Job context, selectable existing CV, create new CV, Continue','Selection → adaptation inferred from context')]
items=json.loads((root/'inventory.json').read_text())['screenshots']
assert len(observations)==len(items)==44
for row,obs in zip(items,observations):row.update(screen=obs[0],observed=obs[1],limitation=obs[2])
(root/'screen-evidence.json').write_text(json.dumps({'version':'1.0','reviewed':'2026-10-23','method':'All 44 images visually inspected through local-only contact sheets; long pages inspected as consecutive strips. Fine print in long-page marketing content not transcribed. Interactive effects are unverified.','screens':items},ensure_ascii=False,indent=2))
with (root/'inventory.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(items[0]));w.writeheader();w.writerows(items)
s='# Screenshot inventory and evidence map v1\n\n2026-10-23. All 44 PNGs visually reviewed; 10 Zone.Identifier files excluded. IDs follow mtime, then filename. Mtime is an ordering clue, not capture-time proof; copied creation timestamps are not used. SHA-256, byte counts and full UTC timestamps are in inventory.json. Static captures prove visible components only. Long-page marketing microcopy was not exhaustively transcribed. Reference pixels stay local and are excluded from the deliverable.\n\n| ID / original filename | Dimensions | Modified UTC | Screen / observed components | Inference / limitation |\n|---|---|---|---|---|\n'
for x in items:s+=f"| {x['id']} `{x['filename']}` | {x['width']}×{x['height']} | {x['modified_utc']} | **{x['screen']}**. {x['observed']} | {x['limitation']} |\n"
s+='''\n## Navigation evidence\n\n- **Observed controls, unverified transitions:** S07–S12 and S16–S29 show Continue; many show back; S14 shows upload/manual alternatives; S33 shows URL add/skip; S39 shows Edit/Accept; S44 shows CV selection/create/Continue.\n- **Probable sequence (inference):** S07 → S08 → S09 → S10 → S11 → S12 → S13 → S14 → S15 → S16…S32 → S34, supported by numeric filenames, increasing mtime and progress. Missing onboarding17 is not silently invented. S33 interrupts the timestamp series and may be a separate job flow.\n- **Editor cluster (observed coexistence, inferred route):** S35/S38 chat + preview ↔ S36 styling; S37 translation modal; S39 experience proposal; S42 structured edit. Captures do not establish which editor is default.\n- **Job branch (inference):** S33 URL import → S43 document hub → S44 Base selection → adaptation/editor. S43 precedes S44 by mtime, but no navigation event is captured.\n- **Billing branch (inference):** S40 offer → S41 checkout, supported by term/plan consistency and adjacent mtime. Payment completion absent.\n- **Public navigation:** S01–S06 share a public-site navigation/footer and cross-feature links; marketing illustrations must not be mistaken for verified app states.\n\n## States absent or insufficiently evidenced\n\nNo account registration/login/reset/verification; extraction failure/cancel/retry; corrupt/oversize/type validation; field confidence and provenance; structured extracted-fact confirmation; job URL blocked/duplicate/error; ATS formula/version/required qualification gate; five keyword statuses; bilingual equivalence justification; before/after selective approval and separate Base promotion; immutable history/undo/conflicts; delete/restore sections; export failure and PDF text-order test; subscription activation/webhook/renewal/cancel/failed payment; account privacy/export/deletion confirmation; keyboard/focus/accessibility; mobile editor navigation. S15 and S30 show loading only. Prototype states for these are design proposals from the baseline.\n'''
(root/'evidence-map.md').write_text(s)
print('44 classified rows written')
