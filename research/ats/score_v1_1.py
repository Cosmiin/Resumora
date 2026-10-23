"""ATS-01 1.1 discovery demonstrator. Synthetic structured evidence; no paid AI/NLP backend."""
from pathlib import Path
from decimal import Decimal as D
import json,copy,hashlib
HERE=Path(__file__).resolve().parent
RULES={'version':'compatibility-1.1.0','weightProfile':'baseline-1.1','weights':{'technical':30,'responsibilities':25,'experience':15,'achievements':10,'qualifications':10,'professional':5,'title':5},'priority':{'required':3,'unspecified':2,'preferred':1},'matchStrength':{'demonstrated':'1','claimed_limited':'.75','transferable':'.4','not_evidenced':'0'},'jobFamilyWeights':'future explicitly versioned override; not inferred per request','frequencyBonus':False,'hardScoreCap':False,'readabilityIncluded':False}
CONFIRMED={'user_confirmed','externally_verified'}
def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def number(x):return float(x.quantize(D('.00000001')))
def normalize(raw):
    """Operate on reviewed polarity/canonical IDs, not unconstrained raw-text AI guesses."""
    out={};uncertain=[]
    for r in raw:
        if r.get('polarity','positive')=='not_required':continue
        if r.get('polarity','positive')=='ambiguous':uncertain.append(r['id']);continue
        cid=r.get('canonicalId',r['id']);r=copy.deepcopy(r);r['id']=cid
        if cid in out:
            a=out[cid]
            assert (a['category'],a['priority'],a.get('hardGate',False))==(r['category'],r['priority'],r.get('hardGate',False)),'conflicting requirement classification needs review'
            a['jobEvidence']=sorted(set(a['jobEvidence']+r['jobEvidence']))
        else:out[cid]=r
    return sorted(out.values(),key=lambda r:r['id']),uncertain

def evaluate(x,rules=RULES):
    assert sum(rules['weights'].values())==100
    assert x['versions']['rules']==rules['version']
    reqs,ambiguous=normalize(x['requirements'])
    assert len({r['id'] for r in reqs})==len(reqs)
    assert all(r['category'] in rules['weights'] and r['jobEvidence'] for r in reqs)
    profile_available=x['versions']['profile'] is not None
    def match(r,scope):
        if any(a['requirementId']==r['id'] and a['state']=='confirmed_unmet' for a in x.get('eligibilityAssertions',[])):return D(0),None
        eligible=[]
        for b in x['evidence']:
            if b['requirementId']!=r['id'] or b['scope']!=scope:continue
            if b['claimState'] not in CONFIRMED or not b['claimIds']:continue
            if scope=='cv' and not b['documentItemIds']:continue
            if r.get('alternatives') and b.get('alternativeId') not in r['alternatives']:continue
            strength=D(rules['matchStrength'][b['matchClass']])
            if b['relation']=='approved_equivalent' and r.get('gateKind') in ('credential','authorization') and not r.get('allowEquivalent',False):strength=D(0)
            if b['matchClass']=='transferable' and r.get('gateKind') in ('credential','authorization') and not r.get('allowTransferableEquivalent',False):strength=D(0)
            strength*=D(str(b.get('fulfillment',1)))
            assert 0<=strength<=1
            eligible.append((strength,b))
        return max(eligible,key=lambda z:(z[0],z[1]['id'])) if eligible else (D(0),None)
    def semantic(scope):
        if scope=='profile' and not profile_available:return {'score':None,'reason':'Master profile unavailable; no Candidate Fit inferred','categories':{},'requirements':[]}
        cat={};items=[]
        for name,w in rules['weights'].items():
            rr=[r for r in reqs if r['category']==name]
            if not rr:continue
            denominator=sum((D(rules['priority'][r['priority']])*D(str(r.get('priorityFraction',1))) for r in rr),D(0))
            numerator=D(0)
            for r in rr:
                s,b=match(r,scope);priority=D(rules['priority'][r['priority']])*D(str(r.get('priorityFraction',1)));numerator+=priority*s
                other,_=match(r,'profile') if scope=='cv' and profile_available else (D(0),None)
                if s>0:status='verified_equivalent' if b['relation']=='approved_equivalent' else 'included'
                elif other>0:status='verified_base_omitted'
                elif any(e['requirementId']==r['id'] and e['claimState'] not in CONFIRMED for e in x['evidence']):status='awaiting_confirmation'
                else:status='missing_unsupported'
                items.append({'id':r['id'],'category':name,'priority':number(priority),'matchStrength':number(s),'matchClass':b['matchClass'] if b else 'not_evidenced','status':status,'claimIds':b['claimIds'] if b else [],'documentItemIds':b['documentItemIds'] if b else [],'jobEvidence':r['jobEvidence'],'explanation':b['explanation'] if b else 'No confirmed supporting evidence found; this does not prove absence of ability'})
            cat[name]={'nominalWeight':w,'coverage':numerator/denominator,'denominator':denominator}
        total_weight=sum(c['nominalWeight'] for c in cat.values())
        if not total_weight:return {'score':None,'reason':'No scorable job criteria','categories':{},'requirements':items}
        total=D(0)
        for c in cat.values():
            c['effectiveWeight']=D(100)*c['nominalWeight']/total_weight
            c['contribution']=c['effectiveWeight']*c['coverage'];total+=c['contribution']
        for item in items:
            c=cat[item['category']];item['points']=number(c['effectiveWeight']*D(str(item['priority']))*D(str(item['matchStrength']))/c['denominator'])
        return {'score':float(total.quantize(D('.01'))),'rawScore':number(total),'categories':{k:{kk:number(vv) if isinstance(vv,D) else vv for kk,vv in v.items()} for k,v in cat.items()},'requirements':items}
    gates=[]
    for r in reqs:
        if not r.get('hardGate',False):continue
        s,b=match(r,'profile' if profile_available else 'cv')
        denial=next((a for a in x.get('eligibilityAssertions',[]) if a['requirementId']==r['id'] and a['state']=='confirmed_unmet'),None)
        state='confirmed_requirement_gap' if denial else 'requirements_satisfied' if s==1 else 'needs_verification'
        gates.append({'requirementId':r['id'],'state':state,'jobEvidence':r['jobEvidence'],'claimIds':b['claimIds'] if b else [],'reason':denial['reason'] if denial else 'Identified hard requirement supported' if s==1 else 'Mandatory evidence missing,limited,transferable or unconfirmed'})
    eligibility='confirmed_requirement_gap' if any(g['state']=='confirmed_requirement_gap' for g in gates) else 'needs_verification' if any(g['state']=='needs_verification' for g in gates) or ambiguous else 'requirements_satisfied'
    result={'evaluationId':x['id'],'versions':x['versions'],'rulesHash':digest(rules),'inputHash':digest(x),'requirementsHash':digest(reqs),'weightProfile':rules['weightProfile'],'calibrated':False,'candidateFit':semantic('profile'),'cvMatch':semantic('cv'),'eligibility':{'status':eligibility,'scope':'Only identified non-compensatory job requirements; not legal eligibility certification','hardRequirements':gates,'ambiguities':ambiguous,'persistentOn':['score','comparison','export_preview']},'readability':{'state':'untested','exportId':None},'scoringModel':'none; deterministic replay of accepted structured extraction/matching','evidenceMatcher':x['versions']['matcher']}
    recommendations=[]
    for item in result['cvMatch']['requirements']:
        if item['matchStrength']>=1:continue
        profile_item=next((p for p in result['candidateFit']['requirements'] if p['id']==item['id']),None)
        typ='profile_present_cv_omitted' if item['status']=='verified_base_omitted' else 'insufficiently_demonstrated' if item['matchStrength']>0 else 'not_supported_in_available_profile'
        recommendations.append({'requirementId':item['id'],'type':typ,'jobEvidence':item['jobEvidence'],'availableClaimIds':profile_item['claimIds'] if profile_item else item['claimIds'],'needsConfirmation':not bool(profile_item and profile_item['matchStrength']>0),'action':'Select existing confirmed evidence' if typ=='profile_present_cv_omitted' else 'Describe a real confirmed project/context; ask,do not invent' if typ=='insufficiently_demonstrated' else 'Clarify missing evidence or acknowledge gap; never fabricate','estimatedDelta':None})
    result['recommendations']=recommendations
    return result

def compare(before,after):
    locked=['job','requirements','dictionary','normalizer','matcher','rules','asOf']
    assert all(before['versions'][k]==after['versions'][k] for k in locked),'Before/after inputs are not version-locked'
    assert before['requirementsHash']==after['requirementsHash'],'Requirements changed'
    assert before['rulesHash']==after['rulesHash'] and before['weightProfile']==after['weightProfile'],'Weights/rules changed'
    a,b=before['cvMatch']['score'],after['cvMatch']['score'];same_profile=before['versions']['profile']==after['versions']['profile']
    assert not same_profile or before['candidateFit']['score']==after['candidateFit']['score'],'Same profile cannot gain Candidate Fit from CV edits'
    return {'cvDelta':None if a is None or b is None else round(b-a,2),'profileChanged':not same_profile,'candidateDelta':None if before['candidateFit']['score'] is None or after['candidateFit']['score'] is None else round(after['candidateFit']['score']-before['candidateFit']['score'],2),'causes':[{'requirementId':p['id'],'before':p['matchStrength'],'after':next(q['matchStrength'] for q in after['cvMatch']['requirements'] if q['id']==p['id'])} for p in before['cvMatch']['requirements'] if p['matchStrength']!=next(q['matchStrength'] for q in after['cvMatch']['requirements'] if q['id']==p['id'])]}
def requirement(id,cat,priority='required',**extra):
    return {'id':id,'category':cat,'priority':priority,'text':id,'jobEvidence':['job:sentence:'+id],'polarity':'positive','hardGate':False,'gateKind':None,'allowEquivalent':False,**extra}
def binding(id,scope,**extra):
    return {'id':'evidence_'+scope+'_'+id,'requirementId':id,'scope':scope,'claimIds':['claim_'+id],'documentItemIds':['item_'+id] if scope=='cv' else [],'claimState':'user_confirmed','matchClass':'demonstrated','relation':'exact','explanation':'Synthetic confirmed task/claim supports this requirement',**extra}
def fixture():
    x={'id':'before','versions':{'profile':'profile_confirmed_1','document':'cv_1','job':'job_1','requirements':'requirements_1','dictionary':'ro-en-1.1','normalizer':'normalized-reviewed-1','matcher':'synthetic-reviewed-1','rules':RULES['version'],'asOf':'2026-10-23'},'requirements':[requirement('make','technical'),requirement('airtable','technical'),requirement('zapier','technical','preferred'),requirement('hr','responsibilities','preferred'),requirement('years','experience'),requirement('impact','achievements','unspecified'),requirement('degree','qualifications',hardGate=True,gateKind='credential'),requirement('communication','professional','unspecified'),requirement('positioning','title','unspecified')],'evidence':[],'eligibilityAssertions':[]}
    for r in x['requirements']:
        for scope in ['profile','cv']:
            if scope=='cv' and r['id'] in ['hr','impact']:continue
            kw={'matchClass':'transferable','relation':'transferable'} if r['id']=='zapier' else {'matchClass':'claimed_limited'} if r['id'] in ['communication','positioning'] else {'relation':'approved_equivalent','explanation':'Make and Integromat approved alias; same technology'} if r['id']=='make' else {}
            x['evidence'].append(binding(r['id'],scope,**kw))
    return x

def main():
    before=fixture();after=copy.deepcopy(before);after['id']='after_selection';after['versions']['document']='cv_2';after['evidence']+=[binding('hr','cv'),binding('impact','cv')]
    out={'before':evaluate(before),'after_selection':evaluate(after)};a,b=out['before'],out['after_selection']
    assert a['candidateFit']['score']==94.93 and a['cvMatch']['score']==59.93
    assert b['candidateFit']['score']==94.93 and b['cvMatch']['score']==94.93
    assert b['cvMatch']['categories']['technical']['contribution']==27.42857143
    receipts=[]
    def passed(n,label):receipts.append({'id':n,'criterion':label,'status':'passed'})
    repeated=copy.deepcopy(before);repeated['evidence']*=5
    assert evaluate(repeated)['cvMatch']['score']==a['cvMatch']['score'];passed(1,'Repeated keywords/evidence cannot increase score')
    assert next(i for i in a['cvMatch']['requirements'] if i['id']=='make')['matchStrength']==1;passed(2,'Make/Integromat approved semantic equivalent')
    strict=copy.deepcopy(after);next(e for e in strict['evidence'] if e['scope']=='profile' and e['requirementId']=='degree').update(matchClass='transferable',relation='transferable');strict['evidence']=[e for e in strict['evidence'] if not(e['requirementId']=='degree' and e['scope']=='cv')]
    assert evaluate(strict)['eligibility']['status']=='needs_verification';assert next(i for i in evaluate(strict)['candidateFit']['requirements'] if i['id']=='degree')['matchStrength']==0
    assert next(i for i in a['cvMatch']['requirements'] if i['id']=='zapier')['matchStrength']==.4;passed(3,'Transferable partial credit cannot satisfy strict credential')
    perfect=copy.deepcopy(after)
    for e in perfect['evidence']:e.update(matchClass='demonstrated',relation='exact')
    gap=copy.deepcopy(perfect);gap['id']='missing_credential';gap['evidence']=[e for e in gap['evidence'] if e['requirementId']!='degree'];g=evaluate(gap)
    assert g['candidateFit']['score']==90 and g['eligibility']['status']=='needs_verification'
    denied=copy.deepcopy(gap);denied['eligibilityAssertions']=[{'requirementId':'degree','state':'confirmed_unmet','reason':'User explicitly confirmed required credential not held','actor':'user_demo','sourceId':'interview_denial'}]
    assert evaluate(denied)['eligibility']['status']=='confirmed_requirement_gap';passed(4,'90score retains independent missing/confirmed-gap eligibility')
    rewrite=copy.deepcopy(before);rewrite['versions']['document']='cv_reworded';rewrite['evidence'].reverse();rr=evaluate(rewrite)
    assert rr['candidateFit']['score']==a['candidateFit']['score'] and rr['cvMatch']['score']==a['cvMatch']['score'];passed(5,'Candidate Fit and evidenced CV Match invariant to wording/order alone')
    delta=compare(a,b);assert delta['cvDelta']==35 and delta['candidateDelta']==0;passed(6,'Omitted confirmed evidence improves CV Match only')
    invented=copy.deepcopy(before);invented['evidence'].append(binding('impact','cv',claimState='suggested'))
    assert evaluate(invented)['cvMatch']['score']==a['cvMatch']['score'];passed(7,'Unsupported achievements earn zero')
    sparse=copy.deepcopy(before);sparse['requirements']=[requirement('make','technical')];sparse['evidence']=[binding('make','profile'),binding('make','cv')];sp=evaluate(sparse)
    assert sp['cvMatch']['score']==100 and sp['cvMatch']['categories']['technical']['effectiveWeight']==100;passed(8,'Absent job categories transparently renormalize; missing candidate evidence does not remove category')
    assert abs(sum(c['contribution'] for c in b['cvMatch']['categories'].values())-b['cvMatch']['score'])<.005
    assert abs(sum(i['points'] for i in b['cvMatch']['requirements'])-b['cvMatch']['rawScore'])<.000001
    passed(9,'Category contributions equal total within rounding')
    assert evaluate(before)==a;passed(10,'Identical pinned inputs/rules replay identically')
    assert a['readability']=={'state':'untested','exportId':None};passed(11,'Readability independent and untested')
    assert {c['requirementId'] for c in delta['causes']}=={'hr','impact'};passed(12,'Before/after exposes evidence causes,not phrasing gain')
    # Additional edge contracts: reviewed polarity/duplicate/OR/AND/version lock/missing master.
    missing=copy.deepcopy(before);missing['versions']['profile']=None;assert evaluate(missing)['candidateFit']['score'] is None
    dup=copy.deepcopy(before);dup['requirements'].append(copy.deepcopy(dup['requirements'][0]));assert evaluate(dup)['cvMatch']['score']==a['cvMatch']['score']
    neg=copy.deepcopy(before);neg['requirements']+=[requirement('not_needed','technical',polarity='not_required')];assert evaluate(neg)['cvMatch']['score']==a['cvMatch']['score']
    orgroup=copy.deepcopy(sparse);orgroup['requirements'][0]['alternatives']=['make','zapier']
    for e in orgroup['evidence']:e['alternativeId']='make'
    orgroup['evidence'].append(dict(binding('make','cv',alternativeId='zapier',matchClass='transferable',relation='transferable'),id='evidence_or_partial'))
    assert evaluate(orgroup)['cvMatch']['score']==100
    andgroup=copy.deepcopy(sparse);andgroup['requirements']=[requirement('make','technical',priorityFraction=.5),requirement('airtable','technical',priorityFraction=.5)];andgroup['evidence']=[binding('make','cv'),binding('make','profile')]
    assert evaluate(andgroup)['cvMatch']['categories']['technical']['denominator']==3 and evaluate(andgroup)['cvMatch']['score']==50
    wrong=copy.deepcopy(b);wrong['versions']['job']='job_2'
    try:compare(a,wrong)
    except AssertionError:pass
    else:raise AssertionError('Version lock failed')
    newfacts_before=copy.deepcopy(before);newfacts_before['versions']['profile']='profile_without_impact';newfacts_before['evidence']=[e for e in newfacts_before['evidence'] if not(e['scope']=='profile' and e['requirementId']=='impact')]
    out.update(missing_credential=g,confirmed_gap=evaluate(denied),missing_master=evaluate(missing),before_after=delta,enrichment_comparison=compare(evaluate(newfacts_before),b),acceptance=receipts,edgeChecks=['master_unavailable_null','duplicate_atom','reviewed_negation','OR_once_max','AND_weight_conservation','version_lock_rejection'],limitations=['AI requirement extraction/semantic classification not implemented; reviewed synthetic structured inputs','No predictive validation or employer ATS integration','Same evidence can legitimately satisfy distinct explicit requirements; one primary category per canonical requirement','CV canonical schema1.0.0 unchanged; companion assessment schema1.1 added'])
    (HERE/'rules-v1.1.json').write_text(json.dumps(RULES,indent=2)+'\n')
    (HERE/'fixtures-v1.1.json').write_text(json.dumps({'before':before,'after':after,'missingCredential':gap,'confirmedGap':denied,'missingMaster':missing},indent=2)+'\n')
    (HERE/'worked-examples-v1.1.json').write_text(json.dumps(out,indent=2)+'\n')
    print('PASS12/12 requested criteria +6edge contracts; Candidate94.93; CV59.93→94.93; technical27.42857143/30; strictmissingcredential90/needs_verification; no paid inference')
if __name__=='__main__':main()
