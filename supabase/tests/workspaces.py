"""Synthetic native PostgreSQL checks for the Profile persistence boundary."""
import json,unittest,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
uid=lambda:str(uuid.uuid4())
lit=lambda v:"'"+json.dumps(v).replace("'","''")+"'::jsonb"
def suite(db):
 class Workspaces(unittest.TestCase):
  def setUp(self):
   self.a,self.b=uid(),uid();db.sql(f"INSERT INTO auth.users(id) VALUES('{self.a}'),('{self.b}')")
   self.call('provision_workspace',f"'{uid()}'");self.call('provision_workspace',f"'{uid()}'",user=self.b)
   self.payload=json.loads((ROOT/'packages/contracts/fixtures/cv-import.json').read_text())
   self.base=self.call('save_base_draft',f"'{uid()}',0,{lit(self.payload)},'autosave'")
   self.role=self.payload['content']['roles'][0]['id']
   self.secret='synthetic-workspace-worker-secret-at-least-32'
   db.sql(f"INSERT INTO app.ai_worker_authorization VALUES(true,sha256(convert_to('{self.secret}','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=EXCLUDED.secret_hash")
  def raw(self,name,args='',user=None,role='authenticated',error=False):
   if name=='save_workspace_draft' and any("'"+k+"'" in args for k in ['import-review','translation-review']):args+=',0'
   return db.sql(f'SELECT app.{name}({args})',role=role,user=user or self.a,expect_error=error)
  def call(self,*args,**kwargs):
   s=self.raw(*args,**kwargs);return json.loads(s) if s else None
  def test_drafts_are_owned_revisioned_replayable_and_do_not_enqueue_processing(self):
   id,key='00000000-0000-4000-8000-000000000001',uid();value={'route':'#/profile/history'}
   args=f"'{key}','resume','{id}',0,{lit(value)}"
   first=self.call('save_workspace_draft',args);self.assertEqual(first,self.call('save_workspace_draft',args));self.assertEqual(first['revision'],1)
   self.assertIsNone(self.call('get_workspace_draft',f"'resume','{id}'",user=self.b))
   self.assertIn('permission denied',self.raw('get_workspace_draft',f"'resume','{id}'",role='anon',error=True))
   self.assertIn('VERSION_CONFLICT',self.raw('save_workspace_draft',f"'{uid()}','resume','{id}',0,{lit(value)}",error=True))
   self.assertIn('permission denied',db.sql('SELECT * FROM app.workspace_drafts',role='authenticated',user=self.a,expect_error=True))
  def test_receipt_acknowledgements_are_idempotent_and_success_is_never_downgraded(self):
   op=uid();input=dict(snapshotId=self.base['id'],revision=1,targetId=self.role)
   self.call('begin_workspace_operation',f"'{op}','rewrite',{lit(input)}")
   args=f"'{op}','ready',{{result}},'{self.secret}'"
   first=self.call('finish_workspace_operation',args.format(result=lit({'text':'Completed point'})))
   self.assertEqual(first,self.call('finish_workspace_operation',args.format(result=lit({'text':'Completed point'}))))
   self.assertEqual(first,self.call('finish_workspace_operation',f"'{op}','unknown',NULL,'{self.secret}'"))
   self.assertEqual(first,self.call('finish_workspace_operation',f"'{op}','failed',NULL,'{self.secret}'"))
   self.assertIn('IDEMPOTENCY_BODY_MISMATCH',self.raw('finish_workspace_operation',args.format(result=lit({'text':'Replacement'})),error=True))
   self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('finish_workspace_operation',args.format(result=lit({'text':'Completed point'})),user=self.b,error=True))
   self.assertIn('RESOURCE_FORBIDDEN',self.raw('finish_workspace_operation',f"'{op}','ready','{{}}','wrong'",error=True))
  def test_only_proven_legacy_score_failures_are_retired_without_touching_cv_content(self):
   import hashlib
   def stage(parent,phase):
    h=list(hashlib.sha256((parent+':experience-point-'+phase).encode()).hexdigest()[:32]);h[12]='4';h[16]='8';return str(uuid.UUID(''.join(h)))
   before=self.call('load_base_draft')
   parents=[]
   for broken in [True,False]:
    op=uid();parents.append(op);input=dict(snapshotId=self.base['id'],revision=1,targetId=self.role,experience={'intent':'point'})
    self.call('begin_workspace_operation',f"'{op}','rewrite',{lit(input)}")
    self.call('finish_workspace_operation',f"'{op}','unknown',NULL,'{self.secret}'")
    db.sql(f"UPDATE app.career_operation_results SET created_at=now()-interval '5 minutes' WHERE id='{op}'")
    for phase,status in [('0','completed' if broken else 'unknown'),('before-0','completed'),('after-0','failed' if broken else 'unknown')]:
     child=stage(op,phase);self.call('reserve_enhancement',f"'{child}','{self.base['id']}',1,'{self.role}','synthetic','{self.secret}'")
     start={'operationId':child};result={'status':status,'errorCode':'OUTPUT_INVALID' if status=='failed' else None}
     db.sql(f"INSERT INTO app.ai_enhancement_attempts(tenant_id,id,operation_id,start_data,result_data) SELECT tenant_id,'{child}-primary','{child}',{lit(start)},{lit(result)} FROM app.ai_enhancement_operations WHERE id='{child}'")
   db.sql((ROOT/'supabase/migrations/20261101110459_reliable_experience_receipts.sql').read_text())
   self.assertEqual(self.call('get_workspace_operation',f"'{parents[0]}'")['state'],'failed')
   self.assertEqual(self.call('get_workspace_operation',f"'{parents[1]}'")['state'],'unknown')
   self.assertEqual(before,self.call('load_base_draft'))
  def test_completed_point_with_lost_result_is_retryable_but_unknown_provider_work_stays_fenced(self):
   import hashlib
   for completed in [True,False]:
    op=uid();input=dict(snapshotId=self.base['id'],revision=1,targetId=self.role,experience={'intent':'point'})
    self.call('begin_workspace_operation',f"'{op}','rewrite',{lit(input)}")
    h=list(hashlib.sha256((op+':experience-point-0').encode()).hexdigest()[:32]);h[12]='4';h[16]='8';child=str(uuid.UUID(''.join(h)))
    self.call('reserve_enhancement',f"'{child}','{self.base['id']}',1,'{self.role}','synthetic','{self.secret}'")
    result={'status':'completed' if completed else 'unknown'}
    db.sql(f"INSERT INTO app.ai_enhancement_attempts(tenant_id,id,operation_id,start_data,result_data) SELECT tenant_id,'{child}-primary','{child}','{{}}',{lit(result)} FROM app.ai_enhancement_operations WHERE id='{child}'")
    self.assertEqual(self.call('get_workspace_operation',f"'{op}'")['state'],'processing')
    db.sql(f"UPDATE app.career_operation_results SET created_at=now()-interval '5 minutes' WHERE id='{op}'")
    self.assertEqual(self.call('get_workspace_operation',f"'{op}'")['state'],'failed' if completed else 'unknown')
    self.assertEqual(db.sql(f"SELECT state FROM app.career_operation_results WHERE id='{op}'"),'processing')
  def test_profile_removal_purges_new_career_context_and_rejects_late_results(self):
   op=uid();input=dict(snapshotId=self.base['id'],revision=1,targetId=self.role)
   self.call('begin_workspace_operation',f"'{op}','rewrite',{lit(input)}")
   self.call('remove_base_cv',f"'{uid()}',1,0")
   self.assertIsNone(self.call('get_workspace_operation',f"'{op}'"))
   self.call('save_base_draft',f"'{uid()}',2,{lit(self.payload)},'autosave'")
   self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('finish_workspace_operation',f"'{op}','ready','{{}}','{self.secret}'",error=True))
 return unittest.defaultTestLoader.loadTestsFromTestCase(Workspaces)
