"""Latest CV/search/sent semantics demonstrator. No send,storage service or API."""
from pathlib import Path
import copy,json
from jsonschema import Draft202012Validator,FormatChecker
H=Path(__file__).resolve().parent
s={'type':'string','minLength':1};nullable={'type':['string','null']}
def obj(p):return {'type':'object','properties':p,'required':list(p),'additionalProperties':False}
def arr(v):return {'type':'array','items':v}
schema=json.loads((H/'journey-workspace.schema.json').read_text());schema['properties']['schemaVersion']={'const':'journey-workspace-1.1.0'};schema['$id']='https://schemas.example.invalid/cv/v1/journey-workspace-v1.1.schema.json'
schema['properties']['jobs']=arr(obj({'id':s,'title':s,'company':s}))
schema['properties']['cvVersions']=arr(obj({'id':s,'applicationId':s,'sequence':{'type':'integer','minimum':1},'state':{'enum':['completed','pending','failed','superseded']},'targetJobSnapshotId':nullable,'tailoringOrigin':{'enum':['none','user_selection','ai_assisted']}}))
schema['properties']['sentRecords']=arr(obj({'id':s,'applicationId':s,'cvSnapshotId':s,'recordedAt':{'type':'string','format':'date-time'},'occurredOn':{'type':['string','null'],'format':'date'},'source':{'const':'user_attestation'},'idempotencyKey':s,'retracted':{'type':'boolean'}}))
schema['required']+=['jobs','cvVersions','sentRecords']
x=json.loads((H/'fixtures/journey-mara-workspace.json').read_text());x['schemaVersion']='journey-workspace-1.1.0'
x['jobs']=[{'id':'mara_job_1','title':'Business Systems Analyst — Automation','company':'Northstar People (synthetic)'},{'id':'mara_job_2','title':'Operations Analyst (SQL)','company':'Westport Services (synthetic)'}]
x['applications'].append({'id':'mara_application_2','jobSnapshotId':'mara_job_2','cvSnapshotId':'mara_base_1','exportId':None,'stage':'closed','stageSource':'user_managed','contactIds':[],'nextActionId':None})
x['cvVersions']=[{'id':'mara_job_cv_1','applicationId':'mara_application_1','sequence':1,'state':'completed','targetJobSnapshotId':'mara_job_1','tailoringOrigin':'ai_assisted'},{'id':'mara_job_cv_2','applicationId':'mara_application_1','sequence':2,'state':'completed','targetJobSnapshotId':'mara_job_1','tailoringOrigin':'ai_assisted'},{'id':'mara_cv_pending_3','applicationId':'mara_application_1','sequence':3,'state':'pending','targetJobSnapshotId':'mara_job_1','tailoringOrigin':'ai_assisted'},{'id':'mara_base_2','applicationId':'mara_application_2','sequence':1,'state':'completed','targetJobSnapshotId':None,'tailoringOrigin':'none'}]
x['sentRecords']=[{'id':'sent_mara_2','applicationId':'mara_application_2','cvSnapshotId':'mara_base_1','recordedAt':'2026-10-23T10:15:00Z','occurredOn':'2026-10-18','source':'user_attestation','idempotencyKey':'mark_sent_mara_2','retracted':False}]
V=Draft202012Validator(schema,format_checker=FormatChecker());Draft202012Validator.check_schema(schema)
def validate(x):
 V.validate(x);apps={a['id']:a for a in x['applications']};jobs={j['id'] for j in x['jobs']};contacts={c['id'] for c in x['contacts']};actions={a['id']:a for a in x['nextActions']}
 for a in apps.values():
  assert a['jobSnapshotId'] in jobs and set(a['contactIds'])<=contacts
  assert a['nextActionId'] is None or a['nextActionId'] in actions
 for c in x['cvVersions']:
  assert c['applicationId'] in apps
  assert (c['tailoringOrigin']=='none')==(c['targetJobSnapshotId'] is None)
 for e in x['sentRecords']:assert e['applicationId'] in apps
 assert len({e['idempotencyKey'] for e in x['sentRecords']})==len(x['sentRecords'])
def latest(x,aid):
 cv=max((c for c in x['cvVersions'] if c['applicationId']==aid and c['state']=='completed'),key=lambda c:(c['sequence'],c['id']),default=None)
 if cv is None:return None
 app=next(a for a in x['applications'] if a['id']==aid)
 return {**cv,'tailoringState':'not_tailored' if cv['tailoringOrigin']=='none' else 'tailored','jobVersionStale':cv['targetJobSnapshotId'] is not None and cv['targetJobSnapshotId']!=app['jobSnapshotId']}
def sent_count(x):return len({e['applicationId'] for e in x['sentRecords'] if not e['retracted']})
def search(x,term):
 q=term.strip().casefold();assert len(q)<=200
 jobs={j['id']:j for j in x['jobs']};contacts={c['id']:c for c in x['contacts']};actions={a['id']:a for a in x['nextActions']}
 return [a['id'] for a in x['applications'] if q in (' '.join([jobs[a['jobSnapshotId']]['title'],jobs[a['jobSnapshotId']]['company'],*[contacts[c]['name'] for c in a['contactIds']],actions[a['nextActionId']]['label'] if a['nextActionId'] else ''])).casefold()]
validate(x)
assert latest(x,'mara_application_1')['id']=='mara_job_cv_2'
assert latest(x,'mara_application_1')['tailoringState']=='tailored'
assert latest(x,'mara_application_2')['tailoringState']=='not_tailored'
assert sent_count(x)==1 # closed application still counts;draft+generated/exportnevercounts
changed=copy.deepcopy(x);changed['applications'][0]['exportId']='mock_export_1';changed['applications'][0]['stage']='interview';assert sent_count(changed)==1
changed['cvVersions'].append({'id':'late_old_result','applicationId':'mara_application_1','sequence':4,'state':'superseded','targetJobSnapshotId':'mara_job_1','tailoringOrigin':'ai_assisted'});assert latest(changed,'mara_application_1')['id']=='mara_job_cv_2'
assert search(x,'northstar')==['mara_application_1'] and search(x,'SQL')==['mara_application_2'] and search(x,'Nora')==['mara_application_1']
assert sent_count(x)==1 # independentofsearch
changed=copy.deepcopy(x);changed['sentRecords'][0]['retracted']=True;assert sent_count(changed)==0
changed=copy.deepcopy(x);changed['applications'][0]['jobSnapshotId']='new_job_version';assert latest(changed,'mara_application_1')['jobVersionStale']
for name,mutate in [('silent_tailored',lambda c:c['cvVersions'][0].update(targetJobSnapshotId=None)),('duplicate_sent_retry',lambda c:c['sentRecords'].append(copy.deepcopy(c['sentRecords'][0]))),('unknown_job',lambda c:c['applications'][0].update(jobSnapshotId='unknown_job'))]:
 c=copy.deepcopy(x);mutate(c)
 try:validate(c)
 except Exception:print('REJECT',name)
 else:raise AssertionError(name)
(H/'journey-workspace-v1.1.schema.json').write_text(json.dumps(schema,indent=2)+'\n')
(H/'fixtures/journey-mara-workspace-v1.1.json').write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n')
(H/'workspace-query-worked-v1.json').write_text(json.dumps({'latestApplication1':latest(x,'mara_application_1'),'latestApplication2':latest(x,'mara_application_2'),'sentApplicationCount':sent_count(x),'searchNorthstar':search(x,'Northstar'),'searchSQL':search(x,'SQL'),'noRealMessagesSent':True,'counterMeaning':'Distinct applications explicitly marked sent by user,excluding retracted mistakes;not generatedCV/PDFcount'},indent=2,ensure_ascii=False)+'\n')
print('PASS latestcompleted/tailored/not-tailored/stale/pending/superseded/search/uniqueuser-sent/correction guards +3negativecases;nooutreach')
