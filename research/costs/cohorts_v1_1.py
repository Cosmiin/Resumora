"""Additional requested cohort/tail sensitivities; no paid inference or network."""
from pathlib import Path
from decimal import Decimal as D
import json,copy
import model_v1_1 as model
HERE=Path(__file__).resolve().parent
BASE_OPS=copy.deepcopy(model.OPS);BASE_ASSUMPTIONS=copy.deepcopy(model.ASSUMPTIONS)
SCENARIOS={
 'onboarding_month':{'ops':{'upload_normalize':'1','interview_turn':'12'},'reason':'Every user imports one CV and takes 12 enrichment turns; jobs/tailors/rewrites/exports otherwise steady-state. No observed cohort evidence.'},
 'heavy_allowance_month':{'ops':{'upload_normalize':'6','interview_turn':'12','job_parse':'12','tailor_full':'6','rewrite_selected':'16','evidence_matching':'12'},'exports':30,'analyses':100,'requests':3000,'reason':'Illustrative full 100-AI-unit allowance:24upload+12interview+12parse+24tailor+16rewrite+12matching; 100analyses and30exports. Proposed limits not approved.'},
 'zero_response_cache':{'zeroCache':True,'reason':'0% application response cache; provider prompt caching is also0% as in baseline.'},
 'long_pdf_3x_time':{'renderSeconds':30,'reason':'Multipage/font/CPU rendering sensitivity, six exports at30s each, not measured performance.'},
 'retention_50MB_5MB':{'blobGB':'.05','databaseGB':'.005','reason':'50MB blobs and5MB database per active user, seven full daily backup copies.'},
 'correlated_outage_3_attempts':{'extraAttempts':'2','zeroCache':True,'reason':'Every model request reaches max3billed attempts, no cache. Worst billable-attempt assumption, not expected independent retry probability.'},
 'export_edit_burst':{'exports':30,'renderSeconds':30,'requests':3000,'reason':'Repeated edit/export month with30PDFexports at30s, independent of AI activity. Queue delay still unmeasured.'}
}
def hybrid(r,n):
    c=copy.deepcopy(r['costsUSD'])
    for k in ['workers_minimum','workers_requests_overage','workers_cpu_overage','browser_duration','browser_concurrency']:c.pop(k)
    c['eu_node_host_including_local_render']=D(model.ASSUMPTIONS['euHostUSDByUsers'][str(n)])
    return {'knownSubtotalUSD':sum(c.values()),'knownPlus30pctReserveUSD':sum(c.values())*D('1.3'),'capacityProven':False,'hostSizingSameAsBaseline':True}
def run():
    outputs=[]
    for name,scenario in SCENARIOS.items():
      for n in [100,1000,10000]:
        model.OPS[:]=copy.deepcopy(BASE_OPS);model.ASSUMPTIONS.clear();model.ASSUMPTIONS.update(copy.deepcopy(BASE_ASSUMPTIONS))
        for op in model.OPS:
            if op['operation'] in scenario.get('ops',{}):op['perUser']=scenario['ops'][op['operation']]
        for src,dst in [('exports','exportsPerUser'),('analyses','deterministicAnalysesPerUser'),('requests','workerRequestsPerUser'),('renderSeconds','renderSeconds'),('blobGB','liveBlobGBPerUser'),('databaseGB','databaseGBPerUser'),('extraAttempts','inferenceExtraAttempts')]:
            if src in scenario:model.ASSUMPTIONS[dst]=scenario[src]
        r=model.calculate(n,no_app_cache=scenario.get('zeroCache',False))
        h=hybrid(r,n)
        outputs.append({'scenario':name,'activeUsers':n,'reason':scenario['reason'],'assumptions':scenario,'managedKnownUSD':r['knownSubtotalUSD'],'hybridKnownUSD':h['knownSubtotalUSD'],'inferenceUSD':r['costsUSD']['inference'],'renderHours':r['renderHours'],'unconstrainedPeakBrowsers':r['unconstrainedPeakBrowsersEstimate'],'capacityProven':False,'businessTotalUSD':None,'providerReportedUsage':None,'actualCostUSD':None})
    model.OPS[:]=BASE_OPS;model.ASSUMPTIONS.clear();model.ASSUMPTIONS.update(BASE_ASSUMPTIONS)
    assert len(outputs)==21
    zero=next(r for r in outputs if r['scenario']=='zero_response_cache' and r['activeUsers']==10000)
    assert round(zero['managedKnownUSD'],2)==D('562.55')
    heavy=next(r for r in outputs if r['scenario']=='heavy_allowance_month' and r['activeUsers']==10000)
    assert heavy['renderHours']==D('875')
    (HERE/'cohort-sensitivities-v1.1.json').write_text(json.dumps(model.normalize({'version':'cohorts-1.1.0','priceVersion':model.DAY,'scenarios':outputs,'limitations':['Same token assumptions across cohorts; no usage observation','Host capacity is not proven and may require upgrade','Paid conversion/free cohort policy unknown; active users are not necessarily paying customers','Monthly allowance reset remains proposed; 6month term never assumed six times usage upfront']}),indent=2)+'\n')
    for r in outputs:
      if r['activeUsers']==10000:print(r['scenario'],'managed',round(r['managedKnownUSD'],2),'hybrid',round(r['hybridKnownUSD'],2),'AI',round(r['inferenceUSD'],2),'renderHours',round(r['renderHours'],2))
    print('PASS 21 new cohort/tail scenarios; zero-cache parity and heavy-render arithmetic; no earlier validation pipeline rerun')
if __name__=='__main__':run()
