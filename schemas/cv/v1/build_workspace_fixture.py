"""Synthetic companion workspace/application/capture/review contract; no backend."""
from pathlib import Path
import json,copy
from jsonschema import Draft202012Validator,FormatChecker
HERE=Path(__file__).resolve().parent
s={'type':'string','minLength':1};nullable={'type':['string','null']};ids={'type':'array','items':s,'uniqueItems':True}
def obj(p,required=None):return {'type':'object','additionalProperties':False,'properties':p,'required':list(p) if required is None else required}
def arr(x):return {'type':'array','items':x}
def en(*v):return {'enum':list(v)}
contact=obj({'id':s,'name':s,'company':s,'role':s,'channelKind':en('email','link','phone'),'value':s,'sourceKind':{'const':'user_entry'},'purpose':{'const':'application_context'},'private':{'const':True}})
next_action=obj({'id':s,'applicationId':s,'kind':en('review_job','tailor_cv','review_eligibility','send_application','follow_up','prepare_interview'),'label':s,'dueDate':{'type':['string','null'],'format':'date'},'state':en('open','done','cancelled'),'reminderMode':{'const':'none'}})
application=obj({'id':s,'jobSnapshotId':s,'cvSnapshotId':nullable,'exportId':nullable,'stage':en('saved','drafting','applied','interview','offer','closed'),'stageSource':{'const':'user_managed'},'contactIds':ids,'nextActionId':nullable})
linkedin=obj({'id':s,'sourceKind':en('own_user_paste','manual'),'ownProfileAttested':{'const':True},'sourceTextHash':{'type':'string','pattern':'^[a-f0-9]{64}$'},'baseSnapshotId':s,'state':en('draft','queued','review_ready','failed_retryable','dismissed'),'proposedClaimIds':ids,'actualProfileWritten':{'const':False}})
patch=obj({'id':s,'targetSectionId':s,'kind':en('skills','summary','bullet'),'mode':en('append','replace'),'expectedRevision':{'type':'integer','minimum':1},'beforeItemIds':ids,'proposedItemIds':ids,'sourceClaimIds':ids,'state':en('proposed','accepted_in_draft','rejected','undone'),'factsAutomaticallyConfirmed':{'const':False}})
schema=obj({'schemaVersion':{'const':'journey-workspace-1.0.0'},'workspaceId':s,'synthetic':{'const':True},'uiLocale':en('ro','en'),'cvLocale':en('ro','en'),'baseSnapshotId':nullable,'applications':arr(application),'contacts':arr(contact),'nextActions':arr(next_action),'linkedinReviews':arr(linkedin),'draftPatches':arr(patch),'realMessagesSent':{'const':False}})
schema.update({'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'https://schemas.example.invalid/cv/v1/journey-workspace.schema.json','title':'Discovery workspace companion;separatefromcanonicalCV'})
fixture={'schemaVersion':'journey-workspace-1.0.0','workspaceId':'mara_workspace','synthetic':True,'uiLocale':'ro','cvLocale':'en','baseSnapshotId':'mara_base_2','applications':[{'id':'mara_application_1','jobSnapshotId':'mara_job_1','cvSnapshotId':'mara_job_cv_2','exportId':None,'stage':'drafting','stageSource':'user_managed','contactIds':['mara_contact_1'],'nextActionId':'mara_action_1'}],'contacts':[{'id':'mara_contact_1','name':'Nora Example (synthetic)','company':'Northstar People (synthetic)','role':'Recruiter','channelKind':'email','value':'recruitment@example.test','sourceKind':'user_entry','purpose':'application_context','private':True}],'nextActions':[{'id':'mara_action_1','applicationId':'mara_application_1','kind':'review_eligibility','label':'Review right-to-work evidence before preparing the application','dueDate':'2026-10-26','state':'open','reminderMode':'none'}],'linkedinReviews':[{'id':'mara_linkedin_1','sourceKind':'own_user_paste','ownProfileAttested':True,'sourceTextHash':'0'*64,'baseSnapshotId':'mara_base_2','state':'draft','proposedClaimIds':[],'actualProfileWritten':False}],'draftPatches':[{'id':'mara_skills_proposal_1','targetSectionId':'section_technical_skills','kind':'skills','mode':'append','expectedRevision':1,'beforeItemIds':['skill_sql','skill_power'],'proposedItemIds':['skill_api'],'sourceClaimIds':['claim_api'],'state':'proposed','factsAutomaticallyConfirmed':False}],'realMessagesSent':False}
V=Draft202012Validator(schema,format_checker=FormatChecker());Draft202012Validator.check_schema(schema)
def validate(x):
 V.validate(x);apps={a['id']:a for a in x['applications']};contacts={c['id'] for c in x['contacts']};actions={a['id']:a for a in x['nextActions']}
 for a in apps.values():
  assert set(a['contactIds'])<=contacts
  assert a['nextActionId'] is None or a['nextActionId'] in actions and actions[a['nextActionId']]['applicationId']==a['id']
 for a in actions.values():assert a['applicationId'] in apps
 return True
validate(fixture)
for label,mutate in [('cross_application_action',lambda x:x['nextActions'][0].update(applicationId='other_application')),('unknown_contact',lambda x:x['applications'][0]['contactIds'].append('unknown_contact')),('automatic_linkedin_write',lambda x:x['linkedinReviews'][0].update(actualProfileWritten=True)),('invalid_date',lambda x:x['nextActions'][0].update(dueDate='2026-13-45')),('silent_confirmation',lambda x:x['draftPatches'][0].update(factsAutomaticallyConfirmed=True))]:
 x=copy.deepcopy(fixture);mutate(x)
 try:validate(x)
 except Exception:print('REJECT',label)
 else:raise AssertionError(label)
# Scoped selection simulation: facts are not modified by a list-presentation action.
state={'revision':1,'sections':{'technical':['skill_sql','skill_power'],'professional':['skill_stakeholder']},'confirmedClaimIds':['claim_sql','claim_power','claim_stakeholder']}
def apply(st,mode,items,expected):
 assert st['revision']==expected,'revisionconflict';assert mode in ['append','replace']
 x=copy.deepcopy(st);before=x['sections']['technical'][:]
 x['sections']['technical']=list(dict.fromkeys(before+items)) if mode=='append' else list(dict.fromkeys(items));x['revision']+=1
 return x,{'before':before,'after':x['sections']['technical'][:]}
a,h=apply(state,'append',['skill_api','skill_sql'],1);assert a['sections']['technical']==['skill_sql','skill_power','skill_api']
b,h2=apply(state,'replace',['skill_api'],1);assert b['sections']['technical']==['skill_api'] and b['sections']['professional']==state['sections']['professional'] and b['confirmedClaimIds']==state['confirmedClaimIds']
b['sections']['technical']=h2['before'];assert b['sections']==state['sections']
try:apply(a,'append',['skill_other'],1)
except AssertionError:pass
else:raise AssertionError('staleapplyaccepted')
# Creating or completing an export never implies external application submission.
x=copy.deepcopy(fixture);x['applications'][0]['exportId']='demo_export_ref';validate(x);assert x['applications'][0]['stage']=='drafting'
(HERE/'journey-workspace.schema.json').write_text(json.dumps(schema,indent=2)+'\n')
(HERE/'fixtures/journey-mara-workspace.json').write_text(json.dumps(fixture,indent=2,ensure_ascii=False)+'\n')
print('PASS workspace+5negativevariants;append/replace/dedup/Undo/revision/factisolation/export-not-applied guards;syntheticonly')
