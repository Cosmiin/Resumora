"""Current-only job CV lifecycle and destructive-forward preservation proof."""
import json,uuid,unittest,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
uid=lambda:str(uuid.uuid4())
lit=lambda v:"'"+json.dumps(v).replace("'","''")+"'::jsonb"
def prepare_upgrade(db):
 user=uid();db.sql(f"INSERT INTO auth.users(id) VALUES('{user}')")
 source=json.loads((ROOT/'packages/contracts/fixtures/job-editor-import.json').read_text())
 source['content']['referenceProse']=[{'id':'private','text':'PRIVATE_BASE_REFERENCE','approval':'pending','claimIds':[]}]
 source['content']['sources'].append({'id':'private_source','kind':'document','label':'PRIVATE_ORIGINAL_FILE','text':'PRIVATE_BASE_SOURCE'})
 source['answers']=[{'id':'private_answer','targetId':source['content']['roles'][0]['id'],'question':'context','questionText':'PRIVATE_QUESTION','text':'PRIVATE_ANSWER','status':'confirmed','sourceId':'private_source'}]
 call=lambda name,args:json.loads(db.sql(f'SELECT app.{name}({args})',role='authenticated',user=user))
 base=call('save_base_draft',f"'{uid()}',0,{lit(source)},'autosave'")
 job=call('save_target_job',f"'{uid()}','{base['id']}',1,'{{\"text\":\"Required SQL reporting and integrations.\"}}','[]'")
 pin=call('job_editor_context',f"'{job['id']}'")['job']
 payload={'schemaVersion':'resumora-job-editor/1','acceptance':'accepted','source':{'snapshotId':base['id'],'revision':1},'job':pin,'selectedFacts':[],'selectedAnswerIds':[],'wording':[],'presentation':{'summaryText':'OLD_TAILORED_CONTENT_MUST_DISAPPEAR'},'localAdditions':[]}
 first=call('save_job_editor',f"'{uid()}','{job['id']}',NULL,0,{lit(payload)}")
 payload['presentation']['summaryText']='Current accepted summary'
 second=call('save_job_editor',f"'{uid()}','{job['id']}','{first['documentId']}',1,{lit(payload)}")
 db.sql(f"CREATE TABLE test_support.current_job_upgrade(data jsonb);INSERT INTO test_support.current_job_upgrade VALUES({lit({'user':user,'base':base['id'],'job':job['id'],'doc':first['documentId'],'source':source})})")

def suite(db):
 class Current(unittest.TestCase):
  def setUp(self):
   self.a,self.b=uid(),uid();db.sql(f"INSERT INTO auth.users(id) VALUES('{self.a}'),('{self.b}')")
   self.source=json.loads((ROOT/'packages/contracts/fixtures/job-editor-import.json').read_text());self.source['content']['referenceProse']=[];self.source['answers']=[]
   self.base=self.call('save_base_draft',f"'{uid()}',0,{lit(self.source)},'autosave'")
   self.job=self.call('save_target_job',f"'{uid()}','{self.base['id']}',1,'{{\"text\":\"Required SQL\"}}','[]'")
   self.payload=self.call('freeze_job_document',f"'{{}}',{lit(self.source)}",role=None)
   self.call('provision_workspace',f"'{uid()}'",user=self.b)
  def raw(self,name,args='',user=None,role='authenticated',error=False):return db.sql(f'SELECT app.{name}({args})',role=role,user=user or self.a,expect_error=error)
  def call(self,*args,**kw):
   s=self.raw(*args,**kw);return json.loads(s) if s else None
  def save(self,locale='en',payload=None,document=None,revision=0,key=None,user=None,error=False):
   args=f"'{key or uid()}','{self.job['id']}','{locale}',"+(f"'{document}'" if document else 'NULL')+f",{revision},{lit(payload or self.payload)},'{self.base['id']}',NULL,NULL"
   return self.raw('save_current_job_document',args,user=user,error=True) if error else self.call('save_current_job_document',args,user=user)
  def test_forward_retains_only_current_no_base_archive_and_SQL_TS_projection_parity(self):
   row=json.loads(db.sql('SELECT data FROM test_support.current_job_upgrade'));current=self.call('load_current_job_document',f"'{row['job']}',NULL",user=row['user'])
   self.assertEqual(current['payload']['content']['summary']['text'],'Current accepted summary')
   self.assertNotIn('PRIVATE_',json.dumps(current));self.assertNotIn('OLD_TAILORED',db.sql('SELECT payload::text FROM app.job_editor_versions'))
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_editor_versions WHERE document_id='{row['doc']}'"),'1')
   # Exact SQL/TS self-contained conversion with the existing projection.
   script="import {materializeJobDocument} from './packages/contracts/src/jobs/current-document.ts';let s='';for await(const c of process.stdin)s+=c;const i=JSON.parse(s);process.stdout.write(JSON.stringify(materializeJobDocument(i.source,i.payload)));"
   pin=self.call('job_editor_context',f"'{self.job['id']}'")['job'];p={'schemaVersion':'resumora-job-editor/1','acceptance':'accepted','source':{'snapshotId':self.base['id'],'revision':1},'job':pin,'selectedFacts':[],'selectedAnswerIds':[],'wording':[],'presentation':{},'localAdditions':[]}
   result=subprocess.run(['node','--experimental-strip-types','--input-type=module','-e',script],input=json.dumps({'source':self.source,'payload':p}),cwd=ROOT,text=True,capture_output=True,check=True)
   self.assertEqual(json.loads(result.stdout),self.payload)
  def test_overwrite_one_locale_CAS_replay_and_other_locale_independence(self):
   key=uid();first=self.save(key=key);self.assertEqual(first,self.save(key=key));ro=json.loads(json.dumps(self.payload));ro['content']['language']='ro';other=self.save(locale='ro',payload=ro)
   updated=json.loads(json.dumps(self.payload));updated['content']['summary']['text']='Replacement only'
   second=self.save(payload=updated,document=first['documentId'],revision=1)
   self.assertEqual(second['revision'],2);self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_editor_versions WHERE document_id='{first['documentId']}'"),'1')
   self.assertIn('REQUEST_EXPIRED',self.save(key=key,error=True));self.assertIn('VERSION_CONFLICT',self.save(payload=updated,document=first['documentId'],revision=1,error=True))
   self.assertEqual(self.call('load_current_job_document',f"'{self.job['id']}','ro'")['id'],other['id'])
   self.assertEqual(self.call('load_current_job_document',f"'{self.job['id']}',NULL")['id'],second['id'])
  def test_foreign_account_historical_backdoors_and_public_helper_execution_denied(self):
   self.save();self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('load_current_job_document',f"'{self.job['id']}',NULL",user=self.b,error=True))
   self.assertIn('SNAPSHOT_NOT_FOUND',self.save(user=self.b,error=True))
   for name,args in [('job_editor_history',f"'{self.job['id']}','{uid()}',NULL,20"),('restore_job_editor',f"'{uid()}','{self.job['id']}','{uid()}',1,'{uid()}'"),('load_job_editor',f"'{self.job['id']}',NULL,NULL")]:self.assertIn('permission denied',self.raw(name,args,error=True))
   tenant=self.call('provision_workspace',f"'{uid()}'")['tenantId']
   for role in ['authenticated','anon']:self.assertIn('permission denied',self.raw('prepare_job_documents_for_base_removal',f"'{tenant}'",role=role,error=True))
  def test_base_removal_helper_detaches_only_current_and_reopen_save_needs_no_base(self):
   saved=self.save();tenant=self.call('provision_workspace',f"'{uid()}'")['tenantId']
   self.raw('prepare_job_documents_for_base_removal',f"'{tenant}'",role=None)
   # The import-owned destructive command performs actual deletion. Simulate
   # that boundary ONLY in this disposable cluster, never an owner database.
   db.sql(f"ALTER TABLE app.editor_draft_snapshots DISABLE TRIGGER immutable_editor_snapshot;DELETE FROM app.editor_draft_snapshots WHERE id='{self.base['id']}';ALTER TABLE app.editor_draft_snapshots ENABLE TRIGGER immutable_editor_snapshot")
   current=self.call('load_current_job_document',f"'{self.job['id']}',NULL");self.assertEqual(current['id'],saved['id']);self.assertEqual(current['payload']['answers'],[])
   changed=json.loads(json.dumps(current['payload']));changed['content']['summary']['text']='Updated with no Base'
   newer=self.save(payload=changed,document=current['documentId'],revision=1);self.assertEqual(newer['revision'],2)
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_workflow_operations WHERE tenant_id='{tenant}' AND snapshot_id IS NOT NULL"),'0')
 return unittest.defaultTestLoader.loadTestsFromTestCase(Current)
