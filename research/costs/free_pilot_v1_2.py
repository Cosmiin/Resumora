"""Capacity arithmetic, not actual free-plan provisioning or a zero-cost promise."""
from pathlib import Path
from decimal import Decimal as D
import json
import model_v1_2 as model
HERE=Path(__file__).resolve().parent
LIMITS={'supabaseDBGB':'.5','supabaseStorageGB':'1','supabaseEgressGB':'5','supabaseMAU':50000,'supabaseProjectLimit':2,'inactivePauseDays':7,'workersRequestsPerDay':100000,'workersCPUMsPerRequest':10,'workersMemoryMB':128,'browserSecondsPerDay':600,'browserConcurrentSessions':3,'headroomFraction':'.8','sources':{'supabase':'https://supabase.com/pricing','workers':'https://developers.cloudflare.com/workers/platform/limits/','browser':'https://developers.cloudflare.com/browser-run/pricing/'},'verifiedDate':'2026-10-23'}
def scenario(n):
    # Same monthly activity model; daily average is a bound,not a carry-over entitlement.
    attempts=D(n)*6*D('1.05');seconds=attempts*10;blob=D(n)*D('.01');db=D(n)*D('.0015');egress=D(n)*D('.02')
    requests=D(n)*600/30
    usage={'databaseGB':db,'storageGB':blob,'egressGB':egress,'MAU':n,'requestsPerAverageDay':requests,'browserSecondsPerAverageDay':seconds/30,'browserSecondsIfAllMonthlyExportsSameDay':seconds,'assumedCPUmsPerRequest':50}
    capacity={'database':db<=D(LIMITS['supabaseDBGB']),'storage':blob<=D(LIMITS['supabaseStorageGB']),'egress':egress<=D(LIMITS['supabaseEgressGB']),'auth':n<=LIMITS['supabaseMAU'],'averageRequests':requests<=LIMITS['workersRequestsPerDay'],'averageRendering':seconds/30<=LIMITS['browserSecondsPerDay'],'renderBurst':seconds<=LIMITS['browserSecondsPerDay'],'CPUassumptionFitsFree':False}
    # Backups remain budgeted separately,not removed because app infrastructure might befree.
    ai=D(0)
    for op in model.OPS:
        count=D(op['perUser'])*n*(1-D(op['appCache']))*D('1.05')
        ai+=model.token_cost(model.ASSUMPTIONS['defaultModel'],count*op['input'],0,count*op['output'])*D('1.1')
        if op['operation']=='tailor_full':ai+=model.token_cost(model.ASSUMPTIONS['premiumModel'],count*D('.1')*6000,0,count*D('.1')*1800)*D('1.1')
    backup=(blob+db)*7*D('.015')+D(n)*(50*D('4.5')+40*D('.36'))/D(1000000)
    return {'activeUsers':n,'usage':usage,'fits':capacity,'capacityFitExcludingCPUandBursts':all(v for k,v in capacity.items() if k not in ('CPUassumptionFitsFree','renderBurst')),'operationalFeasibility':'unproven:50msassumption exceeds10msWorkerFree; CPU/memory/parser measurements required','freeInfrastructureSpendUSD':'0 only within verified quotas; not a capacity guarantee','knownAIUSD':ai,'knownSeparateBackupUSD':backup,'conditionalKnownUSD':ai+backup,'completeServiceCostUSD':None,'servedAllDemand':None,'paidFallbackKnownUSD':model.calculate(n)['knownSubtotalUSD'] if n in [100,1000,10000] else None}
def main():
    rows=[scenario(n) for n in [25,100,1000,10000]]
    assert rows[0]['capacityFitExcludingCPUandBursts']
    assert rows[1]['usage']['storageGB']==1 and rows[1]['usage']['browserSecondsPerAverageDay']==210
    assert not rows[2]['fits']['storage'] and not rows[2]['fits']['averageRendering']
    assert D(600)/D(10)==60
    data={'version':'free-pilot-1.2.0','limits':LIMITS,'scenarios':rows,'noAutomaticPaidUpgrade':True,'stopPolicy':'quota reserve before operation; at80%warn/reduce retention,at100%pause upload/render,queue within deadline or manualfallback; owner approves any paid tier','upgradeTriggers':['measuredCPU>10msoroutofmemory','file/db/egressgrowth approaching80%','dailybrowserseconds>600orconcurrency>3','needbackupavailabilitySLA/moreprojects','owner-approvedcost/regionchanges'],'limitations':['OpenAI inference remains paid','No actual provideraccount/provisioning/loadtest','Average rendering does not prove dailyburstfit; no quota carryover','Independentbackups/email/domain/legal/support remainpaid orunknown','SupabaseFree pause andlackofmanageddailybackup needrecoveryplan','Region/privateprocessingterms notapproved byselectingfree']}
    (HERE/'free-pilot-v1.2.json').write_text(json.dumps(model.normalize(data),indent=2)+'\n')
    for r in rows:print(r['activeUsers'],'conditionalAI+backupUSD',round(r['conditionalKnownUSD'],4),'capacityexcludingCPU/burst',r['capacityFitExcludingCPUandBursts'],'CPUunproven50>10ms')
    print('PASS daily/storage/CPU constraints; no free-at-scale or zero-AI-cost claim')
if __name__=='__main__':main()
