"""Owned durable workflow and worker-capability checks. Native local PG only."""
import json, unittest, uuid

def suite(db):
 uid=lambda:str(uuid.uuid4())
 lit=lambda v:"'"+json.dumps(v).replace("'","''")+"'::jsonb"
 secret='synthetic-job-worker-secret-at-least-32-characters'
 class Workflow(unittest.TestCase):
  def setUp(self):
   self.a,self.b=uid(),uid()
   db.sql("UPDATE app.job_workflow_operations SET state='cancelled',lease=NULL WHERE state IN ('queued','processing')")
   db.sql(f"INSERT INTO auth.users(id) VALUES('{self.a}'),('{self.b}');INSERT INTO app.ai_worker_authorization VALUES(true,sha256(convert_to('{secret}','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=EXCLUDED.secret_hash")
   self.call('provision_workspace',f"'{uid()}'",user=self.b)
   self.source='Required: build SQL reporting integrations. Remote only from Romania. Preferred Python.'
   self.job=self.call('save_target_job',f"'{uid()}',NULL,NULL,{lit({'text':self.source})},'[]'")
  def raw(self,name,args='',user=None,role='authenticated',error=False):return db.sql(f'SELECT app.{name}({args})',role=role,user=user or (self.a if role=='authenticated' else None),expect_error=error)
  def call(self,*a,**kw):
   s=self.raw(*a,**kw);return json.loads(s) if s else None
  def state(self):return self.call('get_job_workflow',f"'{self.job['id']}'")
  def claim(self):return self.call('claim_job_workflow',f"'{secret}',false",role='anon')
  def finish(self,task,value=None):return self.call('finish_job_workflow',f"'{secret}','{task['lease']}',{lit(value) if value else 'NULL'}, {'NULL' if value else chr(39)+'PROVIDER_UNAVAILABLE'+chr(39)}",role='anon')
  def test_no_base_durable_retry_new_intent_owned_and_no_table_access(self):
   state=self.state();self.assertEqual(state['revision'],1);self.assertEqual(len(state['operations']),1)
   self.assertIsNone(self.job['snapshotId']);self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('get_job_workflow',f"'{self.job['id']}'",user=self.b,error=True))
   self.assertIn('permission denied',db.sql('SELECT * FROM app.job_workflow_operations',role='authenticated',user=self.a,expect_error=True))
   self.assertIn('permission denied',self.raw('get_job_workflow',f"'{self.job['id']}'",role='anon',error=True))
   self.assertIn('RESOURCE_FORBIDDEN',self.raw('claim_job_workflow',"'wrong',false",role='anon',error=True))
   task=self.claim();self.assertEqual(task['text'],self.source);self.assertIsNone(task['base']);self.assertEqual(task['operation']['kind'],'extract')
   self.finish(task);self.assertEqual(self.state()['operations'][0]['state'],'failed');self.assertEqual(self.call('get_target_job',f"'{self.job['id']}'")['intake']['text'],self.source)
  def test_review_fence_and_interruption_never_redispatch(self):
   task=self.claim();db.sql(f"UPDATE app.job_workflow_operations SET started_at=now()-interval '4 minutes' WHERE id='{task['operation']['id']}'")
   self.assertIsNone(self.claim());self.assertEqual(self.state()['operations'][0]['state'],'unknown')
   self.assertIn('VERSION_CONFLICT',self.raw('finish_job_workflow',f"'{secret}','{task['lease']}','{{}}',NULL",role='anon',error=True))
   key=uid();args=f"'{key}','{self.job['id']}','extract',1,NULL"
   a=self.call('request_job_workflow',args);self.assertEqual(a,self.call('request_job_workflow',args))
   self.assertIn('IDEMPOTENCY_BODY_MISMATCH',self.raw('request_job_workflow',f"'{key}','{self.job['id']}','match',1,NULL",error=True))
   self.assertIn('COMMAND_IN_PROGRESS',self.raw('request_job_workflow',f"'{uid()}','{self.job['id']}','extract',1,NULL",error=True))
   t=self.claim();value={'schemaVersion':'vacancy-extraction/3','overview':{},'requirements':[]}
   self.call('review_job_workflow',f"'{uid()}','{self.job['id']}',1,{lit(value)}")
   self.assertEqual(self.state()['revision'],2);self.assertEqual(self.state()['reviewed'],value)
   self.assertIn('VERSION_CONFLICT',self.raw('finish_job_workflow',f"'{secret}','{t['lease']}','{{}}',NULL",role='anon',error=True))
   self.assertEqual(self.call('get_target_job',f"'{self.job['id']}'")['intake']['text'],self.source)
  def test_worker_attempt_account_binding_cancel_and_usage(self):
   t=self.claim();operation=t['operation']['id']
   start={'attemptId':operation+'-primary','operationId':operation,'userId':self.a,'provider':'openrouter','operation':'job_parse','modelRequested':'synthetic','providerScope':'synthetic','requestFingerprint':'a'*64,'startedAt':'2026-10-30T00:00:00Z'}
   args=f"'{secret}','{t['lease']}',{lit(start)},NULL,NULL"
   self.assertTrue(self.call('job_workflow_attempt',args,role='anon')['created']);self.assertFalse(self.call('job_workflow_attempt',args,role='anon')['created'])
   foreign={**start,'userId':self.b};self.assertIn('RESOURCE_FORBIDDEN',self.raw('job_workflow_attempt',f"'{secret}','{t['lease']}',{lit(foreign)},NULL,NULL",role='anon',error=True))
   self.call('cancel_job_workflow',f"'{self.job['id']}','{operation}'")
   self.assertIn('VERSION_CONFLICT',self.raw('job_workflow_attempt',f"'{secret}','{t['lease']}',NULL,'{operation}-primary','{{}}'",role='anon',error=True))
  def test_url_receipt_retry_failed_capture_truth_and_source_versions(self):
   key=uid();args=f"'{key}','https://jobs.ashbyhq.com/synthetic/one'"
   j=self.call('save_target_url',args);self.assertEqual(j,self.call('save_target_url',args));self.assertEqual(j['intake']['text'],'')
   # isolate the URL request after the initial paste fixture.
   db.sql(f"UPDATE app.job_workflow_operations SET state='cancelled' WHERE job_id='{self.job['id']}'")
   t=self.claim();self.assertEqual(t['operation']['kind'],'fetch');self.assertEqual(t['sourceUrl'],'https://jobs.ashbyhq.com/synthetic/one')
   self.finish(t,{'text':self.source+' Reporting and analytics.'})
   fetched=self.call('get_target_job',f"'{j['id']}'");self.assertTrue(fetched['intake']['text'].startswith(self.source))
   state=self.call('get_job_workflow',f"'{j['id']}'");self.assertEqual(len(state['operations']),2);self.assertIsNone(state['extracted'])
 return unittest.defaultTestLoader.loadTestsFromTestCase(Workflow)
