# Cost model1.1 — managed preference, constrained free pilot and matching cost

> Historical v1.1 snapshot. Its original reproduction scripts (`model_v1_1.py` and `free_pilot_v1_1.py`) are not present in this integrated bundle; `cohorts_v1_1.py` is therefore non-runnable here. Use the current `README.md` / v1.2 scripts for reproducible checks. The retained v1.1 numbers are source-history context, not newly verified output.

Current after review round1; earlier1.0 remains historical. No production provisioning,paid inference experiment,commercial price or automatic upgrade. Dated official rates and free quotas checked23October2026 in architecture/sources.md E-01–10/E-20–27.

## Updated paid-scale reference

Owner prefers **A:Supabase+CloudflareWorkers+BrowserRun**. C:EUNode+Supabase/localChromium is fallback comparison. Paid-scale costs do not authorize paid tiers; they avoid pretending free allowances serve growing demand.

|30-day active users|A known USD|C known USD|A with illustrative30%reserve|
|---:|---:|---:|---:|
|100|43.7078|49.2978|56.8201|
|1,000|82.7529|96.1679|107.5788|
|10,000|478.2794|491.6194|621.7633|

New **evidence_matching** operation:8newjob/profile contexts/user,7,000input/1,800outputtokens,20%app response-cache hits and5%extra attempts. Accepted profile-to-requirement mappings are reused to project CVMatch; two separate full-profile model calls per minor edit are not assumed. Additionalmodelcost is118.272USD/10kusers in baseline. These are token/workload estimates,not quality/latency measurements. Automatic AI extraction/matching is not implemented. DirectOpenAI initially; futureOpenRouter fees/modeltokenization/routing remain unknown.

Other baseline:0.25uploads,4interviewturns,8jobparses,4fulltailors,8selectedrewrites,20analyses,6PDFexports/user.20%appcache onparse/matching/tailor/rewrite,zero providercache discount,5%renderattempts,10%additional premiumtailor calls,10s/render;10MBfiles+1MBDB/user,7daily full-equivalent backups,staging/paid-overages included. Original assumptions/rate arithmetic remain documented in README.md; current source ismodel_v1_1.py/assumptions-v1.1.json. All actualcost/providerusage fieldsnull. Reserve30%is arbitrary sensitivity,not approvedbudget.

At10k newknownA/CUSD:onboarding524.08/537.42;heavy100AIunit/30export883.00/800.34;zerocache562.55/575.89;max3billedattempts1,383.55/1,396.89;30sPDF509.78/491.62;50MBfiles/5MBDB538.00/551.34;30exports×30s731.78/491.62. Heavy100units explicitlyallocates24upload+12interview+12parse+24tailor+16rewrite+12matching;do notclaimallseparatemaxima simultaneously. FlatCinvoice under rendering bursts remains unproven capacity.

## Free-pilot feasibility, not free-at-scale

SupabaseFree:500MBDB,1GBfiles,5GBuncachedegress,50kMAU,max2projects,pauseafter1weekidle. BrowserRunFree:600seconds/day,3concurrent sessions,no unused-day carryover. WorkersFree:100krequests/day,10msCPU/request,128MBisolate. At10s/render,about60attempts/day. These limits were verified;actuallatency/memory/capacity were not.

25users fit average storage/egress/rendering quotas under the stated assumptions;conditional AI+independentbackup demand is0.9269USD/30days.100users fill1GBfiles exactly withnoheadroom;averagebrowser210seconds/day fits600butbursts canfail.1,000users exceedstorage/DB/egress andrender35min/day;10,000users exceedfurther. These are demand calculations,notservedfree-servicecosts. All sizes retain **unproven free runtime**:the current50msAPI assumption exceeds10msfreebudget. A thin/bounded API andparserbenchmark must establish fit first;free fullPDF/DOCX/OCR execution is not promised.

Cost of paidOpenAI does not becomezero because infrastructure isfree. Separatebackups,SMTP/domain,legal/support,taxes/Stripe/FX andpossibleupgrade costs remainpaid orunknown. `free-pilot-v1.1.json` deliberately keepscompleteServiceCostUSDnull andservedAllDemandunknown. No unapprovedautomatic upgrade:at80%warn/reduce retention;at100%reserve rejection,pause/queuewithin deadline/manualfallback. Upgrade triggers includeCPU/memory limits,storage/egress/dailybrowsercapacity,availability/backup requirements andstagingneeds. Owner approves anypaidtier.

## Reproduction and provenance

`model_v1_1.py` produces baseline/18sensitivities withDecimal assertions;`cohorts_v1_1.py` produces21cohort/tailrows;`free_pilot_v1_1.py` checksfreecapacityarithmetic. Newtests justified changedworkload;no modelAPIcalls. Inputs/rules/models/prices/operationtokens/cachedtokens/output/providerreportedusage/estimatedoractualcost andperoperation/userperiod are maintained. Originalledger contract applies;router addsrouter+actualupstreamidentity andbillingfields. No exchange rate,paidconversion,margin orsellingprice chosen. Bothscorecalculations remain deterministic overstoredAIclassifications;theirprovider cost isseparatefromnumericcalculation.
