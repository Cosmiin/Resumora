"""Discovery-only generator for schema and synthetic fixtures, no application scaffolding."""
from pathlib import Path
import json, copy
HERE=Path(__file__).resolve().parent

def obj(props, required=None):
    return {'type':'object','additionalProperties':False,'properties':props,'required':list(props) if required is None else required}
def arr(item, **kw): return {'type':'array','items':item,**kw}
def ref(name): return {'$ref':'#/$defs/'+name}
def enum(*values): return {'enum':list(values)}
string={'type':'string','minLength':1,'maxLength':20000}
idtype={'type':'string','pattern':'^[a-z][a-z0-9_-]{1,79}$'}
ids=arr(ref('id'),uniqueItems=True)
nullable_id={'oneOf':[ref('id'),{'type':'null'}]}
section_kinds=['identity','summary','professional_skills','technical_skills','experience','education','certifications','projects','achievements','portfolio','languages','leadership','publications','volunteering','custom']
d={
'id':idtype,
'partialDate':obj({'year':{'type':'integer','minimum':1900,'maximum':2200},'month':{'type':'integer','minimum':1,'maximum':12}},['year']),
'location':obj({'city':string,'countryCode':{'type':'string','pattern':'^[A-Z]{2}$'},'address':string},[]),
'metric':obj({'value':{'type':'number'},'unit':string,'baseline':{'type':'number'},'period':string,'qualifier':enum('exact','approximate','range'),'upperValue':{'type':'number'}},['value','unit','qualifier']),
'source':obj({'id':ref('id'),'kind':enum('upload','manual','interview','external_document','job_capture'),'sha256':{'type':'string','pattern':'^[a-f0-9]{64}$'},'label':string,'capturedAt':{'type':'string','format':'date-time'},'extractorVersion':string},['id','kind','label','capturedAt']),
'provenance':obj({'id':ref('id'),'sourceId':ref('id'),'locator':string,'excerpt':string,'extractionConfidence':{'type':'number','minimum':0,'maximum':1}},['id','sourceId','locator']),
'claim':obj({'id':ref('id'),'kind':enum('text','date','location','metric'),'value':{},'status':enum('extracted_unconfirmed','user_confirmed','externally_verified','suggested','rejected'),'provenanceIds':arr(ref('id'),minItems=1,uniqueItems=True),'confirmedAt':{'type':'string','format':'date-time'},'confirmationActor':ref('id'),'verificationMethod':string},['id','kind','value','status','provenanceIds']),
'contact':obj({'id':ref('id'),'kind':enum('email','phone','location','address','linkedin','github','portfolio','other'),'valueClaimId':ref('id'),'visibility':enum('private','export'),'label':string},['id','kind','valueClaimId','visibility']),
'skill':obj({'id':ref('id'),'class':enum('professional','technical'),'labelClaimId':ref('id'),'conceptId':string,'evidenceClaimIds':ids},['id','class','labelClaimId','evidenceClaimIds']),
'employment':obj({'id':ref('id'),'titleClaimId':ref('id'),'companyClaimId':ref('id'),'locationClaimId':nullable_id,'startClaimId':nullable_id,'endClaimId':nullable_id,'ongoing':{'type':'boolean'},'scopeClaimIds':ids,'responsibilityClaimIds':ids,'accomplishmentClaimIds':ids,'metricClaimIds':ids,'skillIds':ids}),
'education':obj({'id':ref('id'),'institutionClaimId':ref('id'),'qualificationClaimId':ref('id'),'fieldClaimId':nullable_id,'locationClaimId':nullable_id,'startClaimId':nullable_id,'endClaimId':nullable_id,'detailClaimIds':ids}),
'optionalEntry':obj({'id':ref('id'),'kind':enum('certifications','projects','achievements','portfolio','languages','leadership','publications','volunteering','custom'),'labelClaimId':ref('id'),'detailClaimIds':ids,'startClaimId':nullable_id,'endClaimId':nullable_id,'linkClaimIds':ids,'metricClaimIds':ids}),
'prose':obj({'id':ref('id'),'kind':enum('summary','bullet','scope','other'),'text':string,'claimIds':arr(ref('id'),minItems=1,uniqueItems=True),'origin':enum('ai_generated','user_authored'),'approval':enum('pending','approved','rejected'),'locale':enum('ro','en'),'generationId':nullable_id}),
'section':obj({'id':ref('id'),'kind':enum(*section_kinds),'label':string,'entryIds':ids,'proseIds':ids,'visible':{'type':'boolean'}}),
'generation':obj({'id':ref('id'),'provider':string,'modelRequested':string,'modelResolved':string,'promptVersion':string,'inputHash':{'type':'string','pattern':'^[a-f0-9]{64}$'},'createdAt':{'type':'string','format':'date-time'}}),
'claimLink':obj({'id':ref('id'),'fromClaimId':ref('id'),'toClaimId':ref('id'),'relation':enum('metric_of','supports','contribution_to','scope_of')}),
'enrichment':obj({'id':ref('id'),'targetEntityId':ref('id'),'attribute':enum('systems','technology','individual_contribution','impact_time','impact_cost','impact_accuracy','impact_revenue','impact_productivity','scale','stakeholders','budget','team','project'),'claimIds':arr(ref('id'),minItems=1,uniqueItems=True)}),
'interview':obj({'id':ref('id'),'question':string,'answerClaimIds':ids,'targetClaimIds':ids,'state':enum('asked','answered_unconfirmed','confirmed','dismissed')}),
}
for kind,ty in [('text',string),('date',ref('partialDate')),('location',ref('location')),('metric',ref('metric'))]:
    d['claim'].setdefault('allOf',[]).append({'if':{'properties':{'kind':{'const':kind}}},'then':{'properties':{'value':ty}}})
d['claim']['allOf'] += [
 {'if':{'properties':{'status':enum('user_confirmed','externally_verified')}},'then':{'required':['confirmedAt','confirmationActor']}},
 {'if':{'properties':{'status':{'const':'externally_verified'}}},'then':{'required':['verificationMethod']}}
]
d['employment']['allOf']=[{'if':{'properties':{'ongoing':{'const':True}}},'then':{'properties':{'endClaimId':{'type':'null'}}}}]
schema=obj({
 'schemaVersion':{'const':'1.0.0'},'snapshotId':ref('id'),'baseCvId':ref('id'),'version':{'type':'integer','minimum':1},'parentSnapshotId':nullable_id,'createdAt':{'type':'string','format':'date-time'},
 'locale':enum('ro','en'),'sources':arr(ref('source')),'provenance':arr(ref('provenance')),'claims':arr(ref('claim')),
 'facts':obj({'nameClaimId':nullable_id,'positioningTitleClaimIds':arr(nullable_id,minItems=2,maxItems=2),'contacts':arr(ref('contact')),'skills':arr(ref('skill')),'employment':arr(ref('employment')),'education':arr(ref('education')),'optionalEntries':arr(ref('optionalEntry'))}),
 'claimLinks':arr(ref('claimLink')),'enrichment':arr(ref('enrichment')),'interviews':arr(ref('interview')),'generatedProse':arr(ref('prose')),'generations':arr(ref('generation')),
 'document':obj({'sectionOrder':ids,'sections':arr(ref('section')),'templateVersionId':nullable_id,'contactIds':ids}),
 'context':obj({'kind':enum('base','tailored'),'baseSnapshotId':nullable_id,'jobSnapshotId':nullable_id,'previousTailoredSnapshotId':nullable_id})
})
schema.update({'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'https://schemas.example.invalid/cv/v1/schema.json','title':'CV Maker canonical snapshot v1 — discovery proposal','$defs':d})
(HERE/'schema.json').write_text(json.dumps(schema,indent=2,ensure_ascii=False)+'\n')
cv={'schemaVersion':'1.0.0','snapshotId':'snapshot_min','baseCvId':'base_demo','version':1,'parentSnapshotId':None,'createdAt':'2026-10-23T10:00:00Z','locale':'ro','sources':[{'id':'source_manual','kind':'manual','label':'Synthetic user entry','capturedAt':'2026-10-23T10:00:00Z'}],'provenance':[{'id':'prov_manual','sourceId':'source_manual','locator':'manual form v1'}],'claims':[],'facts':{'nameClaimId':None,'positioningTitleClaimIds':[None,None],'contacts':[],'skills':[],'employment':[],'education':[],'optionalEntries':[]},'claimLinks':[],'enrichment':[],'interviews':[],'generatedProse':[],'generations':[],'document':{'sectionOrder':['section_identity'],'sections':[{'id':'section_identity','kind':'identity','label':'Profil','entryIds':[],'proseIds':[],'visible':True}],'templateVersionId':None,'contactIds':[]},'context':{'kind':'base','baseSnapshotId':None,'jobSnapshotId':None,'previousTailoredSnapshotId':None}}
def add(c,id,value,kind='text',status='user_confirmed'):
    v={'id':id,'kind':kind,'value':value,'status':status,'provenanceIds':['prov_manual']}
    if status in ('user_confirmed','externally_verified'):v.update({'confirmedAt':'2026-10-23T10:00:00Z','confirmationActor':'user_demo'})
    if status=='externally_verified':v['verificationMethod']='Synthetic certificate checked by user'
    c['claims'].append(v);return id
cv['facts']['nameClaimId']=add(cv,'claim_name','Ana Exemplu')
(HERE/'fixtures/minimal.json').write_text(json.dumps(cv,indent=2,ensure_ascii=False)+'\n')
full=copy.deepcopy(cv);full.update(snapshotId='snapshot_full',version=2,parentSnapshotId='snapshot_min')
f=full['facts']
f['positioningTitleClaimIds']=[add(full,'claim_title_1','Inginer automatizări'),add(full,'claim_title_2','Business Systems Analyst')]
for cid,kind,val,visibility in [('email','email','ana@example.invalid','export'),('address','address','Strada Sintetică 1','private'),('city','location',{'city':'Iași','countryCode':'RO'},'export'),('github','github','https://example.invalid/ana','export')]:
    f['contacts'].append({'id':'contact_'+cid,'kind':kind,'valueClaimId':add(full,'claim_'+cid,val,'location' if kind=='location' else 'text'),'visibility':visibility})
full['document']['contactIds']=['contact_email','contact_city','contact_github']
for sid,label,cl in [('sql','SQL','technical'),('stakeholder','Comunicare cu părțile interesate','professional')]:
    f['skills'].append({'id':'skill_'+sid,'class':cl,'labelClaimId':add(full,'claim_'+sid,label),'conceptId':sid,'evidenceClaimIds':['claim_resp_a']})
for rid,title,company,start,end,ongoing in [('a','Automation Engineer','Firma Sintetică A',{'year':2021,'month':1},{'year':2023,'month':12},False),('b','Systems Analyst','Firma Sintetică B',{'year':2022,'month':6},None,True),('c','Consultant','Firma Sintetică C',{'year':2019},{'year':2020},False)]:
    f['employment'].append({'id':'role_'+rid,'titleClaimId':add(full,'claim_role_'+rid,title),'companyClaimId':add(full,'claim_company_'+rid,company),'locationClaimId':'claim_city','startClaimId':add(full,'claim_start_'+rid,start,'date'),'endClaimId':add(full,'claim_end_'+rid,end,'date') if end else None,'ongoing':ongoing,'scopeClaimIds':[],'responsibilityClaimIds':[add(full,'claim_resp_'+rid,'SQL reporting and stakeholder coordination')],'accomplishmentClaimIds':[add(full,'claim_achievement_'+rid,'Reduced manual report preparation time')],'metricClaimIds':[],'skillIds':['skill_sql','skill_stakeholder']})
f['employment'][0]['metricClaimIds']=[add(full,'claim_metric',{'value':20,'unit':'percent','qualifier':'approximate'},'metric')]
f['education']=[{'id':'edu_demo','institutionClaimId':add(full,'claim_uni','Universitate Sintetică'),'qualificationClaimId':add(full,'claim_degree','BSc'),'fieldClaimId':add(full,'claim_field','Engineering'),'locationClaimId':'claim_city','startClaimId':None,'endClaimId':add(full,'claim_grad',{'year':2018},'date'),'detailClaimIds':[]}]
for kind in ['certifications','projects','achievements','portfolio','languages','leadership','publications','volunteering','custom']:
    st='extracted_unconfirmed' if kind=='certifications' else 'user_confirmed'
    f['optionalEntries'].append({'id':'entry_'+kind,'kind':kind,'labelClaimId':add(full,'claim_'+kind,'Synthetic '+kind,status=st),'detailClaimIds':[],'startClaimId':None,'endClaimId':None,'linkClaimIds':[],'metricClaimIds':[]})
add(full,'claim_suggestion','Managed a team of 50',status='suggested')
add(full,'claim_rejected','Unsupported credential',status='rejected')
full['generatedProse']=[{'id':'prose_summary','kind':'summary','text':'Inginer automatizări cu experiență în SQL și colaborare.','claimIds':['claim_title_1','claim_sql','claim_stakeholder'],'origin':'ai_generated','approval':'approved','locale':'ro','generationId':'generation_demo'},{'id':'prose_bullet','kind':'bullet','text':'Reduced preparation time by approximately 20%.','claimIds':['claim_achievement_a','claim_metric'],'origin':'ai_generated','approval':'pending','locale':'en','generationId':'generation_demo'}]
full['generations']=[{'id':'generation_demo','provider':'synthetic','modelRequested':'fixture','modelResolved':'fixture-v1','promptVersion':'summary-v1','inputHash':'0'*64,'createdAt':'2026-10-23T10:00:00Z'}]
full['claimLinks']=[{'id':'link_metric','fromClaimId':'claim_metric','toClaimId':'claim_achievement_a','relation':'metric_of'}]
full['enrichment']=[{'id':'enrichment_demo','targetEntityId':'role_a','attribute':'impact_time','claimIds':['claim_metric','claim_achievement_a']}]
full['interviews']=[{'id':'interview_demo','question':'What evidence supports the certification?','answerClaimIds':['claim_certifications'],'targetClaimIds':['claim_certifications'],'state':'answered_unconfirmed'}]
for kind,entries,prose in [('summary',[],['prose_summary']),('professional_skills',['skill_stakeholder'],[]),('technical_skills',['skill_sql'],[]),('experience',['role_a','role_b','role_c'],['prose_bullet']),('education',['edu_demo'],[])]+[(k,['entry_'+k],[]) for k in ['certifications','projects','achievements','portfolio','languages','leadership','publications','volunteering','custom']]:
    full['document']['sections'].append({'id':'section_'+kind,'kind':kind,'label':kind.replace('_',' ').title(),'entryIds':entries,'proseIds':prose,'visible':True})
full['document']['sectionOrder']=[s['id'] for s in full['document']['sections']]
(HERE/'fixtures/full-ro.json').write_text(json.dumps(full,indent=2,ensure_ascii=False)+'\n')
tail=copy.deepcopy(full);tail.update(snapshotId='snapshot_tailored',locale='en',parentSnapshotId=None,version=1)
tail['context']={'kind':'tailored','baseSnapshotId':'snapshot_full','jobSnapshotId':'job_snapshot_demo','previousTailoredSnapshotId':None}
tail['document']['sectionOrder'].remove('section_projects');tail['document']['sectionOrder'].insert(1,'section_projects')
for s in tail['document']['sections']:
    if s['kind']=='certifications':s['visible']=False
(HERE/'fixtures/tailored-en.json').write_text(json.dumps(tail,indent=2,ensure_ascii=False)+'\n')
print('Generated schema and 3 synthetic fixtures')
