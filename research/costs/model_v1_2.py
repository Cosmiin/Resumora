"""Discovery cost calculator1.2; journey sections/skills/LinkedIn and lean tracking increment. Decimal arithmetic; no network, secrets, or paid API calls."""
from decimal import Decimal as D
from pathlib import Path
import json,csv,copy
HERE=Path(__file__).resolve().parent
DAY='2026-10-23'
PRICES={
 'openai:gpt-6-luna':{'input':'.10','cached':'.01','cache_write':'.125','output':'.50','source':'E-04','currency':'USD','mode':'standard; short context; 30m write'},
 'openai:gpt-6.1-sol':{'input':'2','cached':'.10','cache_write':'2.5','output':'10','source':'E-04','currency':'USD','mode':'standard; short context; 30m write'},
 'anthropic:claude-haiku-5.5':{'input':'.10','cached':'.01','cache_write':'.125','output':'.50','source':'E-08','currency':'USD','mode':'standard; <=100k prompt; 5m write'},
 'google:gemini-3.1-flash-lite':{'input':'.25','cached':'.025','cache_write':None,'output':'1.50','source':'E-09','currency':'USD','mode':'paid standard; cache storage extra, not modeled'}
}
OPS=[
 {'operation':'upload_normalize','perUser':'.25','input':6000,'output':1800,'appCache':'0'},
 {'operation':'interview_turn','perUser':'4','input':1800,'output':350,'appCache':'0'},
 {'operation':'job_parse','perUser':'8','input':2000,'output':600,'appCache':'.20'},
 {'operation':'tailor_full','perUser':'4','input':6000,'output':1800,'appCache':'.20'},
 {'operation':'evidence_matching','perUser':'8','input':7000,'output':1800,'appCache':'.20'},
 {'operation':'section_questions','perUser':'2','input':2000,'output':450,'appCache':'.20'},
 {'operation':'skills_inference','perUser':'.5','input':2500,'output':350,'appCache':'.20'},
 {'operation':'linkedin_review','perUser':'.5','input':3500,'output':800,'appCache':'.20'},
 {'operation':'rewrite_selected','perUser':'8','input':1200,'output':180,'appCache':'.20'}
]
ASSUMPTIONS={'version':'costs-1.2.0','verifiedDate':DAY,'periodDays':30,'activeUsers':[100,1000,10000],'defaultModel':'openai:gpt-6-luna','prices':PRICES,'operations':OPS,'inferenceExtraAttempts':'.05','renderExtraAttempts':'.05','premiumEscalationFraction':'.10','premiumModel':'openai:gpt-6.1-sol','regionalUplift':'.10','promptCacheReadFraction':'0','promptCacheWriteFraction':'0','deterministicAnalysesPerUser':20,'exportsPerUser':6,'renderSeconds':10,'renderConcurrencyCap':5,'peakFactor':20,'workingHoursPerMonth':176,'workerRequestsPerUser':600,'workerCpuMsPerRequest':50,'liveBlobGBPerUser':'.01','databaseGBPerUser':'.0015','backupCopies':7,'backupGBMonthUSD':'.015','backupWritesPerUser':50,'backupReadsPerUser':40,'backupWriteUSDPerMillion':'4.5','backupReadUSDPerMillion':'.36','euHostUSDByUsers':{'100':'10.59','1000':'19.09','10000':'35.59'},'euHostPriceSource':'E-10/E-21; CX33/CX43/CX53 + IPv4; scenario sizing unbenchmarked','stagingComputeUSD':'10','supabasePlanUSD':'25','supabaseComputeCreditUSD':'10','computeUSDByUsers':{'100':'10','1000':'15','10000':'60'},'workersPaidUSD':'5','workersIncludedRequests':10000000,'workersIncludedCpuMs':30000000,'workersRequestUSDPerMillion':'.30','workersCpuUSDPerMillionMs':'.02','browserIncludedHours':10,'browserUSDPerHour':'.09','browserConcurrencyUSD':2,'browserIncludedConcurrency':10,'storageIncludedGB':100,'storageOverageUSDPerGB':'.0213','databaseIncludedGB':8,'databaseOverageUSDPerGB':'.125','egressGBPerUser':'.02','egressIncludedGB':250,'egressOverageUSDPerGB':'.09','mauIncluded':100000,'mauOverageUSD':'.00325','reserveFraction':'.30','stripe':{'standardEEA':'0.015','billing':'0.007','fixedRON':'1.00','sellingPrices':None,'paidConversion':None,'exchangeRate':None},'unknownCosts':['transactional SMTP','domain/DNS extras','VAT/taxes and currency conversion','chargebacks/refunds and Tax add-on','human engineering/support/legal/accounting','optional malware/OCR CPU and storage egress beyond assumptions','dedicated EU renderer or residency-required host','PITR/HA additional backup services','actual model access/latency and peak capacity']}
def decimal(v):return D(str(v))
def token_cost(model,inp,cached,out,write=0):
    p=PRICES[model];i,c,o,w=map(decimal,[inp,cached,out,write]);assert c+w<=i
    assert w==0 or p['cache_write'] is not None
    return ((i-c-w)*decimal(p['input'])+c*decimal(p['cached'])+o*decimal(p['output'])+w*decimal(p['cache_write'] or 0))/D(1000000)
def calculate(n,activity=1,no_app_cache=False,default_model=None,reads=None,writes=None,premium=None):
    a=ASSUMPTIONS;model=default_model or a['defaultModel'];scale=decimal(activity)
    read=decimal(a['promptCacheReadFraction'] if reads is None else reads);write=decimal(a['promptCacheWriteFraction'] if writes is None else writes)
    uplift=D(1)+decimal(a['regionalUplift']) if model.startswith('openai:') else D(1)
    ledger=[]
    for op in OPS:
        requests=decimal(op['perUser'])*n*scale
        hit=D(0) if no_app_cache else decimal(op['appCache'])
        attempts=requests*(1-hit)*(1+decimal(a['inferenceExtraAttempts']))
        inp=attempts*op['input'];out=attempts*op['output'];cached=inp*read;write_tokens=inp*write
        cost=token_cost(model,inp,cached,out,write_tokens)*uplift
        ledger.append({'provider':model.split(':')[0],'model':model.split(':')[1],'operation':op['operation'],'inputTokens':inp,'cachedInputTokens':cached,'cacheWriteTokens':write_tokens,'outputTokens':out,'attempts':attempts,'applicationCacheHits':requests*hit,'providerReportedUsage':None,'costKind':'estimated','estimatedCostUSD':cost,'actualCostUSD':None,'priceVersion':DAY,'priceSource':PRICES[model]['source'],'userPeriod':f'{n} active users / 30 days','modelResolved':None})
        if op['operation']=='tailor_full':
            # Escalation is an additional call, so both failed/low-quality first call and escalation are billed.
            fraction=decimal(a['premiumEscalationFraction'] if premium is None else premium)
            cnt=attempts*fraction;p=a['premiumModel'];extra=token_cost(p,cnt*op['input'],0,cnt*op['output'])*(1+decimal(a['regionalUplift']))
            ledger.append({'provider':'openai','model':p.split(':')[1],'operation':'tailor_escalation','inputTokens':cnt*op['input'],'cachedInputTokens':D(0),'cacheWriteTokens':D(0),'outputTokens':cnt*op['output'],'attempts':cnt,'applicationCacheHits':D(0),'providerReportedUsage':None,'costKind':'estimated','estimatedCostUSD':extra,'actualCostUSD':None,'priceVersion':DAY,'priceSource':'E-04','userPeriod':f'{n} active users / 30 days','modelResolved':None})
    ai=sum((l['estimatedCostUSD'] for l in ledger),D(0))
    blobs=n*decimal(a['liveBlobGBPerUser']);db=n*decimal(a['databaseGBPerUser'])
    renders=decimal(a['exportsPerUser'])*n*scale*(1+decimal(a['renderExtraAttempts']))
    hours=renders*decimal(a['renderSeconds'])/D(3600)
    peak=renders/(decimal(a['workingHoursPerMonth'])*D(3600))*decimal(a['peakFactor'])*decimal(a['renderSeconds'])
    req=n*decimal(a['workerRequestsPerUser'])*scale;cpu=req*decimal(a['workerCpuMsPerRequest'])
    costs={
      'supabase_plan':decimal(a['supabasePlanUSD']),
      'supabase_extra_compute':max(D(0),decimal(a['computeUSDByUsers'][str(n)])-decimal(a['supabaseComputeCreditUSD'])),
      'staging_compute':decimal(a['stagingComputeUSD']),
      'workers_minimum':decimal(a['workersPaidUSD']),
      'workers_requests_overage':max(D(0),req-a['workersIncludedRequests'])/D(1000000)*decimal(a['workersRequestUSDPerMillion']),
      'workers_cpu_overage':max(D(0),cpu-a['workersIncludedCpuMs'])/D(1000000)*decimal(a['workersCpuUSDPerMillionMs']),
      'private_storage_overage':max(D(0),blobs-a['storageIncludedGB'])*decimal(a['storageOverageUSDPerGB']),
      'database_overage':max(D(0),db-a['databaseIncludedGB'])*decimal(a['databaseOverageUSDPerGB']),
      'egress_overage':max(D(0),n*decimal(a['egressGBPerUser'])-a['egressIncludedGB'])*decimal(a['egressOverageUSDPerGB']),
      'auth_mau_overage':max(D(0),n-a['mauIncluded'])*decimal(a['mauOverageUSD']),
      'browser_duration':max(D(0),hours-a['browserIncludedHours'])*decimal(a['browserUSDPerHour']),
      'browser_concurrency':max(D(0),decimal(a['renderConcurrencyCap'])-a['browserIncludedConcurrency'])*decimal(a['browserConcurrencyUSD']),
      'separate_backup_storage':(blobs+db)*decimal(a['backupCopies'])*decimal(a['backupGBMonthUSD']),
      'backup_requests':n*(decimal(a['backupWritesPerUser'])*decimal(a['backupWriteUSDPerMillion'])+decimal(a['backupReadsPerUser'])*decimal(a['backupReadUSDPerMillion']))/D(1000000),
      'inference':ai}
    subtotal=sum(costs.values());return {'activeUsers':n,'knownSubtotalUSD':subtotal,'knownPerActiveUserUSD':subtotal/n,'reserveUSD':subtotal*decimal(a['reserveFraction']),'knownPlusReserveUSD':subtotal*(1+decimal(a['reserveFraction'])),'costsUSD':costs,'ledger':ledger,'renderHours':hours,'unconstrainedPeakBrowsersEstimate':peak,'renderConcurrencyCap':a['renderConcurrencyCap'],'capacityProven':False,'totalBusinessCostUSD':None,'stripeFees':None,'unknownCosts':a['unknownCosts']}
def stripe_fee_ron(gross_ron,transactions):
    return decimal(gross_ron)*(decimal(ASSUMPTIONS['stripe']['standardEEA'])+decimal(ASSUMPTIONS['stripe']['billing']))+decimal(transactions)*decimal(ASSUMPTIONS['stripe']['fixedRON'])
def normalize(x):
    if isinstance(x,D):return str(x.quantize(D('.00000001')))
    if isinstance(x,dict):return {k:normalize(v) for k,v in x.items()}
    if isinstance(x,list):return [normalize(v) for v in x]
    return x
def main():
    baseline=[calculate(n) for n in ASSUMPTIONS['activeUsers']]
    hybrid=[]
    for original in baseline:
        r=copy.deepcopy(original);n=r['activeUsers'];c=r['costsUSD']
        for k in ['workers_minimum','workers_requests_overage','workers_cpu_overage','browser_duration','browser_concurrency']:c.pop(k)
        c['eu_node_host_including_local_render']=decimal(ASSUMPTIONS['euHostUSDByUsers'][str(n)])
        r.update(stack='C: Supabase + EU Node modular monolith; local Chromium',knownSubtotalUSD=sum(c.values()),renderConcurrencyCap=2)
        r['knownPerActiveUserUSD']=r['knownSubtotalUSD']/n
        r['reserveUSD']=r['knownSubtotalUSD']*decimal(ASSUMPTIONS['reserveFraction'])
        r['knownPlusReserveUSD']=r['knownSubtotalUSD']+r['reserveUSD']
        hybrid.append(r)
    sensitivities=[]
    for n in ASSUMPTIONS['activeUsers']:
        for name,kw in [('activity_3x',{'activity':3}),('no_app_cache',{'no_app_cache':True}),('all_sol',{'default_model':'openai:gpt-6.1-sol','premium':'0'}),('gemini_same_tokens',{'default_model':'google:gemini-3.1-flash-lite','premium':'0'}),('haiku_same_tokens',{'default_model':'anthropic:claude-haiku-5.5','premium':'0'}),('cache_25pct_reads_10pct_writes',{'reads':'.25','writes':'.10'})]:
            r=calculate(n,**kw);sensitivities.append({'scenario':name,'activeUsers':n,'knownSubtotalUSD':r['knownSubtotalUSD'],'inferenceUSD':r['costsUSD']['inference']})
    assert token_cost('openai:gpt-6-luna',1000000,0,0)==D('.10')
    assert token_cost('openai:gpt-6-luna',1000000,1000000,0)==D('.01')
    assert token_cost('openai:gpt-6-luna',1000000,0,0,1000000)==D('.125')
    assert stripe_fee_ron(1000,10)==D('32.000') # synthetic fee arithmetic, not a plan price
    for r in baseline:
        assert sum(r['costsUSD'].values())==r['knownSubtotalUSD']
        assert sum(l['estimatedCostUSD'] for l in r['ledger'])==r['costsUSD']['inference']
    assert baseline[2]['renderHours']==D(175)
    assert baseline[2]['costsUSD']['browser_duration']==D('14.85')
    (HERE/'assumptions-v1.2.json').write_text(json.dumps(ASSUMPTIONS,indent=2)+'\n')
    (HERE/'results-v1.2.json').write_text(json.dumps(normalize({'baseline':baseline,'hybrid':hybrid,'sensitivities':sensitivities}),indent=2)+'\n')
    with (HERE/'costs-v1.2.csv').open('w') as f:
        w=csv.writer(f);w.writerow(['active_users','cost_item','USD_per_30_days'])
        for r in baseline:
            for k,v in r['costsUSD'].items():w.writerow([r['activeUsers'],k,str(v)])
            w.writerow([r['activeUsers'],'KNOWN_SUBTOTAL_EXCLUDES_UNKNOWNS',str(r['knownSubtotalUSD'])])
    (HERE/'usage-ledger-v1.2.example.jsonl').write_text('\n'.join(json.dumps(normalize(x)) for x in baseline[0]['ledger'])+'\n')
    for r in baseline:print(r['activeUsers'],'known USD',round(r['knownSubtotalUSD'],4),'AI USD',round(r['costsUSD']['inference'],4),'with 30% reserve',round(r['knownPlusReserveUSD'],4))
    for r in hybrid:print('hybrid',r['activeUsers'],'known USD',round(r['knownSubtotalUSD'],4),'with 30% reserve',round(r['knownPlusReserveUSD'],4))
    print('PASS Decimal token/cache/write, fee, per-operation aggregation, total aggregation, rendering arithmetic; 18 sensitivity rows')
if __name__=='__main__':main()
