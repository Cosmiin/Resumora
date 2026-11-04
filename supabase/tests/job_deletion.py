"""Permanent owned job deletion against disposable native PostgreSQL only."""
import json, uuid, unittest
from pathlib import Path
uid=lambda:str(uuid.uuid4())
lit=lambda v:"'"+json.dumps(v).replace("'","''")+"'::jsonb"
def suite(db):
 class Deletion(unittest.TestCase):
  def setUp(self):
   self.a,self.b=uid(),uid();db.sql(f"INSERT INTO auth.users(id) VALUES('{self.a}'),('{self.b}')")
   self.call('provision_workspace',f"'{uid()}'",user=self.b)
   self.source=json.loads((Path(__file__).resolve().parents[2]/'packages/contracts/fixtures/job-editor-import.json').read_text())
   self.base=self.call('save_base_draft',f"'{uid()}',0,{lit(self.source)},'autosave'")
   self.key=uid();self.job=self.call('save_target_job',f"'{self.key}',NULL,NULL,'{{\"text\":\"PRIVATE_DELETED_ADVERT SQL\"}}','[]'")
   self.other=self.call('save_target_job',f"'{uid()}',NULL,NULL,'{{\"text\":\"Keep this advert\"}}','[]'")
   self.tenant=db.sql(f"SELECT tenant_id FROM app.jobs WHERE id='{self.job['id']}'")
  def raw(self,name,args='',user=None,role='authenticated',error=False):return db.sql(f'SELECT app.{name}({args})',role=role,user=user or (self.a if role=='authenticated' else None),expect_error=error)
  def call(self,*args,**kwargs):
   v=self.raw(*args,**kwargs);return json.loads(v) if v else None
  def delete(self,key=None):return self.call('delete_target_job',f"'{key or uid()}','{self.job['id']}'")
  def test_owned_draft_translations_profile_other_job_and_replay(self):
   payload=json.loads(db.sql(f"SELECT app.freeze_job_document('{{}}',{lit(self.source)})"))
   photo=uid();db.sql(f"INSERT INTO app.photo_assets(id,tenant_id,object_key,sha256,width,height,byte_size,state) VALUES('{photo}','{self.tenant}','{self.tenant}/{photo}.jpg',repeat('a',64),256,256,100,'ready')")
   payload['content']['presentation']['photo']={'assetId':photo,'crop':{'version':1,'centerX':0.5,'centerY':0.5,'zoom':1},'shape':'circle','visible':True}
   for locale in ['en','fr']:
    payload['content']['language']=locale;payload['content']['documentLocale']=locale
    self.call('save_current_job_document',f"'{uid()}','{self.job['id']}','{locale}',NULL,0,{lit(payload)},'{self.base['id']}',NULL,NULL")
   self.call('link_job_source_version',f"'{uid()}','{self.other['id']}','{self.job['id']}',1")
   before=db.sql(f"SELECT payload FROM app.editor_draft_snapshots WHERE id='{self.base['id']}'")
   key=uid();self.assertEqual(self.delete(key),{'jobId':self.job['id'],'deleted':True});self.assertEqual(self.delete(key),self.delete(key))
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.jobs WHERE id='{self.job['id']}'"),'0')
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_editor_versions WHERE job_id='{self.job['id']}'"),'0')
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_editor_documents WHERE job_id='{self.job['id']}'"),'0')
   self.assertEqual(db.sql(f"SELECT payload FROM app.editor_draft_snapshots WHERE id='{self.base['id']}'"),before)
   self.assertEqual(db.sql(f"SELECT state FROM app.photo_assets WHERE id='{photo}'"),'ready')
   self.assertIsNone(self.call('get_job_workflow',f"'{self.other['id']}'")['sourceParentId'])
   self.assertIn('IDEMPOTENCY_BODY_MISMATCH',self.raw('delete_target_job',f"'{key}','{self.other['id']}'",error=True))
   self.assertIn('REQUEST_EXPIRED',self.raw('save_target_job',f"'{self.key}',NULL,NULL,'{{\"text\":\"PRIVATE_DELETED_ADVERT SQL\"}}','[]'",error=True))
  def test_foreign_unknown_permissions_and_atomic_rollback(self):
   self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('delete_target_job',f"'{uid()}','{self.job['id']}'",user=self.b,error=True))
   self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('delete_target_job',f"'{uid()}','{uid()}'",error=True))
   self.assertIn('permission denied',self.raw('delete_target_job',f"'{uid()}','{self.job['id']}'",role='anon',error=True))
   db.sql(f"BEGIN;SELECT app.delete_target_job('{uid()}','{self.job['id']}');SELECT 1/0;COMMIT",user=self.a,role='authenticated',expect_error=True)
   self.assertIsNotNone(self.call('get_target_job',f"'{self.job['id']}'"))
   self.assertIn('IMMUTABLE_RECORD',db.sql(f"DELETE FROM app.editor_draft_snapshots WHERE id='{self.base['id']}'",expect_error=True))
  def test_confirmed_job_canonical_analysis_preserves_published_profile(self):
   import importlib.util
   path=Path(__file__).with_name('behavior.py');spec=importlib.util.spec_from_file_location('deletion_behavior',path);behavior=importlib.util.module_from_spec(spec);spec.loader.exec_module(behavior);behavior.DB=db
   profile=behavior.Profiles();profile.a=self.a
   published=profile.publish(behavior.canonical_fixture('minimal.json',self.a))
   reviewed=self.call('review_target_job',f"'{uid()}','{self.job['id']}','SQL role','Company','[{{\"text\":\"SQL\",\"priority\":\"required\"}}]'")
   version=reviewed['versionId']
   app=self.call('save_application',f"'{uid()}',NULL,0,'{version}',NULL,NULL,'saved'")
   self.call('save_next_action',f"'{uid()}','{app['applicationId']}',NULL,0,'follow_up','Check application',NULL,'open'")
   analysis=self.call('publish_analysis',f"'{uid()}','{published['profileVersionId']}','{published['baseCvVersionId']}','{version}','[]','[]','2026-11-03','en'")
   tables=['career_profiles','career_entities','claims','claim_provenance','confirmation_events','entity_revisions','profile_versions','profile_version_claims','profile_version_entities','editor_draft_snapshots','cv_documents','cv_versions','cv_sections','cv_items']
   snapshot=lambda:{t:db.sql(f"SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM app.{t} x WHERE tenant_id='{self.tenant}'") for t in tables}
   before=snapshot();self.delete();self.assertEqual(snapshot(),before)
   for table in ['job_captures','job_versions','job_requirements','requirement_atoms','source_documents','source_spans','applications','application_events','analysis_runs','analysis_components','evidence_mappings','match_evidence','recommendations']:
    scope=f" AND job_id='{self.job['id']}'" if table in ['source_documents','source_spans'] else ''
    self.assertEqual(db.sql(f"SELECT count(*) FROM app.{table} WHERE tenant_id='{self.tenant}'{scope}"),'0',table)
   self.assertIn('IMMUTABLE_RECORD',db.sql(f"DELETE FROM app.profile_versions WHERE id='{published['profileVersionId']}'",expect_error=True))
  def test_intake_career_translation_and_late_worker_fences_keep_usage(self):
   secret='synthetic-deletion-ai-worker-secret-32-characters'
   db.sql(f"INSERT INTO app.ai_worker_authorization VALUES(true,sha256(convert_to('{secret}','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=excluded.secret_hash;UPDATE app.job_workflow_operations SET state='cancelled' WHERE job_id<>'{self.job['id']}'")
   task=self.call('claim_job_workflow',f"'{secret}',false",role='anon');self.assertEqual(task['jobId'],self.job['id'])
   op=task['operation']['id'];start={'attemptId':op+'-primary','operationId':op,'userId':self.a,'provider':'openrouter','operation':'job_parse','modelRequested':'synthetic','providerScope':'synthetic','requestFingerprint':'a'*64,'startedAt':'2026-11-03T00:00:00Z'}
   self.call('job_workflow_attempt',f"'{secret}','{task['lease']}',{lit(start)},NULL,NULL",role='anon')
   usage={'status':'completed','inputTokens':120,'outputTokens':30,'costUsd':0.001}
   self.call('job_workflow_attempt',f"'{secret}','{task['lease']}',NULL,'{op}-primary',{lit(usage)}",role='anon')
   intake,proposal,career=uid(),uid(),uid()
   db.sql(f"INSERT INTO app.workspace_drafts VALUES('{self.tenant}','intake','{intake}',1,'{{\"text\":\"PRIVATE_DELETED_ADVERT SQL\"}}',now(),'{self.job['id']}');INSERT INTO app.document_language_proposals(tenant_id,id,request,state,output) VALUES('{self.tenant}','{proposal}',{lit({'source':{'kind':'job','jobId':self.job['id'].upper()}})},'processing','{{\"private\":true}}')")
   career_input={'snapshotId':self.base['id'],'revision':1,'jobId':self.job['id'].upper()}
   self.call('begin_workspace_operation',f"'{career}','questions',{lit(career_input)}")
   self.delete()
   self.assertIn('VERSION_CONFLICT',self.raw('finish_job_workflow',f"'{secret}','{task['lease']}','{{}}',NULL",role='anon',error=True))
   self.assertIn('VERSION_CONFLICT',self.raw('job_workflow_attempt',f"'{secret}','{task['lease']}',NULL,'{op}-primary','{{}}'",role='anon',error=True))
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.ai_enhancement_attempts WHERE operation_id='{op}'"),'1')
   self.assertEqual(json.loads(db.sql(f"SELECT result_data FROM app.ai_enhancement_attempts WHERE operation_id='{op}'")),usage)
   self.assertEqual(db.sql(f"SELECT job_id IS NULL AND base_removed AND target_id='deleted-job' FROM app.ai_enhancement_operations WHERE id='{op}'"),'t')
   self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('finish_workspace_operation',f"'{career}','ready','{{}}','{secret}'",error=True))
   self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('begin_workspace_operation',f"'{career}','questions',{lit(career_input)}",error=True))
   self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('submit_workspace_intake',f"'{uid()}','{intake}',1",error=True))
   self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('save_workspace_draft',f"'{uid()}','intake','{intake}',0,'{{\"text\":\"stale original\"}}',NULL",error=True))
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.document_language_proposals WHERE id='{proposal}'"),'0')
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_purge_rows WHERE tenant_id='{self.tenant}'"),'0')
  def test_concurrent_delete_receipts_and_mid_purge_failure_are_atomic(self):
   import concurrent.futures
   payload=json.loads(db.sql(f"SELECT app.freeze_job_document('{{}}',{lit(self.source)})"))
   saved=self.call('save_current_job_document',f"'{uid()}','{self.job['id']}','en',NULL,0,{lit(payload)},'{self.base['id']}',NULL,NULL")
   db.sql("CREATE FUNCTION test_support.reject_job_delete() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic mid-purge failure';END$$;CREATE TRIGGER reject_job_delete BEFORE DELETE ON app.job_editor_versions FOR EACH ROW EXECUTE FUNCTION test_support.reject_job_delete()")
   key=uid()
   try:self.assertIn('synthetic mid-purge failure',self.raw('delete_target_job',f"'{key}','{self.job['id']}'",error=True))
   finally:db.sql('DROP TRIGGER reject_job_delete ON app.job_editor_versions;DROP FUNCTION test_support.reject_job_delete()')
   self.assertEqual(self.call('load_current_job_document',f"'{self.job['id']}','en'")['id'],saved['id'])
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_deletion_fences WHERE tenant_id='{self.tenant}'"),'0')
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:receipts=list(pool.map(lambda _:self.delete(key),range(2)))
   self.assertEqual(receipts,[{'jobId':self.job['id'],'deleted':True}]*2)
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.audit_events WHERE tenant_id='{self.tenant}' AND action='job.deleted'"),'1')
  def test_claim_and_delete_use_one_tenant_lock_order(self):
   import concurrent.futures, subprocess, time
   secret='synthetic-concurrent-job-worker-secret-32-characters';latch=173015147
   db.sql(f"INSERT INTO app.ai_worker_authorization VALUES(true,sha256(convert_to('{secret}','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=excluded.secret_hash;UPDATE app.job_workflow_operations SET state='cancelled' WHERE job_id<>'{self.job['id']}'")
   db.sql("CREATE FUNCTION test_support.pause_claim() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.job_id::text=TG_ARGV[0] AND NEW.state='processing' THEN PERFORM pg_advisory_xact_lock(173015147);END IF;RETURN NEW;END$$;"+f"CREATE TRIGGER pause_claim BEFORE UPDATE ON app.job_workflow_operations FOR EACH ROW EXECUTE FUNCTION test_support.pause_claim('{self.job['id']}')")
   blocker=subprocess.Popen(db.command(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=db.env,text=True)
   blocker.stdin.write(f"SELECT pg_advisory_lock({latch});\\echo latch_ready\n");blocker.stdin.flush()
   while blocker.stdout.readline().strip()!='latch_ready':pass
   try:
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
     claim=pool.submit(self.call,'claim_job_workflow',f"'{secret}',false",role='anon')
     deadline=time.monotonic()+5
     while db.sql(f"SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid={latch} AND NOT granted")=='0':
      if time.monotonic()>deadline:self.fail('Claim did not reach operation latch')
      time.sleep(0.01)
     deletion=pool.submit(self.delete)
     deadline=time.monotonic()+5
     while db.sql("SELECT count(*) FROM pg_stat_activity WHERE query LIKE 'SELECT app.delete_target_job(%' AND wait_event_type='Lock'")=='0':
      if time.monotonic()>deadline:self.fail('Delete did not wait for the paused claim')
      time.sleep(0.01)
     blocker.stdin.write(f"SELECT pg_advisory_unlock({latch});\\q\n");blocker.stdin.flush()
     self.assertEqual(claim.result(timeout=5)['jobId'],self.job['id'])
     self.assertTrue(deletion.result(timeout=5)['deleted'])
     blocker.wait(timeout=5)
   finally:
    if blocker.poll() is None:blocker.kill();blocker.wait(timeout=5)
    db.sql('DROP TRIGGER pause_claim ON app.job_workflow_operations;DROP FUNCTION test_support.pause_claim()')
  def test_review_receipt_without_job_identity_is_scrubbed_and_other_review_replays(self):
   # Historical workflow migrations deliberately did not enqueue extraction.
   db.sql(f"DELETE FROM app.job_workflow_operations WHERE job_id IN ('{self.job['id']}','{self.other['id']}')")
   value={'schemaVersion':'vacancy-extraction/3','overview':{'description':'PRIVATE_REVIEW_WITHOUT_IDS'},'requirements':[]}
   key,other_key=uid(),uid();args=f"'{key}','{self.job['id']}',1,{lit(value)}"
   reviewed=self.call('review_job_workflow',args)
   self.assertEqual(reviewed['operations'],[]);self.assertEqual(reviewed['duplicates'],[])
   other_args=f"'{other_key}','{self.other['id']}',1,{lit(value)}";other_receipt=self.call('review_job_workflow',other_args)
   db.sql(f"DELETE FROM app.job_request_links WHERE tenant_id='{self.tenant}' AND job_id='{self.job['id']}'") # pre-migration receipt had no association
   self.delete()
   self.assertIn('REQUEST_EXPIRED',self.raw('review_job_workflow',args,error=True))
   self.assertEqual(self.call('review_job_workflow',other_args),other_receipt)
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.idempotency_requests WHERE tenant_id='{self.tenant}' AND result_refs::text LIKE '%PRIVATE_REVIEW_WITHOUT_IDS%'"),'1')
  def test_autosave_waits_before_taking_workflow_lock_during_delete(self):
   import concurrent.futures, subprocess, time
   payload=json.loads(db.sql(f"SELECT app.freeze_job_document('{{}}',{lit(self.source)})"))
   args=f"'{uid()}','{self.job['id']}','en',NULL,0,{lit(payload)},'{self.base['id']}',NULL,NULL"
   owner=subprocess.Popen(db.command(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=db.env,text=True)
   owner.stdin.write(f"BEGIN;SELECT id FROM app.tenants WHERE id='{self.tenant}' FOR UPDATE;\\echo tenant_ready\n");owner.stdin.flush()
   while owner.stdout.readline().strip()!='tenant_ready':pass
   try:
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
     save=pool.submit(self.raw,'save_current_job_document',args,error=True)
     deadline=time.monotonic()+5
     while db.sql("SELECT count(*) FROM pg_stat_activity WHERE query LIKE 'SELECT app.save_current_job_document(%' AND wait_event_type='Lock'")=='0':
      if time.monotonic()>deadline:self.fail('Autosave did not wait on the tenant boundary')
      time.sleep(0.01)
     # NOWAIT proves autosave has not grabbed workflow before waiting on tenant.
     owner.stdin.write(f"SELECT job_id FROM app.job_workflows WHERE job_id='{self.job['id']}' FOR UPDATE NOWAIT;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{self.a}',true);SELECT app.delete_target_job('{uid()}','{self.job['id']}');COMMIT;\\q\n");owner.stdin.flush()
     stdout,stderr=owner.communicate(timeout=5)
     self.assertEqual(owner.returncode,0,stderr)
     self.assertIn('SNAPSHOT_NOT_FOUND',save.result(timeout=5))
   finally:
    if owner.poll() is None:owner.kill();owner.wait(timeout=5)
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_editor_versions WHERE job_id='{self.job['id']}'"),'0')
  def test_legacy_action_and_source_link_receipts_without_current_job_identity_are_scrubbed(self):
   db.sql(f"DELETE FROM app.job_workflow_operations WHERE job_id='{self.job['id']}';UPDATE app.job_workflows SET reviewed='{{\"private\":\"PRIVATE_LEGACY_ACTION_LINK\"}}' WHERE job_id='{self.job['id']}'")
   action_args=f"'{uid()}','{self.job['id']}',1,'legacy_requirement','include'"
   link_args=f"'{uid()}','{self.job['id']}','{self.other['id']}',1"
   for name,args in [('job_workflow_action',action_args),('link_job_source_version',link_args)]:
    receipt=self.call(name,args);self.assertEqual(receipt['operations'],[])
    self.assertNotIn(self.job['id'],json.dumps(receipt))
   db.sql(f"DELETE FROM app.job_request_links WHERE tenant_id='{self.tenant}' AND job_id='{self.job['id']}'")
   self.delete()
   for name,args in [('job_workflow_action',action_args),('link_job_source_version',link_args)]:
    self.assertIn('REQUEST_EXPIRED',self.raw(name,args,error=True))
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.idempotency_requests WHERE tenant_id='{self.tenant}' AND result_refs::text LIKE '%PRIVATE_LEGACY_ACTION_LINK%'"),'0')
   self.assertIsNotNone(self.call('get_target_job',f"'{self.other['id']}'"))
  def test_capture_retry_and_inflight_completion_cannot_recreate_job(self):
   secret='synthetic-deletion-capture-secret-32-characters';request,device=uid(),uid();extension='a'*32;token='1'*64
   db.sql(f"INSERT INTO app.capture_worker_authorization VALUES(true,sha256(convert_to('{secret}','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=excluded.secret_hash;INSERT INTO app.capture_connections(tenant_id,user_id,extension_id,device_id,session_hash,challenge,token_hash,token_until,expires_at) VALUES('{self.tenant}','{self.a}','{extension}','{device}','{'2'*64}','{'a'*43}','{token}',now()+interval '5 minutes',now()+interval '1 hour')")
   body={'requestId':request,'snapshot':{'text':'Private captured original advert','sourceUrl':'https://example.invalid/delete','parserVersion':'1'}}
   args=f"'{secret}','save','{extension}','{device}','{token}',{lit(body)}"
   captured=self.call('capture_command',args,role='anon');self.job={'id':captured['jobId']}
   lease=self.call('claim_capture',f"'{secret}'",role='anon')['lease'];self.delete()
   self.assertIn('CAPTURE_STALE',self.raw('finish_capture',f"'{secret}','{lease}','{{}}'",role='anon',error=True))
   self.assertIn('REQUEST_EXPIRED',self.raw('capture_command',args,role='anon',error=True))
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.capture_operations WHERE request_id='{request}'"),'0')
 return unittest.defaultTestLoader.loadTestsFromTestCase(Deletion)
