"""Discovery-only document review completion rubric. No semantic/hiring/PDF score."""
from pathlib import Path
from decimal import Decimal as D
import json,copy,hashlib
HERE=Path(__file__).resolve().parent
RUBRIC={'version':'readiness-review-1.0.0','approved':False,'meaning':'Completion of explicit document review checks,not writing quality,job suitability,legal eligibility or PDF extraction','categories':{
 'content':{'weight':20,'checks':['identity_contact_confirmed','positioning_reviewed','supported_summary_reviewed','skill_groups_reviewed','experience_or_education_reviewed']},
 'structure':{'weight':20,'checks':['canonical_schema_valid','date_precision_preserved','section_order_reviewed','private_contacts_excluded']},
 'job_optimization':{'weight':20,'checks':['job_requirements_reviewed','relevant_selection_reviewed','hard_gaps_reviewed','job_cv_version_pinned'],'applicable':'job_available'},
 'writing':{'weight':20,'checks':['document_language_reviewed','unsupported_claims_absent','selected_bullet_reviewed','metrics_sourced_or_omitted']},
 'application':{'weight':20,'checks':['chosen_cv_reviewed','contact_visibility_reviewed','next_action_recorded','application_state_user_managed'],'applicable':'application_started'}},'naRule':'Only explicitcontextabsence;neverremovebecausecheckfailed','pendingRule':'Applicablependingcountsunfinished;showcoverage/Notassessed,notbadquality','semanticScoresAffected':False,'readabilityIncluded':False}
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def review(x):
 if not x['baseSnapshotId']:return {'score':None,'state':'not_assessed','reason':'No Base draft/snapshot yet','rubricVersion':RUBRIC['version'],'categories':{}}
 cats={};active=[]
 for name,c in RUBRIC['categories'].items():
  context=c.get('applicable');applicable=not context or x['context'][context]
  if not applicable:cats[name]={'state':'not_applicable','reason':context+' is false','nominalWeight':c['weight'],'effectiveWeight':0,'score':None,'checks':[]};continue
  checks=[]
  for flag in c['checks']:
   val=x['checks'].get(flag)
   assert val is True or val is False or val is None,'NA cannot be client-chosen for applicablecheck'
   checks.append({'id':flag,'state':'pass' if val is True else 'fail' if val is False else 'pending','sourceSnapshotId':x['baseSnapshotId']})
  passed=sum(i['state']=='pass' for i in checks);pending=sum(i['state']=='pending' for i in checks)
  cats[name]={'state':'not_assessed' if pending==len(checks) else 'pending' if pending else 'reviewed','nominalWeight':c['weight'],'score':round(100*passed/len(checks),2),'passed':passed,'applicable':len(checks),'pending':pending,'checks':checks};active.append(name)
 weight=sum(cats[k]['nominalWeight'] for k in active);score=D(0)
 for k in active:
  c=cats[k];effective=D(100)*c['nominalWeight']/weight;c['effectiveWeight']=float(effective);score+=effective*D(c['passed'])/c['applicable']
 total=sum(cats[k]['applicable'] for k in active);pending=sum(cats[k]['pending'] for k in active)
 return {'score':float(score.quantize(D('.01'))),'label':'Document review completion — proposed rubric','state':'not_assessed' if pending==total else 'pending' if pending else 'reviewed','rubricVersion':RUBRIC['version'],'rubricHash':digest(RUBRIC),'inputHash':digest(x),'contextSignature':digest(x['context']),'context':x['context'],'baseSnapshotId':x['baseSnapshotId'],'categories':cats,'assessedChecks':total-pending,'applicableChecks':total,'pendingChecks':pending,'eligibility':x['eligibility'],'pdfReadability':x['pdfReadability'],'caveat':'High review completion does not establish Candidate Fit,CV Match,eligibility or tested PDF readability;context changes are not comparable score gains'}
def main():
 flags={flag:True for c in RUBRIC['categories'].values() for flag in c['checks']}
 initial={'id':'mara_initial_base','baseSnapshotId':'mara_base_1','context':{'job_available':False,'application_started':False},'checks':copy.deepcopy(flags),'eligibility':'not_assessed_no_job','pdfReadability':'untested'}
 for f in ['supported_summary_reviewed','skill_groups_reviewed','selected_bullet_reviewed']:initial['checks'][f]=False
 improved=copy.deepcopy(initial);improved.update(id='mara_reviewed_base',baseSnapshotId='mara_base_2');improved['checks']=copy.deepcopy(flags)
 job=copy.deepcopy(improved);job['id']='mara_job_review_pending';job['context']['job_available']=True
 for f in RUBRIC['categories']['job_optimization']['checks']:job['checks'][f]=None
 application=copy.deepcopy(improved);application.update(id='mara_application_reviewed',eligibility='needs_verification');application['context']={'job_available':True,'application_started':True}
 fixtures=[initial,improved,job,application];results={x['id']:review(x) for x in fixtures}
 assert results['mara_initial_base']['score']==78.33
 assert results['mara_reviewed_base']['score']==100
 assert results['mara_initial_base']['categories']['job_optimization']['state']=='not_applicable'
 assert results['mara_job_review_pending']['categories']['job_optimization']['state']=='not_assessed'
 assert results['mara_application_reviewed']['score']==100 and results['mara_application_reviewed']['eligibility']=='needs_verification' and results['mara_application_reviewed']['pdfReadability']=='untested'
 qualitative=copy.deepcopy(improved);qualitative['checks']['metrics_sourced_or_omitted']=True;assert review(qualitative)['score']==100
 pending=copy.deepcopy(initial);pending['checks']={k:None for k in flags};assert review(pending)['state']=='not_assessed'
 missing=copy.deepcopy(initial);missing['baseSnapshotId']=None;assert review(missing)['score'] is None
 duplicate=copy.deepcopy(improved);duplicate['documentWordRepetition']=100;assert review(duplicate)['score']==100
 assert review(initial)==results['mara_initial_base']
 (HERE/'readiness-rubric-v1.json').write_text(json.dumps(RUBRIC,indent=2)+'\n')
 (HERE/'readiness-fixtures-v1.json').write_text(json.dumps(fixtures,indent=2)+'\n')
 (HERE/'readiness-worked-v1.json').write_text(json.dumps(results,indent=2)+'\n')
 print('PASS10readinesschecks;Base78.33→100;job/appNAandpendingexplicit;100reviewedcanretaineligibilityneedsverification/PDFuntested;notsemanticquality')
if __name__=='__main__':main()
