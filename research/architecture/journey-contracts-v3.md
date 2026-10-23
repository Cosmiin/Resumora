# Journey feasibility and contracts — iteration2 / v3

Supporting specification for the **UX-owned integrated journey**, not a second product entry point. Mara Ionescu, Brașov, Automation Engineer | Business Systems Analyst is a coherent synthetic case proposed for alignment through Firstmate. Target: synthetic Business Systems Analyst — Automation, requiring Power Automate/workflows/SQL/REST APIs/3+years/stakeholder communication and explicit right-to-work evidence, preferring HR context. No actual application, LinkedIn write, inference or PDF service ran.

## First-use and return-loop map

|User intent / primary action|State and facts changed|Work classification / bounded calls|Failure and visible recovery|Next visible action|
|---|---|---|---|---|
|Prepare a CV for a job / no job yet|One workspace records chosen route, independent UI/CV languages; a saved job can precede Base|Deterministic navigation;0AI|Session/draft recovery;no forced restart of onboarding|Upload/manual entry or choose existingBase|
|Use existing experience / review extraction|Private source→unconfirmed draft→selected user confirmation→Base snapshot; source locator preserved|Async bounded extraction/normalization;existing upload operation;not a rewrite|Unsupported scan/encrypted file→manual/paste;field-level correction;revision conflict preserves local edits|Open immediate section review|
|See what to improve / open one highlighted section|Diagnosis can inspect draft structure without treating extraction as confirmed facts;checks pin draft/snapshot/section|Deterministic diagnosis of all sections immediately;no model needed for missing fields/order/privacy/dates|Readiness pending/N/A not silentlypass;manual input/skip remain available duringquota/providerfailure|Answer the one relevant question or edit directly|
|Explain real contribution / fill action,tools,who,result helpers|User text/structured answer becomes source;proposed facts stay unconfirmed untilattested;qualitative result valid|Structured fields/standard question templates0AI;optional onecachedsection-question batch;selectedrewriteafterfacts are supplied|Unknown/confidential number→omit;AIcannot inventmetric,tool,date;timeoutkeepsanswer|Confirm facts,thenpreview selected wording|
|Edit skills manually or ask from experience / choose Append orReplace|Preview a target-list patch linked to supporting roles;manual entries andAIproposals retain source;Undo restores onlyscopedraft|Manualedit/preview/accept/Undo0AI;oneexplicitboundedskillsinference onselectedconfirmedexperience|No implicitoverwrite;staleversion→compare;unsupportedAIitem stayspending;othersections unchanged|Accept/discard,Undo,saveversion|
|Choose dates / see honest duration|Year/month/ongoing preserved;unknownmonth hasunknownoption;noJanuarydefault inserted|Deterministicprecision-aware role duration andcareerunion;0AI|EndbeforepossibleStart→error;partialrange→estimatedrange/clarifyingquestion;concurrentroles notsummed|Save knownprecision orleavequestion|
|Capture/review a job / confirmrequirements|Text/capture source,job snapshot,required/preferred/hard-gate classification andambiguity retained|Manual/capturepreview0AI;jobparseonce pernewtext;oneacceptedprofile evidence map pernewjob/profilecontext|URL/extension/site failure→editablepaste;dup→existingjob/newversionchoice;ambiguousgate→needsverification|See three truthfulnextactions|
|Create job-specific CV / approvechanges|Confirmedprofile facts selected into jobbranch;generatedtextseparate;Basepromotionseparate|Deterministicscores/projectedCVcoverage;boundedselectedproposal;fulltailoronlyexplicit|Changingfact/jobinvalidatesdependentanalysis;unsupportedproposalrejected;no profile→CandidateFitnull|Review exactCV and remainingcriticalgap|
|Preview/export / selectprivacyandtemplate|PinCV,template,font/renderer/language/contactprojection;export asyncoperation separate|Templatepreview0AI;PDFrequest incursrenderbudget;actualtext-ordercheckneeded|Queue/quota/failedrender→retry/manualfallback;NotTesteduntilrealPDFtest;changingdraftdoesn'tchangein-flightdocument|Attach chosenversion toapplication|
|Keepapplicationmoving / addcontact,nextaction|User-managed application linksjob+CV/export;contactprivate;action/date explicit;returninguser resumeshere|CRUD/status/contact/nextaction0AI;no auto-outreach,autocampaign,calendar orinboxintegration assumed|Idempotentretry;exportdoesn'tmarkApplied;removingcontactpreservesapplication;overduenotificationnotpromised|Continueapplication/markownnextactiondone/addjob|
|Review ownLinkedIn text / approveproposal|Ownpasted/manualtext is separate source;reviewproposalscannot silentlyoverwriteBase oractualprofile|On-demandboundedreview,PIIminimized;cachebysource/base/locale/rubricversion|No credentials/backgroundscrape;timeoutkeepsinput;unverifiedLinkedInclaimasksconfirmation|Copyapprovedtext manually orpromoteconfirmedfactexplicitly|

## Immediate section review: all sections, progressive questions

Presence/structure checks are deterministic. Advice about meaning may be selectively AI-assisted and must cite source facts; no model-generated assertion becomes a fact by being phrased confidently. Every section has a review route, but not every question is mandatory before firstsave.

|Section|Immediate diagnosis|Useful next question / guard|
|---|---|---|
|Name|Missing/unclear professional name|“How should your professional name appear?” Manual answer;no inventedidentity.|
|Two titles|Two slots present/reviewed,truthful positioning|“Which professional focus should the second title show,or leave it blank?” Historical role title is separate.|
|Contacts/social/address|Valid chosen contactmethod,city/country,link format,privacyselection|“Which contact/link should appear?” Residential address optional;don'tsendcontactPIItoAI.|
|Summary|Supported experience,real outcome,strongest skills;unsupported numerals flagged|“Which confirmed contribution bestrepresents you?” Use“since2021”/boundedexperience whereappropriate;no inventedyears.|
|Professional/technical skills|Separate editablegroups,evidence link andunresolvedclassification|“Which tools did you actually use,andforwhat?” AIfromconfirmedroles→preview→Append/Replace→Undo;notautomaticconfirmation.|
|Each role|Company/title/location/dateprecision,scope andusefulachievementselection|“What did you own,who used it,andwhat changed?” Default3–4concise usefulbullets,adaptableforolder/limitedroles;don'tfillmissingbullets withfiction.|
|Education/certifications/languages|Knownissuer/qualification/level/dates;requiredcredentialambiguity|“Is this a degree,course orcurrentauthorization?” No recognition/licence inference fromtranslation;UIlanguage≠proficiency.|
|Projects/portfolio/achievements/leadership/publications/volunteering/custom|Available evidence andpossibleuse;emptysection notaddedforpoints|“Is there a real relevant example toshow?” Skip irrelevant/empty modules;allcanonicalkinds remainavailable.|

Mara's scripted answer says she connected Power Automate/SQL/REST APIs for payroll validation so finance could review exceptions in oneplace;she has no measuredtime-savingfigure. This supplies real **synthetic user-confirmed** context,not fabricated quantitativeimpact. The original/uploadedCV remainsimmutable;comparison uses thatolderpresentation versusajob-specificproposalbuiltfromenrichedBase. Do not deliberately omitfactsfromanewlygeneratedBase merely tocreateanartificialscoregain.

## Reversible draft contracts

`POST /v1/drafts/:id/proposals` accepts target section/item,modeappend|replace,expectedRevision,sourceClaimIds,operationkind. Returns proposed facts/text andbefore/afterselection;no implicitapply. `POST .../accept` appliesselectedpatch IDs only with matchingrevision. Skillsselection and factualattestation are separately scoped;AIinferredclaims remainpending untiluserconfirmation. Replace means replace the target list,notallcareerfacts. Existingtruth/history is retained.

`POST /v1/drafts/:id/undo` carriesactionId andexpectedRevision;restoreinversepatch onlyifnothingconflictingchanged,otherwisecompare. Prior tocommit,Undo islocal/reversibledraft state. Aftercommit,restorecreatesanewversion;revokingaconfirmationisexplicitandinvalidatescurrentevidence/scores. Undo mustnot silentlyerasehistory orclobberlateredits. ManualhelpersandUndo do notcallmodels.

Datehelper version `elapsed-date-bounds-1.0` separates elapsedtenurefromhistoricalcalendarcoverage. Itboundsunknownstart/enddaysforanalysis,unionsoverlappingintervals,thenformatscompletedyears/months. Bounds are not persisted invented dates. ExampleongoingJun2022at23Oct2026:51–52completedmonths(4y3–4y4m),partialdaysomitted. Totalfixture68–92elapsedwholemonths differsfromhistorical71–94calendarcoverage;labelmethod/as-of,neverpresentthisasamysteriousscoreimprovement. Actualrelevant-jobtenureusesacceptedrole/taskevidence,notjustallroles.

## Readiness, semantic scores,eligibility andPDF

Proposed `readiness-review-1.0.0`:fiveequalnominalcategoryweights20;criteriaareexplicitreviewchecks. Onlytruecontextabsence canmakeJoboptimization/ApplicationN/A;pendingisnotpass. Exposeeffectiveweights andassessedcoverage. This measures **reviewcompletion**,notwritingquality/hiringchance. RecommendedprimaryUI:concretenextaction/checklist;numbersecondary andscopelabeled. Addingajobchangesdenominator/context,soBase100→jobpending75isnotcomparablescoredecline;show“Base reviewdone;jobreviewpending.”

InitialMaraBasefixture78.33reviewcompletion→100afteractualreviewsteps;thisproposedrubricisnotapprovednumericpolicy. CandidateFitandCVMatchremainATS1.1;Mara'salignednewcaseis90and62.5→90,respectively. The+27.5CVgainselectsexistingconfirmedAPI/HR/outcome/context;CandidateFitstays90. Right-to-workconditionremainsneedsverification;locationisnotproof. AllchecksreviewedcanstillcoexistwitheligibilityneedsverificationandPDFNotTested. Primarynextactionmustsurfacecriticalgap,notcelebratea100badge. Noemptysection/metricbonus.

## New normalized records and endpoints

- Application(id,tenant,jobSnapshot,chosenCvSnapshot,exportRef?,userStage,nextActionRef,created/updated;stagehistorymanualsource). Contact andnextaction remainoptional;noCRMbeforefirstCV.
- Contact(id,tenant,name/professionalrole/company,chosencontactmethod/link,source/purpose,privatevisibility,retention/deletionstate). Third-partyPII isnotrequiredforAI;no purchasedenrichmentoroutreachpermission.
- NextAction(id,applicationId,kind,label,dueDate?,status,reminderMode=none initially). Due date ismanualorganization,notapromiseofemail/calendarintegration.
- ReadinessRun(rubric/input/contextversions,checkstates/sourcepaths,questions/deferredreasons);SectionQuestionBatch(section/facthash,purpose,model/prompt,answered/skip/cache);DraftPatch(before/after,inverse,scope,revision,acceptance).
- LinkedInInput/review(sourcehash,textscope,ownprofileattestation,retention/consent,baseSnapshot,rubric/modelversions,proposals,neveractualwrite). PromotiontoBaseisexplicitconfirmation,notparsingbyproxy.

`GET /base-cvs/:id/review` returnsimmediatedeterministicdiagnosis;`POST /sections/:id/questions` onlyifrequestedcontextualquestionbatch;`POST /skills/proposals` withselectedsource;`POST /applications`, `PATCH /applications/:id`, `POST /contacts`, `POST /applications/:id/next-actions`;`POST /linkedin/reviews`. Alltenant-owned,validated,idempotentwhereappropriate,versioned;AI/write/exportreservationscheckedserver-side. Keepmanualdraft/diagnosisavailableaccordingtoproposedaccesspolicy;policyunapproved.

## Capture,privacy,recovery andcost boundaries

Requestedjobextension:activeTab/userclick,preview/edittextandURL,explicitSend,scopedshortauth,per-tenantduplicatehash,editablepastefallback. No broadbackgroundbrowsing,LinkedIncredentials,cookies,automaticapply/messages orsitebypass. LinkedIninitialreviewusesownsuppliedtext;broadercaptureisaproduct/terms/storedecision,notassumed. Contactretention/legalbasis/rightsrequirecounsel;keepcontactsoutofcareerAIprompts. Rights/deletioncoverapplications,nextactions,LinkedInrawtext/reviews,derivedproposals/caches/backupswithtombstones.

Immediatechecks/manualhelpers/skillslistpatch/duration/applicationCRUD are deterministic. Explicitselectedquestions/skillsinference/LinkedInreview addboundedAIoperations. Answerextractionandrewrite reuseexistingmeters. Cachebytenant+section/provenance/context/rules/modelversion;answeredquestionsdon'trecurunchanged. CVselectionreusesacceptedprofile-jobmapping;nodeepmodelcalloneachkeystroke. Debounceautosave;remeasureWorkerCPU/memorybeforefreepromise. Quota/providerfailurepreservesdraft/manualpath;noautomaticpaidupgrade. Existingmanaged/free-tier-first/OpenAI-first/portableadapterconstraintsremain.

## Latest CV,search andsent counts — additional owner feedback

Firstmateinbox012relayedstrategyround2:complete1/1,terminalfor**strategy's**board. Thislaneonlyread/preservesthepayload;itdoesnotacknowledgeorretireanotherworker'ssource. Exactdirection:alwaysshowlatestgeneratedCVwithtailored/not-tailoredstatus,addapplicationsearch,showapplicationssent. Nogeneration/exportmaycountassent.

Applicationcardreturnslatestcompleted,non-supersededCVsnapshotattachedto**thatapplicationbranch**,plusseparatechosen/sentversionrefs. Allocate a server-monotonic sequence oncommitteddocumentversions;sortsequenceDESCwithstableIDtie-break,notclienttimestamps orarrivaloflateoperations. Pending/failed/cancelled/superseded generationscannotreplacehead;input-revisionfencing preventsolderlatejobs overridingnewerwork. Show“Generatingnewversion”separatelywhilekeepinglastcompletedversion. Manualcheckpoints preserveorigin/generationrefs andcanbe latestcontentversion;“latestgeneration”metadata remains separately available. ActualsentCVreferences stayimmutablewhenanewerCVexists.

`tailoringState=tailored|not_tailored` isexplicitprovenance:confirmedtargetjob +completedjob-specificselection/tailoringoperation;merelylinkingaBaseCV,analyzingit,changingtemplate orPDFexportdoesnotmakeittailored. A tailored draft pendingapproval saysso;anolderjobversionadds“targetchanged—review,”notfalsefreshness. NoCVyet is an explicitstate,not a fabricatedlatestversion.

`GET /applications?q=...&stage=...&cursor=...` usesauthorizedtenant-scopedboundedparameterizedsearch overjobtitle/company,contactname andusernextactionlabel;noAI,externalindex orfullCVplaintextsearchneeded. Debouncefrontend,limitlength/page-size,escapequerysyntax andrespectdeletion/ownership. Searchresultcount isseparatefromglobalcounter;nootheruser'srecords/autocompleteleak.

`POST /applications/:id/mark-sent` is explicit user attestation that an application was sent externally; optionally records actualknownsentdate andpinsCV/exportused. SystemrecordedAtisnotinventedactualsendtime. Idempotency/retriescannotdoublecount. Primarycounter=`distinctapplicationIds withvalidnonretracteduser-recordedsentevent`;closed/rejectedapplicationsstillsent,repeatversions/submissionsdonotinflateuniqueapplicationcount. Expose“applicationsmarked sentbyyou.” Correctingamistakeisexplicitretraction/correction,notmerelychangingstage. Exportcompletion,tailoring,PDFdownload,nextactiondone orAIinference cannotcreateasentevent. Noauto-send/outreach.
